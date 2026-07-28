import { GoogleGenerativeAI } from "@google/generative-ai";
import { Buffer } from "node:buffer";
import { IMAGE_SLOT_CONFIG } from "../config/imageSlots.config.js";
import { mapWithConcurrency } from "../utils/concurrency.js";
import {
  normalizeSearchText,
  sanitizeImageQuery,
} from "../utils/text.utils.js";
import { generateSemanticImage } from "./imageGeneration.service.js";
import { resolveImageQueries } from "./imageQueryMetadata.service.js";
import {
  createSlotFallbackImage,
  IMAGE_PLACEHOLDERS,
  IMAGE_SLOTS,
  type ImageSlot,
} from "./imagePlaceholders.service.js";
import type { AppFormData, GeneratedImages } from "./landing.types.js";

type PexelsOrientation = "landscape" | "portrait" | "square";

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  alt?: string;
  src: {
    original?: string;
    large2x?: string;
    large?: string;
    medium?: string;
    landscape?: string;
    portrait?: string;
  };
}

interface PexelsSearchResponse {
  photos?: PexelsPhoto[];
}

interface RankedPexelsCandidate {
  photo: PexelsPhoto;
  url: string;
  score: number;
  index: number;
}

interface ImageInlinePart {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

interface ImageRelevanceDecision {
  selectedIndex: number | null;
  confidence?: number;
  reason?: string;
}

const PEXELS_RESULTS_PER_QUERY = 24;
const PEXELS_REQUEST_CONCURRENCY = 4;
const PEXELS_REQUEST_TIMEOUT_MS = 12_000;
const GENERATED_IMAGE_FALLBACK_CONCURRENCY = 2;
const IMAGE_RELEVANCE_MODEL =
  process.env.GEMINI_IMAGE_RELEVANCE_MODEL?.trim() ||
  process.env.GEMINI_IMAGE_STOCK_QUERY_MODEL?.trim() ||
  "gemini-2.5-flash-lite";
const IMAGE_RELEVANCE_CANDIDATE_COUNT = 5;
const IMAGE_RELEVANCE_MIN_CONFIDENCE = 0.6;
const IMAGE_RELEVANCE_REQUEST_TIMEOUT_MS = 12_000;
const DEBUG_MODE =
  process.env.GENERATE_WEBSITE_DEBUG?.trim().toLowerCase() === "true";

const IMAGE_QUERY_STOP_WORDS = new Set([
  "and",
  "the",
  "with",
  "from",
  "into",
  "for",
  "of",
  "on",
  "in",
  "at",
  "wide",
  "photo",
  "photos",
  "photography",
  "shot",
  "close",
  "up",
  "commercial",
  "editorial",
  "background",
  "business",
  "specific",
  "natural",
  "modern",
  "professional",
  "small",
  "large",
  "premium",
  "customer",
  "customers",
  "product",
  "products",
  "service",
  "services",
  "detail",
  "details",
  "display",
  "lifestyle",
  "interior",
  "exterior",
]);

const getMeaningfulQueryWords = (query: string): string[] =>
  [
    ...new Set(
      normalizeSearchText(query)
        .split(" ")
        .filter(
          (word) =>
            word.length >= 3 &&
            !IMAGE_QUERY_STOP_WORDS.has(word) &&
            !/^\d+$/.test(word),
        ),
    ),
  ];

const searchPexelsCandidates = async (
  query: string,
  orientation: PexelsOrientation,
): Promise<PexelsPhoto[]> => {
  const apiKey = process.env.PEXELS_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("PEXELS_API_KEY is not configured");
  }

