import { imageGenerationConfig } from "../config/imageGeneration.config.js";
import type { ExtractedImage } from "../types/imageGeneration.types.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

const getStringField = (
  value: Record<string, unknown>,
  key: string,
): string | undefined => {
  const field = value[key];

  return typeof field === "string" ? field : undefined;
};

const looksLikeBase64ImageData = (value: string): boolean =>
  value.length >= 100 && /^[A-Za-z0-9+/=]+$/.test(value.slice(0, 160));

export const parseJsonObject = <T>(value: string): T | null => {
  const normalized = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(normalized) as T;
  } catch {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");

    if (start < 0 || end <= start) {
      return null;
    }

    try {
      return JSON.parse(normalized.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
};

export const extractImageFromResponse = (
  value: unknown,
): ExtractedImage | null => {
  const seen = new Set<object>();

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
        mimeType: mimeType ?? imageGenerationConfig.mimeType,
      };
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

export const formatImageDataUrl = (image: ExtractedImage): string =>
  `data:${image.mimeType};base64,${image.data}`;