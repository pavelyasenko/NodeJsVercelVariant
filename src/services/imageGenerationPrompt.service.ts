import type { GenerateImageOptions } from "../types/imageGeneration.types.js";

const getProjectContext = (options: GenerateImageOptions): string => `
- Project name: ${options.projectName || "Generated website"}
- Business description: ${options.description || "Commercial landing page"}
- Image slot: ${options.slot || "website image"}
- Accent color: ${options.accentColor || "not specified"}`;

export const buildPromptRewriteInstruction = (
  query: string,
  options: GenerateImageOptions,
): string => `
Rewrite the user's image search query into one precise visual prompt for AI image generation.

Original query:
${query}

Project context:
${getProjectContext(options)}

Rules:
- Preserve the real intended subject.
- If the query uses a brand name, convert it to a generic visual description of the product category and visible form factor.
- Do not include brand logos, trademarked marks, readable packaging text, watermarks, or UI text.
- For regulated or sensitive product topics, describe a neutral product or accessory mockup with shape, material, color, and clean retail composition.
- Do not show product use, harmful behavior, health claims, minors, or lifestyle promotion.
- For rare or fictional products, include shape, material, color, context, and camera angle.
- Make the prompt suitable for a commercial landing page image.
- Keep it under 60 words.

Return only JSON:
{"prompt":"rewritten visual prompt","reason":"short reason"}
`.trim();

export const buildImageGenerationPrompt = (
  query: string,
  options: GenerateImageOptions,
): string => `
Create one high-quality commercial landing page image.

Required visible subject:
${query}

Context:
${getProjectContext(options)}

Rules:
- The image must clearly show the requested subject.
- Prefer realistic commercial product photography for physical goods and real-world services.
- If the subject is a physical product, show that exact product category as the main object.
- Do not replace the subject with unrelated electronics, cars, tools, food, or abstract objects.
- For fictional, branded, niche, or hard-to-find subjects, create a polished realistic generic product mockup.
- Do not add readable text, UI, watermarks, brand logos, captions, posters, or labels.
- For regulated or sensitive topics, avoid product use, harmful behavior, health claims, minors, and lifestyle promotion.
- Do not create a collage.
- Keep the image clean, modern, and commercially usable.
`.trim();