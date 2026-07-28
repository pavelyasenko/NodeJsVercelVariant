import { GoogleGenerativeAI } from "@google/generative-ai";
import { Buffer } from "node:buffer";
import { generateImageWithGemini } from "./imageGeneration.service.js";
import { decideImageSource } from "./imageSourceDecision.service.js";

type PexelsOrientation = "landscape" | "portrait" | "square";

interface GetImageOptions {
  orientation?: PexelsOrientation;
  perPage?: number;
}

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  alt?: string;
  src: {
    original?: string;
    large2x?: string;
    large?: string;
    landscape?: string;
    portrait?: string;
    medium?: string;
  };
}

interface PexelsSearchResponse {
  photos?: PexelsPhoto[];
}

const PEXELS_RESULTS_PER_QUERY = 24;
const PEXELS_REQUEST_TIMEOUT_MS = 12_000;
const IMAGE_RELEVANCE_MODEL =
  process.env.GEMINI_IMAGE_RELEVANCE_MODEL?.trim() || "gemini-2.5-flash-lite";
const IMAGE_RELEVANCE_CANDIDATE_COUNT = 5;
const IMAGE_RELEVANCE_MIN_CONFIDENCE = 0.6;
const IMAGE_RELEVANCE_REQUEST_TIMEOUT_MS = 12_000;

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

const normalizeSearchText = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/-/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

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

const escapeXml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };

    return entities[character] ?? character;
  });

const createFallbackImage = (query: string): string =>
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
      <defs>
        <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#111827"/>
          <stop offset="100%" stop-color="#312e81"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#background)"/>
      <circle cx="960" cy="150" r="190" fill="#ffffff" opacity="0.06"/>
      <circle cx="190" cy="665" r="240" fill="#ffffff" opacity="0.04"/>
      <text x="600" y="380" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="44" font-weight="700">Image preview</text>
      <text x="600" y="445" text-anchor="middle" fill="#ffffff" opacity="0.72" font-family="Arial, sans-serif" font-size="24">${escapeXml(query.slice(0, 54))}</text>
    </svg>
  `);

const getPhotoUrl = (
  photo: PexelsPhoto,
  orientation: PexelsOrientation,
): string | null => {
  if (orientation === "portrait") {
    return photo.src.portrait ?? photo.src.large ?? photo.src.medium ?? null;
  }

  if (orientation === "square") {
    return photo.src.medium ?? photo.src.large ?? photo.src.portrait ?? null;
  }

  return (
    photo.src.landscape ??
    photo.src.large2x ??
    photo.src.large ??
    photo.src.original ??
    null
  );
};

const scorePhoto = (
  photo: PexelsPhoto,
  query: string,
  index: number,
  orientation: PexelsOrientation,
): number => {
  const queryWords = getMeaningfulQueryWords(query);
  const altText = normalizeSearchText(photo.alt ?? "");
  const matchedWords = queryWords.filter((word) => altText.includes(word));
  const aspectRatio = photo.height > 0 ? photo.width / photo.height : 1;
  const orientationScore =
    orientation === "square"
      ? Math.max(0, 4 - Math.abs(1 - aspectRatio) * 4)
      : orientation === "portrait"
        ? aspectRatio <= 0.95
          ? 4
          : 0
        : aspectRatio >= 1.25
          ? 4
          : 0;

  return matchedWords.length * 10 + orientationScore - index * 0.25;
};

const getRequiredSemanticMatchCount = (
  queryWords: readonly string[],
): number => {
  if (queryWords.length <= 1) {
    return queryWords.length;
  }

  return 1;
};

const isRelevantPhoto = (photo: PexelsPhoto, query: string): boolean => {
  const queryWords = getMeaningfulQueryWords(query);

  if (queryWords.length === 0) {
    return true;
  }

  const altText = normalizeSearchText(photo.alt ?? "");

  if (!altText) {
    return false;
  }

  const matchedWords = queryWords.filter((word) => altText.includes(word));

  return matchedWords.length >= getRequiredSemanticMatchCount(queryWords);
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

const selectPhotoWithGeminiVision = async (
  query: string,
  candidates: readonly RankedPexelsCandidate[],
): Promise<RankedPexelsCandidate | null> => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey || candidates.length === 0) {
    return null;
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
      return null;
    }

    return validParts[decision.selectedIndex].candidate;
  } catch {
    return candidates[0] ?? null;
  }
};

const selectBestPhoto = async (
  photos: readonly PexelsPhoto[],
  query: string,
  orientation: PexelsOrientation,
): Promise<PexelsPhoto | null> => {
  const rankedCandidates = photos
    .map((photo, index) => {
      const url = getPhotoUrl(photo, orientation)?.trim();

      return url
        ? {
            photo,
            url,
            index,
            score: scorePhoto(photo, query, index, orientation),
          }
        : null;
    })
    .filter((candidate): candidate is RankedPexelsCandidate =>
      Boolean(candidate),
    )
    .filter(({ photo }) => isRelevantPhoto(photo, query))
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const selected = await selectPhotoWithGeminiVision(
    query,
    rankedCandidates.slice(0, IMAGE_RELEVANCE_CANDIDATE_COUNT),
  );

  return selected?.photo ?? null;
};

export async function getImage(
  query: string,
  options: GetImageOptions = {},
): Promise<string> {
  const apiKey = process.env.PEXELS_API_KEY?.trim();
  const cleanQuery = query.trim();
  const orientation = options.orientation ?? "landscape";
  const perPage = options.perPage ?? PEXELS_RESULTS_PER_QUERY;

  if (!cleanQuery) {
    return createFallbackImage("Generated website image");
  }

  if ((await decideImageSource({ query: cleanQuery })) === "generate") {
    return (
      (await generateImageWithGemini(cleanQuery, {
        slot: "standalone image",
      })) ?? createFallbackImage(cleanQuery)
    );
  }

  if (!apiKey) {
    return (
      (await generateImageWithGemini(cleanQuery, {
        slot: "standalone image",
      })) ?? createFallbackImage(cleanQuery)
    );
  }

  const params = new URLSearchParams({
    query: cleanQuery,
    orientation,
    size: "medium",
    locale: "en-US",
    page: "1",
    per_page: String(perPage),
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
      return (
        (await generateImageWithGemini(cleanQuery, {
          slot: "standalone image",
        })) ?? createFallbackImage(cleanQuery)
      );
    }

    const data = (await response.json()) as PexelsSearchResponse;
    const photos = Array.isArray(data.photos) ? data.photos : [];
    const selectedPhoto = await selectBestPhoto(
      photos,
      cleanQuery,
      orientation,
    );
    const selectedUrl = selectedPhoto
      ? getPhotoUrl(selectedPhoto, orientation)
      : null;

    if (selectedUrl) {
      return selectedUrl;
    }

    return (
      (await generateImageWithGemini(cleanQuery, {
        slot: "standalone image",
      })) ?? createFallbackImage(cleanQuery)
    );
  } catch {
    return (
      (await generateImageWithGemini(cleanQuery, {
        slot: "standalone image",
      })) ?? createFallbackImage(cleanQuery)
    );
  } finally {
    clearTimeout(timeout);
  }
}