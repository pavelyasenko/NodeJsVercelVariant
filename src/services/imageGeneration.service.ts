import {
  getGeminiApiKey,
  imageGenerationConfig,
} from "../config/imageGeneration.config.js";
import { parseJsonObject } from "../utils/geminiImageResponse.utils.js";
import {
  requestGeminiImage,
  requestGeminiText,
} from "./geminiImage.client.js";
import {
  buildImageGenerationPrompt,
  buildPromptRewriteInstruction,
} from "./imageGenerationPrompt.service.js";
import type {
  GenerateImageOptions,
  ImagePromptRewrite,
} from "../types/imageGeneration.types.js";

const rewriteImagePrompt = async (
  query: string,
  options: GenerateImageOptions,
): Promise<string> => {
  const response = await requestGeminiText(
    imageGenerationConfig.promptModel,
    buildPromptRewriteInstruction(query, options),
  );
  const rewritten = response
    ? parseJsonObject<Partial<ImagePromptRewrite>>(response)
    : null;

  return rewritten?.prompt?.trim() || query;
};

export const generateSemanticImage = async (
  query: string,
  options: GenerateImageOptions = {},
): Promise<string | null> => {
  const cleanQuery = query.trim();

  if (
    !imageGenerationConfig.enabled ||
    !getGeminiApiKey() ||
    !cleanQuery
  ) {
    return null;
  }

  const rewrittenPrompt = await rewriteImagePrompt(cleanQuery, options);
  const imagePrompt = buildImageGenerationPrompt(rewrittenPrompt, options);
  const attemptedModels: string[] = [];

  for (const modelName of imageGenerationConfig.models) {
    attemptedModels.push(modelName);

    const generatedImage = await requestGeminiImage(modelName, imagePrompt);

    if (generatedImage) {
      return generatedImage;
    }
  }

  console.warn("Image generation returned no image:", {
    query: cleanQuery,
    slot: options.slot ?? "website image",
    attemptedModels,
  });

  return null;
};

export const generateImageWithGemini = generateSemanticImage;

export type { GenerateImageOptions } from "../types/imageGeneration.types.js";