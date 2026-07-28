import {
  LANDING_COMPLEXITY_CONFIG,
  type Complexity,
  type LandingComplexityConfig,
} from "../config/landingComplexity.config.js";
import { PRODUCT_CARD_GUIDANCE } from "../config/productCardGuidance.config.js";
import { IMAGE_PLACEHOLDERS } from "./imagePlaceholders.service.js";
import type { AppFormData } from "./landing.types.js";

export const normalizeFormData = (formData: AppFormData): AppFormData => {
  const normalized: AppFormData = {
    ProjectName: formData.ProjectName?.trim(),
    Description: formData.Description?.trim(),
    Language: formData.Language?.trim(),
    Complexity: formData.Complexity,
    ColorPalette: formData.ColorPalette?.trim(),
    FBPixelID: formData.FBPixelID?.trim() || undefined,
  };

  if (!normalized.ProjectName) {
    throw new Error("ProjectName is required");
  }

  if (!normalized.Description) {
    throw new Error("Description is required");
  }

  if (!normalized.Language) {
    throw new Error("Language is required");
  }

  if (!normalized.ColorPalette) {
    throw new Error("ColorPalette is required");
  }

  if (
    !Object.prototype.hasOwnProperty.call(
      LANDING_COMPLEXITY_CONFIG,
      normalized.Complexity,
    )
  ) {
    throw new Error("Invalid Complexity value");
  }

  return normalized;
};

const getComplexityDirectives = (complexity: Complexity): string => {
  const config: LandingComplexityConfig =
    LANDING_COMPLEXITY_CONFIG[complexity];

  const sections = config.sections.map((section, index) =>
    config.orderedSections ? `${index + 1}. ${section}` : `- ${section}`,
  );

  const requirements = config.requirements?.map(
    (requirement) => `- ${requirement}`,
  );

  const forbidden = config.forbidden?.map((rule) => `- ${rule}`);

  return [
    config.introduction,
    config.orderedSections ? "REQUIRED SECTIONS:" : undefined,
    ...sections,
    requirements?.length ? "\nADDITIONAL REQUIREMENTS:" : undefined,
    ...(requirements ?? []),
    forbidden?.length ? "\nSTRICTLY FORBIDDEN:" : undefined,
    ...(forbidden ?? []),
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
};

const escapeForSingleQuotedJavaScript = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\r?\n/g, " ");

const getFacebookPixelSnippet = (pixelId?: string): string => {
  if (!pixelId) {
    return "";
  }

  const safePixelId = escapeForSingleQuotedJavaScript(pixelId);

  return `
<!-- Facebook Pixel Code -->
<script>
  !function(f,b,e,v,n,t,s) {
    if (f.fbq) return;
    n = f.fbq = function() {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    t = b.createElement(e);
    t.async = true;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  }(
    window,
    document,
    'script',
    'https://connect.facebook.net/en_US/fbevents.js'
  );

  fbq('init', '${safePixelId}');
  fbq('track', 'PageView');
</script>
<noscript>
  <img
    height="1"
    width="1"
    style="display:none"
    alt=""
    src="https://www.facebook.com/tr?id=${safePixelId}&ev=PageView&noscript=1"
  />
</noscript>
<!-- End Facebook Pixel Code -->`;
};

export const getRequiredProductCardCount = (complexity: Complexity): number =>
  LANDING_COMPLEXITY_CONFIG[complexity].productCardCount;

