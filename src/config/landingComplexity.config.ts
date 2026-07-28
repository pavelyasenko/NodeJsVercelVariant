
export interface LandingComplexityConfig {
  introduction?: string;

  productCardCount: number;

  sections: readonly string[];

  requirements?: readonly string[];

  forbidden?: readonly string[];

  orderedSections?: boolean;
}

export const LANDING_COMPLEXITY_CONFIG = {
  Minimal: {
    productCardCount: 3,
    sections: [
      "Header.",
      "Full-viewport Hero with a background image.",
      "Required products or services section with at least 3 cards.",
      "Short About section.",
      "Contact CTA.",
      "Footer.",
    ],
    requirements: [
      "The Hero heading must contain no more than 8 words.",
      "The Hero must contain one paragraph of no more than 22 words.",
      "The Hero must contain no more than 2 buttons.",
    ],
  },

  Low: {
    productCardCount: 4,
    sections: [
      "Header.",
      "Full-viewport Hero with a background image.",
      "About section.",
      "Required products or services section with at least 4 cards.",
      "3 benefits.",
      "Contact form.",
      "Footer.",
    ],
  },

  Medium: {
    productCardCount: 6,
    sections: [
      "Header.",
      "Full-viewport Hero with a background image.",
      "About section.",
      "Required products or services section with exactly 6 cards.",
      "4 benefits.",
      "Gallery with 6 images.",
      "3 testimonials.",
      "FAQ with 5 questions.",
      "Lead form.",
      "Footer.",
    ],
  },

  High: {
    introduction: "Create a large premium commercial landing page.",
    productCardCount: 6,
    orderedSections: true,
    sections: [
      "Header with a logo, navigation, and CTA.",
      "Full-viewport Hero with a background image.",
      "About section with two relevant images.",
      "EXACTLY 6 product, service, menu-item, or pricing cards.",
      "At least 4 benefits.",
      "Four statistics.",
      "Gallery with 6 images.",
      "Three testimonials.",
      "FAQ with 6 questions.",
      "Lead form and contact information.",
      "Footer with four columns.",
    ],
    requirements: [
      "Every card must contain a specific item, a unique image, a name, a short description, a price or plan, and a working order button.",
      'Do not use generic names such as "Service 1" or "Product 1".',
    ],
    forbidden: [
      "Canvas.",
      "Mini-games.",
      "Game sections.",
      "Shooter, Score, Lives, Start Game, Pause Game, or Restart Game.",
      "Game loops or requestAnimationFrame used for a game.",
      "User comments or comment forms.",
    ],
  },
} as const satisfies Record<string, LandingComplexityConfig>;

export type Complexity = keyof typeof LANDING_COMPLEXITY_CONFIG;