import { defineConfig } from "@prisma/config";

export default defineConfig({
  datasource: {
    url: "postgresql://pavel_yasenko@localhost:5432/ai_landing_db?schema=public",
  },
});