interface GenerateImageOptions {
  projectName?: string;
  description?: string;
  slot?: string;
  accentColor?: string;
}

interface GeminiImagePart {
  inlineData?: {
    data?: string;
    mimeType?: string;
  };
  inline_data?: {
    data?: string;
    mime_type?: string;
  };
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<GeminiImagePart & { text?: string }>;
    };
  }>;
}

interface ExtractedImage {
  data: string;
  mimeType: string;
}

interface ImagePromptRewrite {
  prompt: string;
  reason?: string;
}

const DEFAULT_GEMINI_IMAGE_GENERATION_MODELS = [
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-lite-image",
  "gemini-2.5-flash-image",
] as const;

const parseModelList = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((modelName) => modelName.trim())
    .filter(Boolean);

const GEMINI_IMAGE_GENERATION_MODELS = [
  ...new Set(
    [
      ...parseModelList(process.env.GEMINI_IMAGE_GENERATION_MODELS),
      ...parseModelList(process.env.GEMINI_IMAGE_GENERATION_MODEL),
      ...DEFAULT_GEMINI_IMAGE_GENERATION_MODELS,
    ].filter(Boolean),
  ),
];
const GEMINI_IMAGE_PROMPT_MODEL =
  process.env.GEMINI_IMAGE_PROMPT_MODEL?.trim() || "gemini-2.5-flash";
const GEMINI_IMAGE_GENERATION_TIMEOUT_MS = 45_000;
const GEMINI_IMAGE_PROMPT_TIMEOUT_MS = 12_000;
const GEMINI_IMAGE_ASPECT_RATIO =
  process.env.GEMINI_IMAGE_ASPECT_RATIO?.trim() || "16:9";
const GEMINI_IMAGE_SIZE = process.env.GEMINI_IMAGE_SIZE?.trim() || "1K";
const GEMINI_IMAGE_MIME_TYPE =
  process.env.GEMINI_IMAGE_MIME_TYPE?.trim() || "image/jpeg";
const USE_GEMINI_IMAGE_SEARCH_GROUNDING =
  process.env.GEMINI_IMAGE_USE_GOOGLE_SEARCH?.trim().toLowerCase() === "true";
const DEBUG_MODE =
  process.env.GENERATE_WEBSITE_DEBUG?.trim().toLowerCase() === "true";
const ENABLE_GENERATED_IMAGE_FALLBACKS =
  process.env.GENERATE_IMAGE_FALLBACKS?.trim().toLowerCase() !== "false";

const parseJsonObject = <T>(value: string): T | null => {
  const match = value.match(/\{[\s\S]*\}/);

  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
};

