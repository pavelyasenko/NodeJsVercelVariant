import { IMAGE_SLOT_CONFIG } from "../config/imageSlots.config.js";
import type { GeneratedImages } from "./landing.types.js";
import { escapeXml } from "../utils/text.utils.js";

export const IMAGE_PLACEHOLDERS = {
  hero: "{{HERO_IMAGE}}",
  about1: "{{ABOUT_IMAGE_1}}",
  about2: "{{ABOUT_IMAGE_2}}",
  product1: "{{PRODUCT_IMAGE_1}}",
  product2: "{{PRODUCT_IMAGE_2}}",
  product3: "{{PRODUCT_IMAGE_3}}",
  product4: "{{PRODUCT_IMAGE_4}}",
  product5: "{{PRODUCT_IMAGE_5}}",
  product6: "{{PRODUCT_IMAGE_6}}",
  gallery1: "{{GALLERY_IMAGE_1}}",
  gallery2: "{{GALLERY_IMAGE_2}}",
  gallery3: "{{GALLERY_IMAGE_3}}",
  gallery4: "{{GALLERY_IMAGE_4}}",
  gallery5: "{{GALLERY_IMAGE_5}}",
  gallery6: "{{GALLERY_IMAGE_6}}",
  review1: "{{REVIEW_IMAGE_1}}",
  review2: "{{REVIEW_IMAGE_2}}",
  review3: "{{REVIEW_IMAGE_3}}",
} as const;

export type ImageSlot = keyof typeof IMAGE_PLACEHOLDERS;

export const IMAGE_SLOTS = Object.keys(IMAGE_PLACEHOLDERS) as ImageSlot[];
export const REQUIRED_IMAGE_QUERY_COUNT = IMAGE_SLOTS.length;
export const IMAGE_QUERY_METADATA_PATTERN =
  /<!--\s*IMAGE_QUERIES_START\s*([\s\S]*?)\s*IMAGE_QUERIES_END\s*-->/i;

const normalizeAccentColor = (value: string): string => {
  const color = value.trim();

  if (/^#[\da-f]{6}$/i.test(color)) {
    return color;
  }

  if (/^#[\da-f]{3}$/i.test(color)) {
    const red = color[1] ?? "0";
    const green = color[2] ?? "0";
    const blue = color[3] ?? "0";

    return `#${red}${red}${green}${green}${blue}${blue}`;
  }

  return "#312e81";
};

export const createSlotFallbackImage = (
  slot: ImageSlot,
  query: string,
  accentColor: string,
): string => {
  const label = escapeXml(IMAGE_SLOT_CONFIG[slot].fallbackLabel);
  const subject = escapeXml(query.slice(0, 54));
  const color = normalizeAccentColor(accentColor);

  return (
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
        <defs>
          <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#111827"/>
            <stop offset="100%" stop-color="${color}"/>
          </linearGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#background)"/>
        <circle cx="1310" cy="170" r="250" fill="#ffffff" opacity="0.06"/>
        <circle cx="230" cy="760" r="330" fill="#ffffff" opacity="0.04"/>
        <text x="800" y="420" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="58" font-weight="700">${label}</text>
        <text x="800" y="500" text-anchor="middle" fill="#ffffff" opacity="0.72" font-family="Arial, sans-serif" font-size="28">${subject}</text>
      </svg>
    `)
  );
};

export const FALLBACK_IMAGE = createSlotFallbackImage(
  "hero",
  "Generated Website",
  "#312e81",
);

export const replaceImagePlaceholders = (
  html: string,
  images: GeneratedImages,
): string => {
  let result = html;

  for (const key of IMAGE_SLOTS) {
    result = result.replaceAll(IMAGE_PLACEHOLDERS[key], images[key]);
  }

  return result;
};

export const replaceRemainingPlaceholders = (html: string): string => {
  let result = html;

  for (const placeholder of Object.values(IMAGE_PLACEHOLDERS)) {
    result = result.replaceAll(placeholder, FALLBACK_IMAGE);
  }

  return result;
};