export const buildPrompt = (formData: AppFormData): string => {
  const complexityDirectives = getComplexityDirectives(formData.Complexity);
  const pixelSnippet = getFacebookPixelSnippet(formData.FBPixelID);
  const productCardCount = getRequiredProductCardCount(formData.Complexity);
  const productCardGuidance = PRODUCT_CARD_GUIDANCE.map(
    (rule) => `- ${rule}`,
  ).join("\n");
  const requiredProductPlaceholders = [
    IMAGE_PLACEHOLDERS.product1,
    IMAGE_PLACEHOLDERS.product2,
    IMAGE_PLACEHOLDERS.product3,
    IMAGE_PLACEHOLDERS.product4,
    IMAGE_PLACEHOLDERS.product5,
    IMAGE_PLACEHOLDERS.product6,
  ]
    .slice(0, productCardCount)
    .join(", ");

  return `
You are a professional full-stack developer and UX/UI designer.

Create a complete, responsive, single-page commercial website.

OUTPUT FORMAT:
- Return only valid HTML from <!DOCTYPE html> through </html>.
- Do not use Markdown and do not add explanations.
- Use Tailwind CSS through its CDN.
- Use only Vanilla JavaScript and addEventListener.

PROJECT DATA:
- Project name: "${formData.ProjectName}"
- Business description: "${formData.Description}"
- Website language: "${formData.Language}"
- Complexity: "${formData.Complexity}"
- Accent color: "${formData.ColorPalette}"

BUSINESS NAMING:
- Treat the business description as the source of truth for the actual products, services, topic, and recognizable brand names.
- Do not mutate, misspell, or rename brands and product lines mentioned in the business description.
- If the project name conflicts with a specific brand or product mentioned in the business description, use the project name only for the site logo/title and use the description's exact product/topic in cards and content.
- Do not imply this is an official brand store unless the description explicitly says so.

LANGUAGE:
- Write every user-visible text strictly in "${formData.Language}".
- Do not mix languages.

TYPOGRAPHY AND COLORS:
- Use the accent color only for buttons, links, icons, borders, and small decorative elements.
- Use a solid neutral color such as white, near-white, black, or dark gray for all headings.
- Do not apply the accent color to large headings or long text.
- Do not use gradient text, text-shadow, drop-shadow, glow, neon, luminous, or fluorescent effects on text.
- Do not use text-transparent, bg-clip-text, or background gradients to color headings.
- Headings must remain highly readable and visually clean on their background.

HERO:
- Make the first screen 85–100vh high.
- Use ${IMAGE_PLACEHOLDERS.hero} as the background image for the entire Hero.
- Do not create a two-column Hero and do not place the main image beside the content.
- Add a dark overlay with pointer-events-none.
- Give the Hero content relative z-10.
- Use a heading of no more than 8 words.
- Use one paragraph of no more than 22 words.
- Add no more than two CTA buttons.
- CTA buttons must lead to the products, services, menu, or pricing section.
- Do not place cards, statistics, testimonials, or forms inside the Hero.

STRUCTURE:
${complexityDirectives}

PRODUCT AND SERVICE CARDS:
- This section is required for every complexity level.
- Analyze the business description and create real items that users can order, buy, or select.
${productCardGuidance}
- Create exactly ${productCardCount} cards for this ${formData.Complexity} website.
- Every card must have a unique image, a specific name, a description of no more than 2 sentences, a price or plan, and a button.
- Use these product placeholders once each and in this exact card order: ${requiredProductPlaceholders}.
- The photo in each card must depict that card's exact named product or the exact service being performed.
- Every order button must include:
  type="button"
  data-action="buy"
  data-product="item name"
  data-price="price"

IMAGES:
- Do not insert real image URLs.
- Do not use Unsplash, Pexels, Picsum, or Pixabay URLs inside the HTML.
- Use only the following placeholders:

Hero:
${IMAGE_PLACEHOLDERS.hero}

About:
${IMAGE_PLACEHOLDERS.about1}
${IMAGE_PLACEHOLDERS.about2}

Product and service cards:
${IMAGE_PLACEHOLDERS.product1}
${IMAGE_PLACEHOLDERS.product2}
${IMAGE_PLACEHOLDERS.product3}
${IMAGE_PLACEHOLDERS.product4}
${IMAGE_PLACEHOLDERS.product5}
${IMAGE_PLACEHOLDERS.product6}

Gallery:
${IMAGE_PLACEHOLDERS.gallery1}
${IMAGE_PLACEHOLDERS.gallery2}
${IMAGE_PLACEHOLDERS.gallery3}
${IMAGE_PLACEHOLDERS.gallery4}
${IMAGE_PLACEHOLDERS.gallery5}
${IMAGE_PLACEHOLDERS.gallery6}

Testimonials:
${IMAGE_PLACEHOLDERS.review1}
${IMAGE_PLACEHOLDERS.review2}
${IMAGE_PLACEHOLDERS.review3}

- Every card must use its own PRODUCT_IMAGE.
- Do not repeat the same image across all cards.
- Do not use PRODUCT_IMAGE in the Hero.
- Use REVIEW_IMAGE only as an avatar.
- Use every required product placeholder exactly once. Never reuse one placeholder for multiple cards.
- If an About, Gallery, or Testimonials section exists, give every visible image its own matching placeholder from that group.
- Never add decorative stock photos that do not depict the surrounding section content.
- The finished page must contain at least ${productCardCount + 1} meaningful photos: one Hero image and one unique photo for each card.

IMAGE SEARCH METADATA:
- Add exactly one HTML comment immediately before </head> using this format:
  <!-- IMAGE_QUERIES_START ["query 1", "query 2", "query 3", "query 4", "query 5", "query 6", "query 7", "query 8", "query 9", "query 10", "query 11", "query 12", "query 13", "query 14", "query 15", "query 16", "query 17", "query 18"] IMAGE_QUERIES_END -->
- The content between the markers must be a valid JSON array of exactly 18 English strings.
- All 18 queries must be different. Never copy one query into another position.
- Write concise, visually descriptive stock-photo or generated-image prompts in English, regardless of the website language.
- Put the concrete visible subject first, then its context and shot type.
- Do not merely translate the project name. Describe the exact objects, food, room, equipment, person, or action that must appear.
- Never use vague standalone concepts such as "success", "innovation", "quality", "lifestyle", "technology", or "business".
- For branded or niche products, describe their generic visual appearance as well as the product category. For example, use "white wireless earbuds product close up" instead of only a brand name.
- Queries 4–9 must describe the exact item or service named in the corresponding card. Food cards must name the dish. Service cards must name the action and relevant equipment.
- For unknown or niche business types, infer the visual category from the card names yourself and write literal object queries. For example, use "abstract canvas wall art close up", "hand painted ceramic vase on pedestal", or "small metal sculpture figurine on display" instead of generic product or business queries.
- Queries 10–15 must show six different scenes, details, angles, or stages. Do not repeat the Hero or card subjects verbatim.
- Keep the queries in this exact order:
  1. Hero background.
  2. First About image.
  3. Second About image.
  4–9. Six product or service card images in the same order as their cards.
  10–15. Six gallery images.
  16–18. Three natural customer portraits for testimonials.
- This metadata comment is mandatory. It will be removed by the backend before the HTML is returned to the user.

INTERACTIVITY:
- Every button and link must work.
- Decorative overlays must have pointer-events-none.
- Invisible absolutely positioned elements must not cover buttons.
- Add one event-delegation handler for [data-action="buy"].
- Clicking an order button must open an order modal containing the item name and price.
- Add name and phone or email fields, validation, and a toast notification.
- The modal must close through its close button, the Escape key, and a backdrop click.

FOOTER LEGAL CONTENT:
- The footer must contain working Privacy Policy and Terms of Use links.
- Never use href="#", an empty href, javascript:void(0), or links without a destination.
- The Privacy Policy link must use href="#privacy-policy".
- The Terms of Use link must use href="#terms-of-use".
- Create two modal dialogs with the exact IDs "privacy-policy" and "terms-of-use".
- Each dialog must contain a heading and at least three meaningful paragraphs adapted to this business.
- Generate all legal content strictly in "${formData.Language}".
- The Privacy Policy must explain what user data is collected, why it is used, and whether it is shared.
- The Terms of Use must explain website usage, product or service information, ordering terms, and content ownership.
- Each legal dialog must have a visible close button.
- The legal dialogs must close with the close button, the Escape key, and a backdrop click.
- Add working JavaScript that opens the correct dialog when its footer link is clicked.
- Style both dialogs consistently with the rest of the landing page.

JAVASCRIPT:
- Mobile menu.
- Smooth scrolling.
- FAQ accordion.
- Form validation.
- Toast notifications.
- Order modal.
- IntersectionObserver.

STRICTLY FORBIDDEN:
- Canvas.
- Mini-games.
- Game sections.
- Shooter, Score, Lives, Start Game, Pause Game, or Restart Game.
- Game loops.
- User comments and comment forms.

FACEBOOK PIXEL:
${
  pixelSnippet
    ? `Insert the following code into <head>:\n${pixelSnippet}`
    : "Do not add Facebook Pixel."
}

FINAL CHECK:
- A product or service section exists.
- The product or service section contains exactly ${productCardCount} cards.
- Every card uses a different PRODUCT_IMAGE.
- Order buttons work.
- The Hero uses HERO_IMAGE as its background.
- Overlays do not block clicks.
- There is no Canvas, game, or comment section.
- The HTML starts with <!DOCTYPE html> and ends with </html>.

Return only clean HTML.
`.trim();
};