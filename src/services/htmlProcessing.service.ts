import type { Complexity } from "../config/landingComplexity.config.js";
import { countOccurrences, normalizeSearchText } from "../utils/text.utils.js";
import {
  extractGeneratedImageQueries,
  removeImageQueryMetadata,
} from "./imageQueryMetadata.service.js";
import {
  IMAGE_PLACEHOLDERS,
  IMAGE_SLOTS,
  replaceImagePlaceholders,
  replaceRemainingPlaceholders,
  REQUIRED_IMAGE_QUERY_COUNT,
  type ImageSlot,
} from "./imagePlaceholders.service.js";
import type { GeneratedImages } from "./landing.types.js";
import { getRequiredProductCardCount } from "./landingPrompt.service.js";

const removeMarkdownWrapper = (value: string): string => {
  let result = value.trim();

  result = result.replace(/^```(?:html)?\s*/i, "");
  result = result.replace(/\s*```$/i, "");

  return result.trim();
};

export const extractHtmlDocument = (value: string): string => {
  const cleaned = removeMarkdownWrapper(value);
  const startIndex = cleaned.search(/<!DOCTYPE html>/i);
  const endIndex = cleaned.toLowerCase().lastIndexOf("</html>");

  if (startIndex === -1 || endIndex === -1) {
    throw new Error(
      "Gemini response does not contain a complete HTML document",
    );
  }

  return cleaned.slice(startIndex, endIndex + "</html>".length).trim();
};

export const assertGeneratedImagePlan = (
  html: string,
  complexity: Complexity,
): void => {
  const generatedQueries = extractGeneratedImageQueries(html);

  if (generatedQueries?.length !== REQUIRED_IMAGE_QUERY_COUNT) {
    throw new Error(
      `Image metadata must contain exactly ${REQUIRED_IMAGE_QUERY_COUNT} queries`,
    );
  }

  const normalizedQueries = generatedQueries.map((query) =>
    normalizeSearchText(query),
  );

  if (new Set(normalizedQueries).size !== normalizedQueries.length) {
    throw new Error("Image metadata contains duplicate search queries");
  }

  if (countOccurrences(html, IMAGE_PLACEHOLDERS.hero) !== 1) {
    throw new Error("Hero must use HERO_IMAGE exactly once");
  }

  const requiredProductCount = getRequiredProductCardCount(complexity);
  const productSlots: ImageSlot[] = [
    "product1",
    "product2",
    "product3",
    "product4",
    "product5",
    "product6",
  ];

  for (const slot of productSlots.slice(0, requiredProductCount)) {
    const occurrences = countOccurrences(html, IMAGE_PLACEHOLDERS[slot]);

    if (occurrences !== 1) {
      throw new Error(
        `${IMAGE_PLACEHOLDERS[slot]} must be used exactly once, found ${occurrences}`,
      );
    }
  }

  const usedVisualSlots = IMAGE_SLOTS.filter(
    (slot) => countOccurrences(html, IMAGE_PLACEHOLDERS[slot]) > 0,
  );

  if (usedVisualSlots.length < requiredProductCount + 1) {
    throw new Error(
      `The page must use at least ${requiredProductCount + 1} unique image placeholders`,
    );
  }
};

const removeUnsafeOrUnwantedAttributes = (html: string): string => {
  return html
    .replace(/\s+integrity=(["']).*?\1/gi, "")
    .replace(/\s+crossorigin=(["']).*?\1/gi, "")
    .replace(/\s+referrerpolicy=(["']).*?\1/gi, "");
};

export const cleanHtmlContent = (html: string): string => {
  return html
    .replace(
      /<section[^>]*(?:id|class)=["'][^"']*(?:game|mini-game|canvas-game|shooter|comments|comment-section)[^"']*["'][^>]*>[\s\S]*?<\/section>/gi,
      "",
    )
    .replace(/<canvas[\s\S]*?<\/canvas>/gi, "");
};

const assertValidGeneratedHtml = (html: string): void => {
  if (!/^<!DOCTYPE html>/i.test(html)) {
    throw new Error("Generated HTML must start with <!DOCTYPE html>");
  }

  if (!/<html[\s>]/i.test(html) || !/<\/html>\s*$/i.test(html)) {
    throw new Error("Generated HTML is incomplete");
  }

  if (!/<head[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) {
    throw new Error("Generated HTML must contain head and body");
  }

  if (/<canvas[\s>]/i.test(html)) {
    throw new Error("Generated HTML contains forbidden canvas");
  }

  if (html.includes("```")) {
    throw new Error("Generated HTML contains Markdown wrapper");
  }

  const remainingPlaceholder = Object.values(IMAGE_PLACEHOLDERS).find(
    (placeholder) => html.includes(placeholder),
  );

  if (remainingPlaceholder) {
    throw new Error(
      `Generated HTML contains unreplaced placeholder: ${remainingPlaceholder}`,
    );
  }
};

export const prepareHtmlForResponse = (
  generatedHtml: string,
  images: GeneratedImages,
): string => {
  let html = removeImageQueryMetadata(generatedHtml);

  html = replaceImagePlaceholders(html, images);
  html = replaceRemainingPlaceholders(html);
  html = removeUnsafeOrUnwantedAttributes(html);
  html = cleanHtmlContent(html);

  assertValidGeneratedHtml(html);

  return html;
};