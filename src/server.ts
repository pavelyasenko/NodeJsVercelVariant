import "dotenv/config";
import express from "express";
import cors from "cors";
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import balanceRoutes from "./routes/balance.routes.js";
import generateRoutes from "./routes/generate.routes.js";


const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "API is running",
  });
});

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/balance", balanceRoutes);
app.use("/api/generate", generateRoutes);

export default app;

// Запускаем порт только локально
if (process.env.NODE_ENV !== "production") {
  const PORT = Number(process.env.PORT) || 3000;

  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}