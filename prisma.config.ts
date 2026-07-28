import { defineConfig } from "@prisma/config";

export default defineConfig({
  datasource: {
    url: "postgresql://neondb_owner:npg_4T8NhgQrBAPi@ep-solitary-dawn-auom8836.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
  },
});