const callGeminiTextModel = async (
  modelName: string,
  prompt: string,
  timeoutMs: number,
): Promise<string | null> => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            topP: 0.8,
            maxOutputTokens: 700,
          },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as GeminiGenerateContentResponse;

    return (
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim() || null
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const buildPromptRewriteInstruction = (
  query: string,
  options: GenerateImageOptions,
): string => {
  return `
Rewrite the user's image search query into one precise visual prompt for AI image generation.

Original query:
${query}

Project context:
- Project name: ${options.projectName || "Generated website"}
- Business description: ${options.description || "Commercial landing page"}
- Image slot: ${options.slot || "website image"}
- Accent color: ${options.accentColor || "not specified"}

Rules:
- Preserve the real intended subject.
- If the query uses a brand name, convert it to a generic visual description of the product category and visible form factor.
- Do not include brand logos, trademarked marks, readable packaging text, watermarks, or UI text.
- For regulated or sensitive product topics, describe a neutral product/accessory mockup with shape, material, color, and clean retail composition. Do not show product use, harmful behavior, health claims, minors, or lifestyle promotion.
- For rare or fictional products, create a clear product/mockup prompt using shape, material, color, context, and camera angle.
- Make the prompt suitable for a commercial landing page image.
- Keep it under 60 words.

Return only JSON:
{"prompt":"rewritten visual prompt","reason":"short reason"}
`.trim();
};

const rewriteImagePrompt = async (
  query: string,
  options: GenerateImageOptions,
): Promise<string> => {
  const rawText = await callGeminiTextModel(
    GEMINI_IMAGE_PROMPT_MODEL,
    buildPromptRewriteInstruction(query, options),
    GEMINI_IMAGE_PROMPT_TIMEOUT_MS,
  );
  const rewritten = rawText
    ? parseJsonObject<Partial<ImagePromptRewrite>>(rawText)
    : null;
  const prompt = rewritten?.prompt?.trim();

  return prompt || query;
};

const buildImageGenerationPrompt = (
  query: string,
  options: GenerateImageOptions,
): string => {
  return `
Create one high-quality commercial landing page image.

Required visible subject:
${query}

Context:
- Project name: ${options.projectName || "Generated website"}
- Business description: ${options.description || "Commercial landing page"}
- Image slot: ${options.slot || "website image"}
- Accent color: ${options.accentColor || "not specified"}

Rules:
- The image must clearly show the requested subject.
- Prefer realistic commercial product photography for physical goods and real-world services.
- If the subject is a physical product, show that exact product category as the main object. Do not replace it with unrelated electronics, cars, tools, food, or abstract objects.
- For fictional, branded, niche, or hard-to-find subjects, create a polished realistic product/mockup-style image using the generic visual description.
- Do not add readable text, UI, watermarks, brand logos, captions, posters, or labels.
- For regulated or sensitive product topics, avoid showing product use, harmful behavior, health claims, minors, or lifestyle promotion.
- Do not create a collage.
- Keep the image clean, commercially usable, and suitable for a modern landing page.
`.trim();
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const getStringField = (
  value: Record<string, unknown>,
  key: string,
): string | undefined => {
  const field = value[key];

  return typeof field === "string" ? field : undefined;
};

const looksLikeBase64ImageData = (value: string): boolean => {
  if (value.length < 100) {
    return false;
  }

  return /^[A-Za-z0-9+/=]+$/.test(value.slice(0, 160));
};

const extractImageFromResponse = (value: unknown): ExtractedImage | null => {
  const seen = new Set<unknown>();

  const visit = (current: unknown): ExtractedImage | null => {
    if (!isRecord(current) || seen.has(current)) {
      return null;
    }

    seen.add(current);

    const type = getStringField(current, "type");
    const data = getStringField(current, "data");
    const mimeType =
      getStringField(current, "mimeType") ??
      getStringField(current, "mime_type");

    if (
      data &&
      (type === "image" ||
        mimeType?.startsWith("image/") ||
        (!type && !mimeType && looksLikeBase64ImageData(data)))
    ) {
      return {
        data,
        mimeType: mimeType ?? GEMINI_IMAGE_MIME_TYPE,
      };
    }

    const camelInlineData = current.inlineData;

    if (isRecord(camelInlineData)) {
      const inlineData = getStringField(camelInlineData, "data");
      const inlineMimeType = getStringField(camelInlineData, "mimeType");

      if (inlineData && inlineMimeType?.startsWith("image/")) {
        return {
          data: inlineData,
          mimeType: inlineMimeType,
        };
      }
    }

    const snakeInlineData = current.inline_data;

    if (isRecord(snakeInlineData)) {
      const inlineData = getStringField(snakeInlineData, "data");
      const inlineMimeType = getStringField(snakeInlineData, "mime_type");

      if (inlineData && inlineMimeType?.startsWith("image/")) {
        return {
          data: inlineData,
          mimeType: inlineMimeType,
        };
      }
    }

    for (const child of Object.values(current)) {
      if (typeof child === "string") {
        continue;
      }

      if (Array.isArray(child)) {
        for (const item of child) {
          const image = visit(item);

          if (image) {
            return image;
          }
        }

        continue;
      }

      const image = visit(child);

      if (image) {
        return image;
      }
    }

    return null;
  };

  return visit(value);
};

const formatImageDataUrl = (image: ExtractedImage): string =>
  `data:${image.mimeType};base64,${image.data}`;

const getGoogleSearchTools = ():
  | Array<{ type: "google_search"; search_types?: string[] }>
  | undefined => {
  if (!USE_GEMINI_IMAGE_SEARCH_GROUNDING) {
    return undefined;
  }

  const searchTypes = (
    process.env.GEMINI_IMAGE_SEARCH_TYPES?.trim() || "web_search,image_search"
  )
    .split(",")
    .map((type) => type.trim())
    .filter(Boolean);

  return [
    {
      type: "google_search",
      ...(searchTypes.length ? { search_types: searchTypes } : {}),
    },
  ];
};

const requestGeminiInteractionImage = async (
  modelName: string,
  prompt: string,
): Promise<string | null> => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    GEMINI_IMAGE_GENERATION_TIMEOUT_MS,
  );

  try {
    const googleSearchTools = getGoogleSearchTools();
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          model: modelName,
          input: [{ type: "text", text: prompt }],
          response_format: {
            type: "image",
            mime_type: GEMINI_IMAGE_MIME_TYPE,
            aspect_ratio: GEMINI_IMAGE_ASPECT_RATIO,
            image_size: GEMINI_IMAGE_SIZE,
          },
          ...(googleSearchTools ? { tools: googleSearchTools } : {}),
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      if (DEBUG_MODE) {
        console.warn("Gemini Interactions image request failed:", {
          modelName,
          status: response.status,
          body: await response.text(),
        });
      }

      return null;
    }

    const data = (await response.json()) as unknown;
    const image = extractImageFromResponse(data);

    return image ? formatImageDataUrl(image) : null;
  } catch (error) {
    if (DEBUG_MODE) {
      console.warn("Gemini Interactions image request crashed:", {
        modelName,
        error,
      });
    }

    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const requestGeminiGenerateContentImage = async (
  modelName: string,
  prompt: string,
): Promise<string | null> => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    GEMINI_IMAGE_GENERATION_TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      if (DEBUG_MODE) {
        console.warn("Gemini generateContent image request failed:", {
          modelName,
          status: response.status,
          body: await response.text(),
        });
      }

      return null;
    }

    const data = (await response.json()) as GeminiGenerateContentResponse;
    const image = extractImageFromResponse(data);

    return image ? formatImageDataUrl(image) : null;
  } catch (error) {
    if (DEBUG_MODE) {
      console.warn("Gemini generateContent image request crashed:", {
        modelName,
        error,
      });
    }

    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const requestGeminiImage = async (
  modelName: string,
  prompt: string,
): Promise<string | null> => {
  return (
    (await requestGeminiInteractionImage(modelName, prompt)) ??
    (await requestGeminiGenerateContentImage(modelName, prompt))
  );
};

export const generateSemanticImage = async (
  query: string,
  options: GenerateImageOptions = {},
): Promise<string | null> => {
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  const cleanQuery = query.trim();

  if (!ENABLE_GENERATED_IMAGE_FALLBACKS || !geminiApiKey || !cleanQuery) {
    return null;
  }

  const rewrittenPrompt = await rewriteImagePrompt(cleanQuery, options);
  const imagePrompt = buildImageGenerationPrompt(rewrittenPrompt, options);
  const failedModels: string[] = [];

  for (const modelName of GEMINI_IMAGE_GENERATION_MODELS) {
    const generatedImage = await requestGeminiImage(modelName, imagePrompt);

    if (generatedImage) {
      return generatedImage;
    }

    failedModels.push(modelName);
  }

  console.warn("Image generation returned no image:", {
    query: cleanQuery,
    slot: options.slot ?? "website image",
    attemptedModels: failedModels,
  });

  return null;
};

export const generateImageWithGemini = generateSemanticImage;