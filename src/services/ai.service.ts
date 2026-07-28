import { generateHtmlWithGemini } from "./geminiHtml.service.js";
import { prepareHtmlForResponse } from "./htmlProcessing.service.js";
import { loadImages } from "./landingImages.service.js";
import { normalizeFormData } from "./landingPrompt.service.js";
import type { AppFormData, LandingPageData } from "./landing.types.js";
import { MOCK_HTML } from "./mockHtml.service.js";

export type { AppFormData, LandingPageData } from "./landing.types.js";

const USE_MOCK_WEBSITE =
  process.env.GENERATE_WEBSITE_USE_MOCK?.trim().toLowerCase() === "true" ||
  process.env.GENERATE_WEBSITE_MOCK?.trim().toLowerCase() === "true";

export const generateWebsiteData = async (
  rawFormData: AppFormData,
): Promise<LandingPageData> => {
  const formData = normalizeFormData(rawFormData);

  if (USE_MOCK_WEBSITE) {
    console.log("Generate website mock mode is enabled");

    return {
      success: true,
      html: MOCK_HTML,
    };
  }

  try {
    const generatedHtml = await generateHtmlWithGemini(formData);
    const images = await loadImages(formData, generatedHtml);
    const html = prepareHtmlForResponse(generatedHtml, images);

    return {
      success: true,
      html,
    };
  } catch (error) {
    console.error("generateWebsiteData failed:", error);

    if (error instanceof Error) {
      throw new Error(`Website generation failed: ${error.message}`);
    }

    throw new Error("Website generation failed because of an unknown error");
  }
};