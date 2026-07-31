export interface GenerateImageOptions {
  projectName?: string;
  description?: string;
  slot?: string;
  accentColor?: string;
}

export interface GeminiImagePart {
  text?: string;
  inlineData?: {
    data?: string;
    mimeType?: string;
  };
  inline_data?: {
    data?: string;
    mime_type?: string;
  };
}

export interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiImagePart[];
    };
  }>;
}

export interface ExtractedImage {
  data: string;
  mimeType: string;
}

export interface ImagePromptRewrite {
  prompt: string;
  reason?: string;
}

export interface GoogleSearchTool {
  type: "google_search";
  search_types?: string[];
}
