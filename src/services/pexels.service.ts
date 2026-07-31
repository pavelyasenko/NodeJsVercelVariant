import {
  IMAGE_QUERY_STOP_WORDS,
  IMAGE_RELEVANCE_CONFIG,
  PEXELS_CONFIG,
} from "../config/pexels.config.js";
import type {
  GetImageOptions,
  PexelsOrientation,
  PexelsPhoto,
  PexelsSearchResponse,
  RankedPexelsCandidate,
  SelectedPexelsPhoto,
  SelectPexelsPhotoOptions,
} from "../types/pexels.types.js";
import { normalizeSearchText } from "../utils/text.utils.js";
import { generateImageWithGemini } from "./imageGeneration.service.js";
import { decideImageSource } from "./imageSourceDecision.service.js";
import { selectPexelsCandidateWithGemini } from "./imageRelevance.service.js";

const getMeaningfulQueryWords = (query: string): string[] =>
  Array.from(
    new Set(
      normalizeSearchText(query)
        .split(" ")
        .filter(
          (word) =>
            word.length >= 3 &&
            !IMAGE_QUERY_STOP_WORDS.has(word) &&
            !/^\d+$/.test(word),
        ),
    ),
  );

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

export const getPexelsPhotoUrl = (
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

const hasSemanticMatch = (photo: PexelsPhoto, query: string): boolean => {
  const queryWords = getMeaningfulQueryWords(query);

  if (queryWords.length === 0) {
    return true;
  }

  const altText = normalizeSearchText(photo.alt ?? "");

  return Boolean(altText) && queryWords.some((word) => altText.includes(word));
};

export const searchPexelsCandidates = async (
  query: string,
  orientation: PexelsOrientation,
  perPage: number = PEXELS_CONFIG.resultsPerQuery,
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
    per_page: String(perPage),
  });
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    PEXELS_CONFIG.requestTimeoutMs,
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

export const selectUniquePexelsPhoto = async (
  options: SelectPexelsPhotoOptions,
): Promise<SelectedPexelsPhoto | null> => {
  const usedPhotoIds = options.usedPhotoIds ?? new Set<number>();
  const usedImageUrls = options.usedImageUrls ?? new Set<string>();
  const rankedCandidates = options.photos
    .map((photo, index): RankedPexelsCandidate | null => {
      const url = getPexelsPhotoUrl(photo, options.orientation)?.trim();

      return url
        ? {
            photo,
            url,
            index,
            score: scorePhoto(photo, options.query, index, options.orientation),
          }
        : null;
    })
    .filter(
      (candidate): candidate is RankedPexelsCandidate => candidate !== null,
    )
    .filter(
      ({ photo, url }) =>
        (options.skipSemanticMatch ||
          hasSemanticMatch(photo, options.query)) &&
        !usedPhotoIds.has(photo.id) &&
        !usedImageUrls.has(url),
    )
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const selected = await selectPexelsCandidateWithGemini(
    options.query,
    options.context ?? "standalone image",
    rankedCandidates.slice(0, IMAGE_RELEVANCE_CONFIG.candidateCount),
  );

  return selected
    ? {
        photo: selected.photo,
        url: selected.url,
      }
    : null;
};

const generateFallback = async (query: string): Promise<string> =>
  (await generateImageWithGemini(query, { slot: "standalone image" })) ??
  createFallbackImage(query);

export const getImage = async (
  query: string,
  options: GetImageOptions = {},
): Promise<string> => {
  const cleanQuery = query.trim();
  const orientation = options.orientation ?? "landscape";

  if (!cleanQuery) {
    return createFallbackImage("Generated website image");
  }

  const hasPexelsApiKey = Boolean(process.env.PEXELS_API_KEY?.trim());
  const source = await decideImageSource({
    query: cleanQuery,
    hasConfiguredStockQueries: hasPexelsApiKey,
  });

  if (source === "generate" || !hasPexelsApiKey) {
    return generateFallback(cleanQuery);
  }

  try {
    const photos = await searchPexelsCandidates(
      cleanQuery,
      orientation,
      options.perPage,
    );
    const selected = await selectUniquePexelsPhoto({
      photos,
      query: cleanQuery,
      orientation,
    });

    return selected?.url ?? (await generateFallback(cleanQuery));
  } catch {
    return generateFallback(cleanQuery);
  }
};