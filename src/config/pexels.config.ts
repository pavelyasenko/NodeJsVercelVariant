export const PEXELS_CONFIG = {
  resultsPerQuery: 24,
  requestConcurrency: 4,
  requestTimeoutMs: 12_000,
} as const;

export const IMAGE_RELEVANCE_CONFIG = {
  model:
    process.env.GEMINI_IMAGE_RELEVANCE_MODEL?.trim() ||
    process.env.GEMINI_IMAGE_STOCK_QUERY_MODEL?.trim() ||
    "gemini-2.5-flash-lite",
  candidateCount: 5,
  minConfidence: 0.6,
  requestTimeoutMs: 12_000,
} as const;

export const IMAGE_LOADING_CONFIG = {
  generatedFallbackConcurrency: 2,
  debug: process.env.GENERATE_WEBSITE_DEBUG?.trim().toLowerCase() === "true",
} as const;

export const IMAGE_QUERY_STOP_WORDS = new Set([
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