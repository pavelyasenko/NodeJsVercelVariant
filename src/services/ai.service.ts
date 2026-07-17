import { GoogleGenerativeAI } from "@google/generative-ai";
import { getImage } from "./pexels.service.js";

export interface AppFormData {
  ProjectName: string;
  Description: string;
  Language: string;
  Complexity: "Minimal" | "Low" | "Medium" | "High";
  ColorPalette: string;
  FBPixelID?: string;
}

export interface LandingPageData {
  success: boolean;
  html: string;
}

type Complexity = AppFormData["Complexity"];

interface GeneratedImages {
  hero: string;
  about1: string;
  about2: string;
  product1: string;
  product2: string;
  product3: string;
  product4: string;
  product5: string;
  product6: string;
  gallery1: string;
  gallery2: string;
  gallery3: string;
  gallery4: string;
  gallery5: string;
  gallery6: string;
  review1: string;
  review2: string;
  review3: string;
}

const GEMINI_MODEL =
  process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

const DEBUG_MODE =
  process.env.GENERATE_WEBSITE_DEBUG === "true";

const IMAGE_PLACEHOLDERS = {
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

const FALLBACK_IMAGE =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
      <defs>
        <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#111827"/>
          <stop offset="100%" stop-color="#312e81"/>
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#background)"/>
      <circle cx="1280" cy="180" r="240" fill="#ffffff" opacity="0.06"/>
      <circle cx="260" cy="760" r="320" fill="#ffffff" opacity="0.04"/>
      <text
        x="800"
        y="450"
        text-anchor="middle"
        dominant-baseline="middle"
        fill="#ffffff"
        font-family="Arial, sans-serif"
        font-size="58"
        font-weight="700"
      >
        Generated Website
      </text>
    </svg>
  `);

const MOCK_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://cdn.tailwindcss.com"></script>
  <title>Sushi Landing</title>
</head>
<body class="min-h-screen w-full bg-slate-950 text-white">
  <main class="mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center px-6 py-16 text-center">
    <img
      src="${FALLBACK_IMAGE}"
      alt="Generated preview"
      class="mb-10 h-72 w-full rounded-3xl object-cover shadow-2xl"
    />
    <h1 class="mb-6 text-4xl font-bold sm:text-6xl">Вкуснейшие суши в Одессе</h1>
    <p class="mb-8 max-w-2xl text-lg font-light text-slate-300 sm:text-xl">
      Свежие ингредиенты, быстрая доставка и внимательное отношение к каждому заказу.
    </p>
    <button
      type="button"
      class="rounded-xl bg-red-600 px-7 py-4 font-semibold text-white transition hover:bg-red-700"
    >
      Заказать сейчас
    </button>
  </main>
</body>
</html>`;

const normalizeFormData = (
  formData: AppFormData,
): AppFormData => {
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

  const allowedComplexities: Complexity[] = [
    "Minimal",
    "Low",
    "Medium",
    "High",
  ];

  if (!allowedComplexities.includes(normalized.Complexity)) {
    throw new Error("Invalid Complexity value");
  }

  return normalized;
};

const getComplexityDirectives = (
  complexity: Complexity,
): string => {
  switch (complexity) {
    case "Minimal":
      return `
- Header.
- Hero на весь первый экран с фоновой фотографией.
- Обязательная секция товаров или услуг: минимум 3 карточки.
- Короткий About.
- Контактный CTA.
- Footer.
- В Hero: заголовок максимум 8 слов, один абзац максимум 22 слова и максимум 2 кнопки.`;

    case "Low":
      return `
- Header.
- Hero на весь первый экран с фоновой фотографией.
- About.
- Обязательная секция товаров или услуг: минимум 4 карточки.
- 3 преимущества.
- Контактная форма.
- Footer.`;

    case "Medium":
      return `
- Header.
- Hero на весь первый экран с фоновой фотографией.
- About.
- Обязательная секция товаров или услуг: ровно 6 карточек.
- 4 преимущества.
- Галерея из 6 изображений.
- 3 отзыва.
- FAQ из 5 вопросов.
- Форма заявки.
- Footer.`;

    case "High":
      return `
- Создай большой премиальный коммерческий лендинг.
- Обязательные секции:
  1. Header с логотипом, навигацией и CTA.
  2. Hero на весь первый экран с фоновой фотографией.
  3. About с двумя тематическими изображениями.
  4. РОВНО 6 карточек товаров, услуг, меню или тарифов.
  5. Минимум 4 преимущества.
  6. Четыре показателя статистики.
  7. Галерея из 6 изображений.
  8. Три отзыва.
  9. FAQ из 6 вопросов.
  10. Форма заявки и контакты.
  11. Footer с четырьмя колонками.
- В каждой карточке: конкретная позиция, отдельное изображение, название, короткое описание, цена или тариф и рабочая кнопка заказа.
- Не используй абстрактные названия вроде "Услуга 1" или "Товар 1".

СТРОГО ЗАПРЕЩЕНО:
- Canvas.
- Мини-игра.
- Игровой блок.
- Shooter, Score, Lives, Start Game, Pause Game, Restart Game.
- Игровые циклы и requestAnimationFrame для игры.
- Комментарии пользователей и форма комментариев.`;
  }
};

const escapeForSingleQuotedJavaScript = (
  value: string,
): string =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, " ");

