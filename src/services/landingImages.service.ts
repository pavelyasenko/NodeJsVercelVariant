import { IMAGE_SLOT_CONFIG } from "../config/imageSlots.config.js";
import {
  IMAGE_LOADING_CONFIG,
  PEXELS_CONFIG,
} from "../config/pexels.config.js";
import type { PexelsPhoto } from "../types/pexels.types.js";
import { mapWithConcurrency } from "../utils/concurrency.js";
import { sanitizeImageQuery } from "../utils/text.utils.js";
import { generateSemanticImage } from "./imageGeneration.service.js";
import { resolveImageQueries } from "./imageQueryMetadata.service.js";
import {
  createSlotFallbackImage,
  IMAGE_PLACEHOLDERS,
  IMAGE_SLOTS,
  type ImageSlot,
} from "./imagePlaceholders.service.js";
import type { AppFormData, GeneratedImages } from "./landing.types.js";
import {
  searchPexelsCandidates,
  selectUniquePexelsPhoto,
} from "./pexels.service.js";

interface SlotCandidates {
  slot: ImageSlot;
  originalQuery: string;
  pexelsQuery: string;
  candidates: PexelsPhoto[];
}

const getSlotQuery = (
  slot: ImageSlot,
  queries: readonly string[],
): string => {
  const slotIndex = IMAGE_SLOTS.indexOf(slot);

  return queries[slotIndex] ?? IMAGE_SLOT_CONFIG[slot].querySuffix;
};

const generateSlotImage = async (
  formData: AppFormData,
  slot: ImageSlot,
  query: string,
): Promise<string | null> => {
  const image = await generateSemanticImage(query, {
    projectName: formData.ProjectName,
    description: formData.Description,
    slot,
    accentColor: formData.ColorPalette,
  });

  if (image && IMAGE_LOADING_CONFIG.debug) {
    console.log("Generated semantic fallback image:", { slot, query });
  }

  return image;
};

const generateImagesForSlots = async (
  formData: AppFormData,
  slots: readonly ImageSlot[],
  queries: readonly string[],
  images: GeneratedImages,
): Promise<void> => {
  await mapWithConcurrency(
    slots,
    IMAGE_LOADING_CONFIG.generatedFallbackConcurrency,
    async (slot) => {
      const query = getSlotQuery(slot, queries);
      const image = await generateSlotImage(formData, slot, query);

      if (image) {
        images[slot] = image;
      }
    },
  );
};

const loadCandidateSets = async (
  slots: readonly ImageSlot[],
  queries: readonly string[],
): Promise<SlotCandidates[]> =>
  mapWithConcurrency(
    slots,
    PEXELS_CONFIG.requestConcurrency,
    async (slot): Promise<SlotCandidates> => {
      const originalQuery = getSlotQuery(slot, queries);
      const pexelsQuery =
        sanitizeImageQuery(originalQuery) ||
        IMAGE_SLOT_CONFIG[slot].querySuffix;

      try {
        const candidates = await searchPexelsCandidates(
          pexelsQuery,
          IMAGE_SLOT_CONFIG[slot].orientation,
        );

        return { slot, originalQuery, pexelsQuery, candidates };
      } catch (error) {
        console.error(
          `Failed to load Pexels candidates for "${pexelsQuery}":`,
          error,
        );

        return {
          slot,
          originalQuery,
          pexelsQuery,
          candidates: [],
        };
      }
    },
  );

const resolveSlotImagesFromPexels = async (
  formData: AppFormData,
  slots: readonly ImageSlot[],
  queries: readonly string[],
  images: GeneratedImages,
): Promise<void> => {
  const candidateSets = await loadCandidateSets(slots, queries);
  const usedPhotoIds = new Set<number>();
  const usedImageUrls = new Set<string>();

  for (const candidateSet of candidateSets) {
    const { slot, originalQuery, pexelsQuery, candidates } = candidateSet;
    const selected = await selectUniquePexelsPhoto({
      photos: candidates,
      query: pexelsQuery,
      orientation: IMAGE_SLOT_CONFIG[slot].orientation,
      usedPhotoIds,
      usedImageUrls,
      skipSemanticMatch: slot.startsWith("review"),
      context: slot,
    });

    if (selected) {
      usedPhotoIds.add(selected.photo.id);
      usedImageUrls.add(selected.url);
      images[slot] = selected.url;

      if (IMAGE_LOADING_CONFIG.debug) {
        console.log("Selected Pexels image:", {
          slot,
          query: pexelsQuery,
          originalQuery,
          photoId: selected.photo.id,
          alt: selected.photo.alt,
        });
      }

      continue;
    }

    console.warn(`No unique Pexels image found for ${slot}: "${pexelsQuery}"`);

    const generatedImage = await generateSlotImage(
      formData,
      slot,
      originalQuery,
    );

    if (generatedImage) {
      images[slot] = generatedImage;
    }
  }
};

const createInitialImages = (
  formData: AppFormData,
  queries: readonly string[],
): GeneratedImages => {
  const images = {} as GeneratedImages;

  IMAGE_SLOTS.forEach((slot, index) => {
    const query = queries[index] ?? IMAGE_SLOT_CONFIG[slot].querySuffix;

    images[slot] = createSlotFallbackImage(
      slot,
      query,
      formData.ColorPalette,
    );
  });

  return images;
};

export const loadImages = async (
  formData: AppFormData,
  generatedHtml: string,
): Promise<GeneratedImages> => {
  const queries = resolveImageQueries(formData, generatedHtml);
  const images = createInitialImages(formData, queries);
  const activeSlots = IMAGE_SLOTS.filter((slot) =>
    generatedHtml.includes(IMAGE_PLACEHOLDERS[slot]),
  );

  if (activeSlots.length === 0) {
    console.warn("Generated HTML contains no image placeholders");
    return images;
  }

  if (!process.env.PEXELS_API_KEY?.trim()) {
    console.warn(
      "PEXELS_API_KEY is not configured; trying generated fallback images",
    );
    await generateImagesForSlots(formData, activeSlots, queries, images);
    return images;
  }

  await resolveSlotImagesFromPexels(
    formData,
    activeSlots,
    queries,
    images,
  );

  return images;
};