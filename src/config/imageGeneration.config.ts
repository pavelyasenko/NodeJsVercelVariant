const DEFAULT_IMAGE_GENERATION_MODELS = [
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-lite-image",
  "gemini-2.5-flash-image",
] as const;

const parseList = (value?: string): string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const isEnabled = (value?: string): boolean =>
  value?.trim().toLowerCase() === "true";

const isNotDisabled = (value?: string): boolean =>
  value?.trim().toLowerCase() !== "false";

const getImageGenerationModels = (): string[] =>
  Array.from(
    new Set([
      ...parseList(process.env.GEMINI_IMAGE_GENERATION_MODELS),
      ...parseList(process.env.GEMINI_IMAGE_GENERATION_MODEL),
      ...DEFAULT_IMAGE_GENERATION_MODELS,
    ]),
  );

export const imageGenerationConfig = {
  models: getImageGenerationModels(),
  promptModel:
    process.env.GEMINI_IMAGE_PROMPT_MODEL?.trim() || "gemini-2.5-flash",
  generationTimeoutMs: 45_000,
  promptTimeoutMs: 12_000,
  aspectRatio: process.env.GEMINI_IMAGE_ASPECT_RATIO?.trim() || "16:9",
  imageSize: process.env.GEMINI_IMAGE_SIZE?.trim() || "1K",
  mimeType: process.env.GEMINI_IMAGE_MIME_TYPE?.trim() || "image/jpeg",
  useGoogleSearch: isEnabled(process.env.GEMINI_IMAGE_USE_GOOGLE_SEARCH),
  googleSearchTypes: parseList(
    process.env.GEMINI_IMAGE_SEARCH_TYPES || "web_search,image_search",
  ),
  debug: isEnabled(process.env.GENERATE_WEBSITE_DEBUG),
  enabled: isNotDisabled(process.env.GENERATE_IMAGE_FALLBACKS),
} as const;

export const getGeminiApiKey = (): string | null =>
  process.env.GEMINI_API_KEY?.trim() || null;