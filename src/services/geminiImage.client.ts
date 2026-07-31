import {
  getGeminiApiKey,
  imageGenerationConfig,
} from "../config/imageGeneration.config.js";
import {
  extractImageFromResponse,
  formatImageDataUrl,
} from "../utils/geminiImageResponse.utils.js";
import type {
  GeminiGenerateContentResponse,
  GoogleSearchTool,
} from "../types/imageGeneration.types.js";

interface RequestContext {
  operation: string;
  modelName: string;
}

const postJson = async (
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
  context: RequestContext,
): Promise<unknown | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (imageGenerationConfig.debug) {
        console.warn(`${context.operation} failed:`, {
          modelName: context.modelName,
          status: response.status,
          body: await response.text(),
        });
      }

      return null;
    }

    return (await response.json()) as unknown;
  } catch (error) {
    if (imageGenerationConfig.debug) {
      console.warn(`${context.operation} crashed:`, {
        modelName: context.modelName,
        error,
      });
    }

    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const getGenerateContentUrl = (modelName: string, apiKey: string): string =>
  `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;

const getGoogleSearchTools = (): GoogleSearchTool[] | undefined => {
  if (!imageGenerationConfig.useGoogleSearch) {
    return undefined;
  }

  const searchTypes = [...imageGenerationConfig.googleSearchTypes];

  return [
    {
      type: "google_search",
      ...(searchTypes.length ? { search_types: searchTypes } : {}),
    },
  ];
};

export const requestGeminiText = async (
  modelName: string,
  prompt: string,
): Promise<string | null> => {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    return null;
  }

  const data = (await postJson(
    getGenerateContentUrl(modelName, apiKey),
    {},
    {
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
    },
    imageGenerationConfig.promptTimeoutMs,
    {
      operation: "Gemini prompt rewrite request",
      modelName,
    },
  )) as GeminiGenerateContentResponse | null;

  return (
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() || null
  );
};

const requestGeminiInteractionImage = async (
  modelName: string,
  prompt: string,
  apiKey: string,
): Promise<string | null> => {
  const googleSearchTools = getGoogleSearchTools();
  const data = await postJson(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    { "x-goog-api-key": apiKey },
    {
      model: modelName,
      input: [{ type: "text", text: prompt }],
      response_format: {
        type: "image",
        mime_type: imageGenerationConfig.mimeType,
        aspect_ratio: imageGenerationConfig.aspectRatio,
        image_size: imageGenerationConfig.imageSize,
      },
      ...(googleSearchTools ? { tools: googleSearchTools } : {}),
    },
    imageGenerationConfig.generationTimeoutMs,
    {
      operation: "Gemini Interactions image request",
      modelName,
    },
  );
  const image = extractImageFromResponse(data);

  return image ? formatImageDataUrl(image) : null;
};

const requestGeminiGenerateContentImage = async (
  modelName: string,
  prompt: string,
  apiKey: string,
): Promise<string | null> => {
  const data = await postJson(
    getGenerateContentUrl(modelName, apiKey),
    {},
    {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    },
    imageGenerationConfig.generationTimeoutMs,
    {
      operation: "Gemini generateContent image request",
      modelName,
    },
  );
  const image = extractImageFromResponse(data);

  return image ? formatImageDataUrl(image) : null;
};

export const requestGeminiImage = async (
  modelName: string,
  prompt: string,
): Promise<string | null> => {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    return null;
  }

  return (
    (await requestGeminiInteractionImage(modelName, prompt, apiKey)) ??
    (await requestGeminiGenerateContentImage(modelName, prompt, apiKey))
  );
};