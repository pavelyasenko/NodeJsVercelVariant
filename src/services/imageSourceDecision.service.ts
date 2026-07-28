export type ImageSourceDecision = "stock" | "generate";

interface DecideImageSourceOptions {
  projectName?: string;
  description?: string;
  query?: string;
  hasConfiguredStockQueries?: boolean;
}

interface GeminiTextResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

interface ParsedImageSourceDecision {
  source?: ImageSourceDecision;
  reason?: string;
}

const IMAGE_SOURCE_DECISION_MODEL =
  process.env.GEMINI_IMAGE_SOURCE_DECISION_MODEL?.trim() || "gemini-2.5-flash";
const IMAGE_SOURCE_DECISION_TIMEOUT_MS = 12_000;

const parseJsonObject = <T>(value: string): T | null => {
  const match = value.match(/\{[\s\S]*\}/);

  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
};

const callGeminiTextModel = async (prompt: string): Promise<string | null> => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    IMAGE_SOURCE_DECISION_TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_SOURCE_DECISION_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0,
            topP: 0.1,
            maxOutputTokens: 300,
          },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as GeminiTextResponse;

    return (
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim() || null
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const buildDecisionPrompt = (options: DecideImageSourceOptions): string => {
  return `
Decide the best image source for a generated commercial landing page.

Project name: ${options.projectName || "not provided"}
Business description: ${options.description || "not provided"}
Single image query: ${options.query || "not provided"}
Has configured stock-photo query pack: ${options.hasConfiguredStockQueries ? "yes" : "no"}

Available sources:
- "stock": use only when ordinary stock photography is likely to contain accurate images for the topic and a configured stock-photo query pack exists.
- "generate": use when stock search is likely to confuse the subject or return adjacent objects.

If there is no configured stock-photo query pack, choose "generate".
Choose "generate" for branded products, niche devices, fictional/custom products, rare product names, regulated goods, specific model names, products where exact appearance matters, or any topic that cannot be reliably represented by generic stock photos.
Choose "stock" for broad common businesses and scenes such as restaurants, coffee shops, salons, gyms, auto service, offices, hotels, real estate, generic teams, interiors, and common food.

Do not use a hardcoded keyword list. Infer from meaning.

Return only JSON:
{"source":"stock" | "generate", "reason":"short reason"}
`.trim();
};

export const decideImageSource = async (
  options: DecideImageSourceOptions,
): Promise<ImageSourceDecision> => {
  if (options.hasConfiguredStockQueries === false) {
    return "generate";
  }

  const rawText = await callGeminiTextModel(buildDecisionPrompt(options));
  const parsed = rawText
    ? parseJsonObject<ParsedImageSourceDecision>(rawText)
    : null;

  if (parsed?.source === "stock" || parsed?.source === "generate") {
    return parsed.source;
  }

  return options.hasConfiguredStockQueries ? "stock" : "generate";
};