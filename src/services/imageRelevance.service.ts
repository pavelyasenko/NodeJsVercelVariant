import { GoogleGenerativeAI } from "@google/generative-ai";
import { Buffer } from "node:buffer";
import {
  IMAGE_LOADING_CONFIG,
  IMAGE_RELEVANCE_CONFIG,
} from "../config/pexels.config.js";
import type {
  ImageInlinePart,
  ImageRelevanceDecision,
  RankedPexelsCandidate,
} from "../types/pexels.types.js";
import { parseJsonObject } from "../utils/geminiImageResponse.utils.js";

const fetchImageInlinePart = async (
  url: string,
): Promise<ImageInlinePart | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    IMAGE_RELEVANCE_CONFIG.requestTimeoutMs,
  );

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      return null;
    }

    const mimeType = response.headers.get("content-type") ?? "image/jpeg";

    if (!mimeType.startsWith("image/")) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      inlineData: {
        data: buffer.toString("base64"),
        mimeType,
      },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const buildRelevancePrompt = (
  query: string,
  context: string,
  candidates: readonly RankedPexelsCandidate[],
): string => `
You are choosing a stock photo for a generated commercial landing page.

Search query: "${query}"
Image slot: "${context}"

Pick the single image that visually matches the query best.
Reject images that do not clearly show the requested object, place, service, dish, person, or action.
Do not choose an image only because colors, mood, or general category are similar.

Candidate indexes and Pexels alt text:
${candidates
  .map(
    (candidate, index) =>
      `${index}. ${candidate.photo.alt?.trim() || "No alt text"}`,
  )
  .join("\n")}

Return only JSON in this exact shape:
{"selectedIndex": number | null, "confidence": number, "reason": "short reason"}
Use selectedIndex:null when none of the images clearly match the query.
`.trim();

const isValidDecision = (
  decision: ImageRelevanceDecision | null,
  candidateCount: number,
): decision is ImageRelevanceDecision & { selectedIndex: number } =>
  Boolean(
    decision &&
      decision.selectedIndex !== null &&
      Number.isInteger(decision.selectedIndex) &&
      decision.selectedIndex >= 0 &&
      decision.selectedIndex < candidateCount &&
      (decision.confidence ?? 0) >= IMAGE_RELEVANCE_CONFIG.minConfidence,
  );

export const selectPexelsCandidateWithGemini = async (
  query: string,
  context: string,
  candidates: readonly RankedPexelsCandidate[],
): Promise<RankedPexelsCandidate | null> => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (candidates.length === 0) {
    return null;
  }

  if (!apiKey || context.startsWith("review")) {
    return candidates[0];
  }

  try {
    const imageParts = await Promise.all(
      candidates.map(async (candidate) => {
        const part = await fetchImageInlinePart(candidate.url);

        return part ? { candidate, part } : null;
      }),
    );
    const validParts = imageParts.filter(
      (
        item,
      ): item is {
        candidate: RankedPexelsCandidate;
        part: ImageInlinePart;
      } => item !== null,
    );

    if (validParts.length === 0) {
      return candidates[0];
    }

    const validCandidates = validParts.map(({ candidate }) => candidate);
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: IMAGE_RELEVANCE_CONFIG.model,
      generationConfig: {
        temperature: 0,
        topP: 0.1,
        maxOutputTokens: 400,
      },
    });
    const response = await model.generateContent([
      buildRelevancePrompt(query, context, validCandidates),
      ...validParts.map(({ part }) => part),
    ]);
    const decision = parseJsonObject<ImageRelevanceDecision>(
      response.response.text(),
    );

    if (!isValidDecision(decision, validCandidates.length)) {
      if (IMAGE_LOADING_CONFIG.debug) {
        console.warn("Gemini rejected Pexels candidates:", {
          context,
          query,
          decision,
        });
      }

      return null;
    }

    const selected = validCandidates[decision.selectedIndex];

    if (IMAGE_LOADING_CONFIG.debug) {
      console.log("Gemini selected Pexels candidate:", {
        context,
        query,
        decision,
        photoId: selected.photo.id,
        alt: selected.photo.alt,
      });
    }

    return selected;
  } catch (error) {
    console.warn(`Gemini image relevance check failed for "${query}":`, error);
    return candidates[0];
  }
};