const getFacebookPixelSnippet = (
  pixelId?: string,
): string => {
  if (!pixelId) {
    return "";
  }

  const safePixelId =
    escapeForSingleQuotedJavaScript(pixelId);

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

const buildPrompt = (
  formData: AppFormData,
): string => {
  const complexityDirectives =
    getComplexityDirectives(formData.Complexity);

  const pixelSnippet =
    getFacebookPixelSnippet(formData.FBPixelID);

  return `
Ты — профессиональный Full-Stack разработчик и UX/UI дизайнер.

Создай готовый адаптивный одностраничный коммерческий сайт.

ФОРМАТ:
- Верни только один валидный HTML-документ.
- Документ должен начинаться с <!DOCTYPE html>.
- Документ должен содержать <html>, <head> и <body>.
- Документ должен заканчиваться </html>.
- Не используй Markdown-блоки \`\`\`.
- Не добавляй объяснения до или после HTML.
- Используй Tailwind CSS через CDN.
- Используй только Vanilla JavaScript и addEventListener.
- Не сокращай код и не используй комментарии вместо разметки.

ДАННЫЕ:
- Название: "${formData.ProjectName}"
- Описание бизнеса: "${formData.Description}"
- Язык сайта: "${formData.Language}"
- Сложность: "${formData.Complexity}"
- Акцентный цвет: "${formData.ColorPalette}"

ЯЗЫК:
- Все видимые пользователю тексты строго на языке "${formData.Language}".
- Не смешивай языки.

HERO:
- Высота первого экрана 85–100vh.
- Используй ${IMAGE_PLACEHOLDERS.hero} как background-image на весь Hero.
- Не создавай Hero в две колонки и не размещай изображение сбоку.
- Добавь затемняющий overlay с pointer-events-none.
- Контент Hero должен иметь relative z-10.
- Заголовок максимум 8 слов.
- Один абзац максимум 22 слова.
- Максимум две CTA-кнопки.
- CTA ведут к секции товаров, услуг, меню или тарифов.
- Не добавляй в Hero карточки, статистику, отзывы или форму.

СТРУКТУРА:
${complexityDirectives}

КАРТОЧКИ ТОВАРОВ И УСЛУГ:
- Секция обязательна при любой сложности.
- Проанализируй описание бизнеса и создай реальные позиции, которые можно заказать, купить или выбрать.
- Для суши: конкретные роллы, сеты, нигири, блюда и напитки.
- Для компьютерного клуба: час игры, ночной тариф, VIP, PlayStation, турнирный пакет, абонемент.
- Для магазина: конкретные товары или категории.
- Для салона: конкретные процедуры.
- Для автосервиса: конкретные услуги.
- Для Medium и High создай ровно 6 карточек.
- Каждая карточка содержит отдельное изображение, конкретное название, описание максимум 2 предложения, цену или тариф и кнопку.
- Каждая кнопка заказа должна иметь:
  type="button"
  data-action="buy"
  data-product="название позиции"
  data-price="цена"

ИЗОБРАЖЕНИЯ:
- Не вставляй реальные URL.
- Не используй Unsplash, Pexels, Picsum или Pixabay внутри HTML.
- Используй только эти плейсхолдеры:

Hero:
${IMAGE_PLACEHOLDERS.hero}

About:
${IMAGE_PLACEHOLDERS.about1}
${IMAGE_PLACEHOLDERS.about2}

Карточки товаров и услуг:
${IMAGE_PLACEHOLDERS.product1}
${IMAGE_PLACEHOLDERS.product2}
${IMAGE_PLACEHOLDERS.product3}
${IMAGE_PLACEHOLDERS.product4}
${IMAGE_PLACEHOLDERS.product5}
${IMAGE_PLACEHOLDERS.product6}

Галерея:
${IMAGE_PLACEHOLDERS.gallery1}
${IMAGE_PLACEHOLDERS.gallery2}
${IMAGE_PLACEHOLDERS.gallery3}
${IMAGE_PLACEHOLDERS.gallery4}
${IMAGE_PLACEHOLDERS.gallery5}
${IMAGE_PLACEHOLDERS.gallery6}

Отзывы:
${IMAGE_PLACEHOLDERS.review1}
${IMAGE_PLACEHOLDERS.review2}
${IMAGE_PLACEHOLDERS.review3}

- Каждая карточка использует свой PRODUCT_IMAGE.
- Не повторяй одно изображение во всех карточках.
- PRODUCT_IMAGE не используй в Hero.
- REVIEW_IMAGE используй только как аватар.

КЛИКАБЕЛЬНОСТЬ:
- Все кнопки и ссылки должны реально работать.
- Декоративные overlay должны иметь pointer-events-none.
- Невидимые absolute-элементы не должны перекрывать кнопки.
- Для [data-action="buy"] добавь общий обработчик через event delegation.
- По клику открывай модальное окно заказа с названием и ценой позиции.
- Добавь поля имени и телефона или email, валидацию и toast.
- Закрытие модального окна: кнопка, Escape и клик по backdrop.

JAVASCRIPT:
- Мобильное меню.
- Плавный скролл.
- FAQ accordion.
- Валидация форм.
- Toast.
- Модальное окно заказа.
- IntersectionObserver.

СТРОГО ЗАПРЕЩЕНО:
- Canvas.
- Мини-игра.
- Game section.
- Shooter, Score, Lives, Start Game, Pause Game, Restart Game.
- Игровые циклы.
- Комментарии и форма комментариев.

FACEBOOK PIXEL:
${
  pixelSnippet
    ? `Вставь следующий код в <head>:\n${pixelSnippet}`
    : "Facebook Pixel не добавляй."
}

ФИНАЛЬНАЯ ПРОВЕРКА:
- Есть секция товаров или услуг.
- Для Medium и High ровно 6 карточек.
- У каждой карточки отдельный PRODUCT_IMAGE.
- Кнопки заказа работают.
- Hero использует HERO_IMAGE как фон.
- Overlay не блокирует клики.
- Нет Canvas, игры и комментариев.
- HTML начинается с <!DOCTYPE html>.
- HTML заканчивается </html>.
- После </html> нет никакого текста.

Верни только чистый HTML.
`.trim();
};

const safeGetImage = async (
  query: string,
  fallback = FALLBACK_IMAGE,
): Promise<string> => {
  try {
    const image = await getImage(query);

    if (
      typeof image !== "string" ||
      image.trim().length === 0
    ) {
      return fallback;
    }

    return image.trim();
  } catch (error) {
    console.error(
      `Failed to load image for query "${query}":`,
      error,
    );

    return fallback;
  }
};

const detectImageQueries = (
  formData: AppFormData,
): string[] => {
  const text =
    `${formData.ProjectName} ${formData.Description}`.toLowerCase();

  const has = (...words: string[]) =>
    words.some((word) => text.includes(word));

  if (has("суш", "ролл", "sushi", "japanese food")) {
    return [
      "sushi platter japanese restaurant dark table",
      "sushi chef preparing japanese food",
      "japanese restaurant interior",
      "philadelphia sushi roll salmon",
      "california sushi roll",
      "dragon sushi roll",
      "salmon nigiri sushi",
      "sushi set platter",
      "japanese ramen bowl",
      "sushi restaurant interior",
      "sushi chef cooking",
      "fresh salmon sushi",
      "japanese food table",
      "sushi platter close up",
      "japanese restaurant dining",
    ];
  }

  if (
    has(
      "компьютерн",
      "пк клуб",
      "pc club",
      "gaming club",
      "кибер",
      "esports",
    )
  ) {
    return [
      "gaming pc club neon computers",
      "esports gaming room computers",
      "gaming club team",
      "gaming pc setup",
      "gaming computer station",
      "vip gaming room",
      "playstation gaming lounge",
      "esports tournament arena",
      "gaming club night neon",
      "gaming club interior",
      "rgb gaming computers",
      "esports players gaming",
      "gaming keyboard mouse",
      "playstation lounge",
      "gaming room neon",
    ];
  }

  if (
    has("кофе", "кофейн", "coffee", "cafe", "кафе")
  ) {
    return [
      "coffee shop cozy interior",
      "barista making coffee",
      "coffee shop team",
      "cappuccino coffee",
      "latte coffee",
      "espresso coffee",
      "croissant pastry",
      "cheesecake dessert",
      "coffee breakfast",
      "coffee shop interior",
      "coffee beans",
      "latte art",
      "cafe dessert",
      "barista coffee machine",
      "friends coffee shop",
    ];
  }

  if (
    has(
      "автосервис",
      "ремонт авто",
      "car service",
      "auto repair",
      "шиномонтаж",
    )
  ) {
    return [
      "modern auto repair garage",
      "car mechanic workshop",
      "auto service team",
      "car diagnostics mechanic",
      "car oil change",
      "tire service mechanic",
      "car engine repair",
      "car brake repair",
      "car detailing service",
      "auto repair garage",
      "mechanic repairing car",
      "car diagnostic equipment",
      "car workshop tools",
      "tire replacement",
      "car detailing",
    ];
  }

  if (
    has(
      "салон",
      "маникюр",
      "стриж",
      "beauty",
      "hair salon",
      "spa",
    )
  ) {
    return [
      "luxury beauty salon interior",
      "beauty salon professional",
      "beauty salon team",
      "haircut salon",
      "hair coloring salon",
      "manicure nails salon",
      "facial skincare treatment",
      "spa massage",
      "makeup artist salon",
      "beauty salon interior",
      "hair stylist working",
      "manicure close up",
      "spa treatment",
      "cosmetics salon",
      "beauty client salon",
    ];
  }

  const base =
    formData.ProjectName
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim() || "modern business";

  return [
    `${base} professional business hero`,
    `${base} business interior`,
    `${base} professional team`,
    `${base} product service one`,
    `${base} product service two`,
    `${base} product service three`,
    `${base} product service four`,
    `${base} product service five`,
    `${base} product service six`,
    `${base} gallery interior`,
    `${base} team working`,
    `${base} product detail`,
    `${base} customer experience`,
    `${base} professional workspace`,
    `${base} business lifestyle`,
  ];
};

const loadImages = async (
  formData: AppFormData,
): Promise<GeneratedImages> => {
  const queries = detectImageQueries(formData);

  const images = await Promise.all([
    ...queries.map((query) => safeGetImage(query)),
    safeGetImage(
      "happy customer portrait professional",
    ),
    safeGetImage(
      "happy customer portrait smiling",
    ),
    safeGetImage(
      "happy customer portrait business",
    ),
  ]);

  return {
    hero: images[0],
    about1: images[1],
    about2: images[2],
    product1: images[3],
    product2: images[4],
    product3: images[5],
    product4: images[6],
    product5: images[7],
    product6: images[8],
    gallery1: images[9],
    gallery2: images[10],
    gallery3: images[11],
    gallery4: images[12],
    gallery5: images[13],
    gallery6: images[14],
    review1: images[15],
    review2: images[16],
    review3: images[17],
  };
};

const removeMarkdownWrapper = (
  value: string,
): string => {
  let result = value.trim();

  result = result.replace(
    /^```(?:html|HTML)?\s*/i,
    "",
  );

  result = result.replace(/\s*```$/i, "");

  return result.trim();
};

const removeMarkdownWrapper = (
  value: string,
): string => {
  return value
    .trim()
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
};

const extractHtmlDocument = (
  rawResponse: string,
): string => {
  const cleaned = removeMarkdownWrapper(rawResponse);

  const doctypeIndex =
    cleaned.search(/<!doctype html>/i);

  const htmlIndex =
    cleaned.search(/<html[\s>]/i);

  const startIndex =
    doctypeIndex !== -1
      ? doctypeIndex
      : htmlIndex;

  if (startIndex === -1) {
    console.error(
      "Gemini response start:",
      rawResponse.slice(0, 1500),
    );

    console.error(
      "Gemini response end:",
      rawResponse.slice(-1500),
    );

    throw new Error(
      "Gemini response does not contain an HTML document",
    );
  }

  const document =
    cleaned.slice(startIndex);

  const endIndex =
    document.toLowerCase().lastIndexOf("</html>");

  if (endIndex === -1) {
    throw new Error(
      "Gemini returned an incomplete HTML document",
    );
  }

  const html = document
    .slice(
      0,
      endIndex + "</html>".length,
    )
    .trim();

  const bodyMatch = html.match(
    /<body[^>]*>([\s\S]*?)<\/body>/i,
  );

  if (!bodyMatch) {
    throw new Error(
      "Gemini response does not contain a complete body",
    );
  }

  const bodyContent = bodyMatch[1]
    .replace(
      /<script[\s\S]*?<\/script>/gi,
      "",
    )
    .replace(
      /<style[\s\S]*?<\/style>/gi,
      "",
    )
    .replace(
      /<!--[\s\S]*?-->/g,
      "",
    )
    .replace(
      /<[^>]+>/g,
      "",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();

  if (bodyContent.length < 50) {
    throw new Error(
      "Gemini returned an empty HTML body",
    );
  }

  return html;
};

const removeUnsafeOrUnwantedAttributes = (
  html: string,
): string => {
  return html
    .replace(
      /\s+integrity=(["']).*?\1/gi,
      "",
    )
    .replace(
      /\s+crossorigin=(["']).*?\1/gi,
      "",
    )
    .replace(
      /\s+referrerpolicy=(["']).*?\1/gi,
      "",
    );
};

const replaceImagePlaceholders = (
  html: string,
  images: GeneratedImages,
): string => {
  let result = html;

  for (
    const key of Object.keys(
      IMAGE_PLACEHOLDERS,
    ) as Array<keyof typeof IMAGE_PLACEHOLDERS>
  ) {
    result = result.replaceAll(
      IMAGE_PLACEHOLDERS[key],
      images[key],
    );
  }

  return result;
};

const replaceRemainingPlaceholders = (
  html: string,
): string => {
  let result = html;

  for (
    const placeholder of Object.values(
      IMAGE_PLACEHOLDERS,
    )
  ) {
    result = result.replaceAll(
      placeholder,
      FALLBACK_IMAGE,
    );
  }

  return result;
};

const assertValidGeneratedHtml = (
  html: string,
): void => {
  if (!/^<!doctype html>/i.test(html)) {
    throw new Error(
      "Generated HTML must start with <!DOCTYPE html>",
    );
  }

  if (
    !/<html[\s>]/i.test(html) ||
    !/<\/html>\s*$/i.test(html)
  ) {
    throw new Error(
      "Generated HTML is incomplete",
    );
  }

  if (
    !/<head[\s>]/i.test(html) ||
    !/<body[\s>]/i.test(html)
  ) {
    throw new Error(
      "Generated HTML must contain head and body",
    );
  }

  if (/<canvas[\s>]/i.test(html)) {
    throw new Error(
      "Generated HTML contains forbidden canvas",
    );
  }

  if (html.includes("```")) {
    throw new Error(
      "Generated HTML contains Markdown wrapper",
    );
  }

  const bodyMatch = html.match(
    /<body[^>]*>([\s\S]*?)<\/body>/i,
  );

  if (!bodyMatch) {
    throw new Error(
      "Generated HTML does not contain a complete body",
    );
  }

  const visibleBodyText = bodyMatch[1]
    .replace(
      /<script[\s\S]*?<\/script>/gi,
      "",
    )
    .replace(
      /<style[\s\S]*?<\/style>/gi,
      "",
    )
    .replace(
      /<!--[\s\S]*?-->/g,
      "",
    )
    .replace(
      /<[^>]+>/g,
      "",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();

  if (visibleBodyText.length < 50) {
    throw new Error(
      "Generated HTML body is empty",
    );
  }

  const remainingPlaceholder =
    Object.values(IMAGE_PLACEHOLDERS).find(
      (placeholder) =>
        html.includes(placeholder),
    );

  if (remainingPlaceholder) {
    throw new Error(
      `Generated HTML contains unreplaced placeholder: ${remainingPlaceholder}`,
    );
  }
};

const generateHtmlWithGemini = async (
  formData: AppFormData,
): Promise<string> => {
  const apiKey =
    process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured",
    );
  }

  const generativeAI =
    new GoogleGenerativeAI(apiKey);

  const model =
    generativeAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        temperature: 0.55,
        topP: 0.9,
        maxOutputTokens: 16384,
      },
    });

  const basePrompt = buildPrompt(formData);
  let lastError: Error | null = null;

  for (
    let attempt = 1;
    attempt <= 3;
    attempt += 1
  ) {
    try {
      const retryInstruction =
        attempt === 1
          ? ""
          : `

ПРЕДЫДУЩИЙ ОТВЕТ БЫЛ ОБРЕЗАН, ПУСТ ИЛИ НЕПОЛОН.

Сгенерируй страницу заново и сделай HTML компактнее:
- Не добавляй HTML-комментарии.
- Не дублируй секции.
- Не добавляй лишние декоративные элементы.
- Сократи JavaScript, но сохрани требуемую функциональность.
- Не используй длинные SVG и base64.
- Обязательно создай полноценный <body> с видимым содержимым.
- Обязательно закончи документ тегом </html>.
- Верни только полный HTML-документ.`;

      console.log(
        `Gemini generation attempt ${attempt}/3`,
      );

      const response =
        await model.generateContent(
          basePrompt + retryInstruction,
        );

      const rawText =
        response.response.text();

      const candidate =
        response.response.candidates?.[0];

      console.log(
        "Gemini response info:",
        {
          attempt,
          length: rawText.length,
          finishReason:
            candidate?.finishReason,
        },
      );

      console.log(
        "Gemini response start:",
        rawText.slice(0, 500),
      );

      console.log(
        "Gemini response end:",
        rawText.slice(-500),
      );

      if (!rawText.trim()) {
        throw new Error(
          "Gemini returned an empty response",
        );
      }

      const html =
        extractHtmlDocument(rawText);

      console.log(
        "Valid generated HTML length:",
        html.length,
      );

      return html;
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error(
              "Unknown Gemini generation error",
            );

      console.error(
        `Gemini attempt ${attempt} failed:`,
        lastError.message,
      );
    }
  }

  throw new Error(
    `Gemini failed after 3 attempts: ${
      lastError?.message ||
      "Unknown generation error"
    }`,
  );
};

export const generateWebsiteData = async (
  rawFormData: AppFormData,
): Promise<LandingPageData> => {
  const formData =
    normalizeFormData(rawFormData);

  if (DEBUG_MODE) {
    console.log(
      "Generate website debug mode is enabled",
    );

    return {
      success: true,
      html: MOCK_HTML,
    };
  }

  try {
    const generatedHtml =
      await generateHtmlWithGemini(formData);

    const images =
      await loadImages(formData);

    let html =
      replaceImagePlaceholders(
        generatedHtml,
        images,
      );

    html =
      replaceRemainingPlaceholders(html);

    html =
      removeUnsafeOrUnwantedAttributes(html);

    html = html
      .replace(
        /<section[^>]*(?:id|class)=["'][^"']*(?:game|mini-game|canvas-game|shooter|comments|comment-section)[^"']*["'][^>]*>[\s\S]*?<\/section>/gi,
        "",
      )
      .replace(
        /<canvas[\s\S]*?<\/canvas>/gi,
        "",
      );

    assertValidGeneratedHtml(html);

    return {
      success: true,
      html,
    };
  } catch (error) {
    console.error(
      "generateWebsiteData failed:",
      error,
    );

    if (error instanceof Error) {
      throw new Error(
        `Website generation failed: ${error.message}`,
      );
    }

    throw new Error(
      "Website generation failed because of an unknown error",
    );
  }
};