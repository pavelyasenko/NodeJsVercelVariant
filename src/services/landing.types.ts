import type { Complexity } from "../config/landingComplexity.config.js";

export interface AppFormData {
  ProjectName: string;
  Description: string;
  Language: string;
  Complexity: Complexity;
  ColorPalette: string;
  FBPixelID?: string;
}

export interface LandingPageData {
  success: boolean;
  html: string;
}

export interface GeneratedImages {
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