  const params = new URLSearchParams({
    query,
    orientation,
    size: "medium",
    locale: "en-US",
    page: "1",
    per_page: String(PEXELS_RESULTS_PER_QUERY),
  });
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    PEXELS_REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?${params.toString()}`,
      {
        headers: { Authorization: apiKey },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(`Pexels returned HTTP ${response.status}`);
    }

    const data = (await response.json()) as PexelsSearchResponse;
    return Array.isArray(data.photos) ? data.photos : [];
  } finally {
    clearTimeout(timeout);
  }
};

const getPhotoUrl = (
  photo: PexelsPhoto,
  slot: ImageSlot,
): string | null => {
  const source = photo.src;

  if (slot === "hero") {
    return (
      source.large2x ??
      source.original ??
      source.large ??
      source.landscape ??
      null
    );
  }

  if (slot.startsWith("review")) {
    return source.medium ?? source.portrait ?? source.large ?? null;
  }

  return (
    source.landscape ??
    source.large2x ??
    source.large ??
    source.original ??
    null
  );
};

const scorePexelsPhoto = (
  photo: PexelsPhoto,
  query: string,
  resultIndex: number,
  orientation: PexelsOrientation,
): number => {
  const queryWords = getMeaningfulQueryWords(query);
  const altText = normalizeSearchText(photo.alt ?? "");
  const matchingWords = queryWords.filter((word) => altText.includes(word));
  const aspectRatio = photo.height > 0 ? photo.width / photo.height : 1;
  const orientationScore =
    orientation === "square"
      ? Math.max(0, 4 - Math.abs(1 - aspectRatio) * 4)
      : aspectRatio >= 1.25
        ? 4
        : 0;

  // Pexels already orders by relevance, so keep a small preference for the
  // first results while additionally checking the photo's alt description.
  return matchingWords.length * 8 + orientationScore - resultIndex * 0.25;
};

const getRequiredSemanticMatchCount = (
  slot: ImageSlot,
  queryWords: readonly string[],
): number => {
  if (queryWords.length <= 1) {
    return queryWords.length;
  }

  if (slot.startsWith("product") || slot.startsWith("gallery")) {
    return 1;
  }

  return 1;
};

const hasEnoughSemanticMatch = (
  photo: PexelsPhoto,
  query: string,
  slot: ImageSlot,
): boolean => {
  if (slot.startsWith("review")) {
    return true;
  }

  const queryWords = getMeaningfulQueryWords(query);

  if (queryWords.length === 0) {
    return true;
  }

  const altText = normalizeSearchText(photo.alt ?? "");

  if (!altText) {
    return false;
  }

  const matchedWords = queryWords.filter((word) => altText.includes(word));
  const requiredMatchCount = getRequiredSemanticMatchCount(slot, queryWords);

  return matchedWords.length >= requiredMatchCount;
};

const fetchImageInlinePart = async (
  url: string,
): Promise<ImageInlinePart | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    IMAGE_RELEVANCE_REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      return null;
    }

    const mimeType = response.headers.get("content-type") ?? "image/jpeg";

    if (!mimeType.startsWith("image/")) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      inlineData: {
        data: buffer.toString("base64"),
        mimeType,
      },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const parseImageRelevanceDecision = (
  value: string,
): ImageRelevanceDecision | null => {
  const match = value.match(/\{[\s\S]*\}/);

  if (!match) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(match[0]);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const decision = parsed as Partial<ImageRelevanceDecision>;

    if (
      decision.selectedIndex !== null &&
      typeof decision.selectedIndex !== "number"
    ) {
      return null;
    }

    return {
      selectedIndex: decision.selectedIndex ?? null,
      confidence:
        typeof decision.confidence === "number"
          ? decision.confidence
          : undefined,
      reason:
        typeof decision.reason === "string" ? decision.reason : undefined,
    };
  } catch {
    return null;
  }
};

const selectPexelsPhotoWithGeminiVision = async (
  query: string,
  slot: ImageSlot,
  candidates: readonly RankedPexelsCandidate[],
): Promise<RankedPexelsCandidate | null> => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey || candidates.length === 0 || slot.startsWith("review")) {
    return candidates[0] ?? null;
  }

  try {
    const imageParts = await Promise.all(
      candidates.map(async (candidate) => {
        const part = await fetchImageInlinePart(candidate.url);

        return part ? { candidate, part } : null;
      }),
    );
    const validParts = imageParts.filter(
      (
        item,
      ): item is {
        candidate: RankedPexelsCandidate;
        part: ImageInlinePart;
      } => Boolean(item),
    );

    if (validParts.length === 0) {
      return candidates[0] ?? null;
    }

    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: IMAGE_RELEVANCE_MODEL,
      generationConfig: {
        temperature: 0,
        topP: 0.1,
        maxOutputTokens: 400,
      },
    });
    const prompt = `
You are choosing a stock photo for a generated commercial landing page.

Search query: "${query}"
Image slot: "${slot}"

Pick the single image that visually matches the query best.
Reject images that do not clearly show the requested object, place, service, dish, person, or action.
Do not choose an image only because colors, mood, or general category are similar.

Candidate indexes and Pexels alt text:
${validParts
  .map(
    ({ candidate }, index) =>
      `${index}. ${candidate.photo.alt?.trim() || "No alt text"}`,
  )
  .join("\n")}

Return only JSON in this exact shape:
{"selectedIndex": number | null, "confidence": number, "reason": "short reason"}
Use selectedIndex:null when none of the images clearly match the query.
`.trim();
    const response = await model.generateContent([
      prompt,
      ...validParts.map(({ part }) => part),
    ]);
    const decision = parseImageRelevanceDecision(response.response.text());

    if (
      !decision ||
      decision.selectedIndex === null ||
      decision.selectedIndex < 0 ||
      decision.selectedIndex >= validParts.length ||
      (decision.confidence ?? 0) < IMAGE_RELEVANCE_MIN_CONFIDENCE
    ) {
      if (DEBUG_MODE) {
        console.warn("Gemini rejected Pexels candidates:", {
          slot,
          query,
          decision,
        });
      }

      return null;
    }

    const selected = validParts[decision.selectedIndex].candidate;

    if (DEBUG_MODE) {
      console.log("Gemini selected Pexels candidate:", {
        slot,
        query,
        decision,
        photoId: selected.photo.id,
        alt: selected.photo.alt,
      });
    }

    return selected;
  } catch (error) {
    console.warn(`Gemini image relevance check failed for "${query}":`, error);
    return candidates[0] ?? null;
  }
};

const selectUniquePexelsPhoto = async (
  candidates: readonly PexelsPhoto[],
  query: string,
  slot: ImageSlot,
  usedPhotoIds: Set<number>,
  usedImageUrls: Set<string>,
): Promise<{ photo: PexelsPhoto; url: string } | null> => {
  const rankedCandidates = candidates
    .map((photo, index) => {
      const url = getPhotoUrl(photo, slot)?.trim();

      return url
        ? {
            photo,
            url,
            index,
            score: scorePexelsPhoto(
              photo,
              query,
              index,
              IMAGE_SLOT_CONFIG[slot].orientation,
            ),
          }
        : null;
    })
    .filter((candidate): candidate is RankedPexelsCandidate =>
      Boolean(candidate),
    )
    .filter(
      ({ photo, url }) =>
        hasEnoughSemanticMatch(photo, query, slot) &&
        !usedPhotoIds.has(photo.id) &&
        !usedImageUrls.has(url),
    )
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const selected = await selectPexelsPhotoWithGeminiVision(
    query,
    slot,
    rankedCandidates.slice(0, IMAGE_RELEVANCE_CANDIDATE_COUNT),
  );

  if (selected) {
    return {
      photo: selected.photo,
      url: selected.url,
    };
  }

  return null;
};

const shouldUseGeneratedImagesOnly = (): boolean =>
  !process.env.PEXELS_API_KEY?.trim();

const generateSlotFallbackImage = async (
  formData: AppFormData,
  slot: ImageSlot,
  query: string,
): Promise<string | null> => {
  const generatedImage = await generateSemanticImage(query, {
    projectName: formData.ProjectName,
    description: formData.Description,
    slot,
    accentColor: formData.ColorPalette,
  });

  if (generatedImage && DEBUG_MODE) {
    console.log("Generated semantic fallback image:", { slot, query });
  }

  return generatedImage;
};

const generateMissingSlotImages = async (
  formData: AppFormData,
  slots: readonly ImageSlot[],
  queries: readonly string[],
  images: GeneratedImages,
): Promise<Set<ImageSlot>> => {
  const generatedSlots = new Set<ImageSlot>();

  await mapWithConcurrency(
    slots,
    GENERATED_IMAGE_FALLBACK_CONCURRENCY,
    async (slot) => {
      const slotIndex = IMAGE_SLOTS.indexOf(slot);
      const query = queries[slotIndex] ?? IMAGE_SLOT_CONFIG[slot].querySuffix;
      const generatedImage = await generateSlotFallbackImage(
        formData,
        slot,
        query,
      );

      if (generatedImage) {
        images[slot] = generatedImage;
        generatedSlots.add(slot);
      }
    },
  );

  return generatedSlots;
};

const loadPexelsImagesForSlots = async (
  formData: AppFormData,
  slots: readonly ImageSlot[],
  queries: readonly string[],
  images: GeneratedImages,
  options: { generateFallbackOnMiss?: boolean } = {},
): Promise<Set<ImageSlot>> => {
  if (!process.env.PEXELS_API_KEY?.trim() || slots.length === 0) {
    return new Set<ImageSlot>();
  }

  const candidateSets = await mapWithConcurrency(
    slots,
    PEXELS_REQUEST_CONCURRENCY,
    async (slot) => {
      const slotIndex = IMAGE_SLOTS.indexOf(slot);
      const query = queries[slotIndex] ?? IMAGE_SLOT_CONFIG[slot].querySuffix;
      const pexelsQuery =
        sanitizeImageQuery(query) || IMAGE_SLOT_CONFIG[slot].querySuffix;

      try {
        const candidates = await searchPexelsCandidates(
          pexelsQuery,
          IMAGE_SLOT_CONFIG[slot].orientation,
        );

        return { slot, query, pexelsQuery, candidates };
      } catch (error) {
        console.error(
          `Failed to load Pexels candidates for "${pexelsQuery}":`,
          error,
        );
        return {
          slot,
          query,
          pexelsQuery,
          candidates: [] as PexelsPhoto[],
        };
      }
    },
  );

  const usedPhotoIds = new Set<number>();
  const usedImageUrls = new Set<string>();
  const loadedSlots = new Set<ImageSlot>();

  for (const { slot, query, pexelsQuery, candidates } of candidateSets) {
    const selected = await selectUniquePexelsPhoto(
      candidates,
      pexelsQuery,
      slot,
      usedPhotoIds,
      usedImageUrls,
    );

    if (!selected) {
      console.warn(
        `No unique Pexels image found for ${slot}: "${pexelsQuery}"`,
      );

      if (options.generateFallbackOnMiss) {
        const generatedImage = await generateSlotFallbackImage(
          formData,
          slot,
          query,
        );

        if (generatedImage) {
          images[slot] = generatedImage;
          loadedSlots.add(slot);
        }
      }

      continue;
    }

    usedPhotoIds.add(selected.photo.id);
    usedImageUrls.add(selected.url);
    images[slot] = selected.url;
    loadedSlots.add(slot);

    if (DEBUG_MODE) {
      console.log("Selected Pexels image:", {
        slot,
        query: pexelsQuery,
        originalQuery: query,
        photoId: selected.photo.id,
        alt: selected.photo.alt,
      });
    }
  }

  if (DEBUG_MODE) {
    console.log(
      "Resolved image slots:",
      candidateSets.map(({ slot, query, pexelsQuery }) => ({
        slot,
        query,
        pexelsQuery,
      })),
    );
  }

  return loadedSlots;
};

export const loadImages = async (
  formData: AppFormData,
  generatedHtml: string,
): Promise<GeneratedImages> => {
  const queries = resolveImageQueries(formData, generatedHtml);
  const images = {} as GeneratedImages;

  IMAGE_SLOTS.forEach((slot, index) => {
    const query = queries[index] ?? IMAGE_SLOT_CONFIG[slot].querySuffix;

    images[slot] = createSlotFallbackImage(
      slot,
      query,
      formData.ColorPalette,
    );
  });

  const activeSlots = IMAGE_SLOTS.filter((slot) =>
    generatedHtml.includes(IMAGE_PLACEHOLDERS[slot]),
  );

  if (activeSlots.length === 0) {
    console.warn("Generated HTML contains no image placeholders");
    return images;
  }

  if (shouldUseGeneratedImagesOnly()) {
    console.warn(
      "PEXELS_API_KEY is not configured; trying generated fallback images",
    );
    await generateMissingSlotImages(
      formData,
      activeSlots,
      queries,
      images,
    );
    return images;
  }

  await loadPexelsImagesForSlots(formData, activeSlots, queries, images, {
    generateFallbackOnMiss: true,
  });

  return images;
};