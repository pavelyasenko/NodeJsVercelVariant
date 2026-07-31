export type PexelsOrientation = "landscape" | "portrait" | "square";

export interface GetImageOptions {
  orientation?: PexelsOrientation;
  perPage?: number;
}

export interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  alt?: string;
  src: {
    original?: string;
    large2x?: string;
    large?: string;
    medium?: string;
    landscape?: string;
    portrait?: string;
  };
}

export interface PexelsSearchResponse {
  photos?: PexelsPhoto[];
}

export interface RankedPexelsCandidate {
  photo: PexelsPhoto;
  url: string;
  score: number;
  index: number;
}

export interface SelectedPexelsPhoto {
  photo: PexelsPhoto;
  url: string;
}

export interface ImageInlinePart {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

export interface ImageRelevanceDecision {
  selectedIndex: number | null;
  confidence?: number;
  reason?: string;
}

export interface SelectPexelsPhotoOptions {
  photos: readonly PexelsPhoto[];
  query: string;
  orientation: PexelsOrientation;
  usedPhotoIds?: ReadonlySet<number>;
  usedImageUrls?: ReadonlySet<string>;
  skipSemanticMatch?: boolean;
  context?: string;
}