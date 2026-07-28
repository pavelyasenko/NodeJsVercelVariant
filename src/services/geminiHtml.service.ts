import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Complexity } from "../config/landingComplexity.config.js";
import {
  assertGeneratedImagePlan,
  extractHtmlDocument,
} from "./htmlProcessing.service.js";
import { buildPrompt } from "./landingPrompt.service.js";
import type { AppFormData } from "./landing.types.js";

const DEFAULT_GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
] as const;

const GEMINI_MODELS = [
  ...new Set(
    (
      process.env.GEMINI_MODELS?.trim() ||
      process.env.GEMINI_MODEL?.trim() ||
      DEFAULT_GEMINI_MODELS.join(",")
    )
      .split(",")
      .map((modelName) => modelName.trim())
      .filter(Boolean),
  ),
];
const GEMINI_MAX_OUTPUT_TOKENS = 32768;
const HTML_GENERATION_ATTEMPTS = Math.min(
  Math.max(Number(process.env.GEMINI_HTML_GENERATION_ATTEMPTS ?? 2), 1),
  3,
);

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const summarizeGeminiFailure = (
  modelName: string,
  error: unknown,
): string => {
  const message = getErrorMessage(error);
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("429") ||
    normalizedMessage.includes("quota exceeded")
  ) {
    return `${modelName}: quota exceeded or this model has no free-tier quota for your key`;
  }

  if (
    normalizedMessage.includes("503") ||
    normalizedMessage.includes("high demand")
  ) {
    return `${modelName}: temporarily unavailable because of high demand`;
  }

  return `${modelName}: ${message.slice(0, 700)}`;
};

const buildAllModelsFailureMessage = (modelErrors: readonly string[]): string => {
  const joinedErrors = modelErrors.join("\n");

  if (
    modelErrors.length > 0 &&
    modelErrors.every(
      (error) =>
        error.includes("quota exceeded") ||
        error.includes("temporarily unavailable"),
    )
  ) {
    return (
      "All configured Gemini models are currently unavailable because of API " +
      `quota limits or temporary high demand:\n${joinedErrors}`
    );
  }

  return `All configured Gemini models failed:\n${joinedErrors}`;
};

const buildRetryDirective = (previousFailure: string): string => `

THE PREVIOUS RESPONSE FAILED VALIDATION:
${previousFailure}

- Generate the document again from the beginning; do not continue the previous response.
- Make the HTML more compact by removing repetitive markup and long comments.
- Preserve all required sections and working JavaScript.
- Correct the image placeholders and IMAGE_QUERIES metadata according to the rules above.
- You must finish the response with closing </body> and </html> tags.
- Return exactly one complete HTML document.`;

const generateHtmlWithRetries = async (
  model: ReturnType<
    InstanceType<typeof GoogleGenerativeAI>["getGenerativeModel"]
  >,
  modelName: string,
  prompt: string,
  complexity: Complexity,
): Promise<string> => {
  let previousFailure = "The response did not pass validation";

  for (let attempt = 1; attempt <= HTML_GENERATION_ATTEMPTS; attempt += 1) {
    const retryDirective =
      attempt === 1 ? "" : buildRetryDirective(previousFailure);
    const response = await model.generateContent(`${prompt}${retryDirective}`);
    const rawText = response.response.text();
    const finishReason =
      response.response.candidates?.[0]?.finishReason ?? "UNKNOWN";

    if (!rawText || rawText.trim().length === 0) {
      previousFailure =
        `Gemini returned an empty response. Finish reason: ${finishReason}`;
      console.warn(
        `Gemini model ${modelName} returned an empty response on attempt ` +
          `${attempt}/${HTML_GENERATION_ATTEMPTS}. Finish reason: ${finishReason}`,
      );

      if (attempt === HTML_GENERATION_ATTEMPTS) {
        throw new Error(previousFailure);
      }

      continue;
    }

    try {
      const html = extractHtmlDocument(rawText);
      assertGeneratedImagePlan(html, complexity);

      console.log(`Gemini model succeeded: ${modelName}`);

      return html;
    } catch (error) {
      previousFailure = error instanceof Error ? error.message : String(error);
      console.warn(
        `Gemini model ${modelName} failed validation on attempt ` +
          `${attempt}/${HTML_GENERATION_ATTEMPTS}: ${previousFailure}. ` +
          `Finish reason: ${finishReason}. Response length: ${rawText.length}`,
      );

      if (attempt === HTML_GENERATION_ATTEMPTS) {
        throw new Error(
          `${previousFailure} after ${HTML_GENERATION_ATTEMPTS} attempts. ` +
            `Finish reason: ${finishReason}`,
        );
      }
    }
  }

  throw new Error("Gemini generation attempts were exhausted");
};

export const generateHtmlWithGemini = async (
  formData: AppFormData,
): Promise<string> => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const generativeAI = new GoogleGenerativeAI(apiKey);
  const prompt = buildPrompt(formData);
  const modelErrors: string[] = [];

  for (const modelName of GEMINI_MODELS) {
    console.log(`Trying Gemini model: ${modelName}`);

    try {
      const model = generativeAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.65,
          topP: 0.9,
          maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        },
      });

      return await generateHtmlWithRetries(
        model,
        modelName,
        prompt,
        formData.Complexity,
      );
    } catch (error) {
      const message = summarizeGeminiFailure(modelName, error);

      modelErrors.push(message);
      console.warn(`${message}. Trying the next configured model.`);
    }
  }

  throw new Error(buildAllModelsFailureMessage(modelErrors));
};