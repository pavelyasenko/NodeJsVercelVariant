import "dotenv/config"
import express from "express";
import cors from "cors";
import healthRoutes from "./routes/health.routes";
import authRoutes from "./routes/auth.routes";
import balanceRoutes from "./routes/balance.routes";
import generateRoutes from "./routes/generate.routes"
import { authMiddleware } from "./middlewares/auth.middleware";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/balance", balanceRoutes);
app.use("/api/generate",generateRoutes)

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});