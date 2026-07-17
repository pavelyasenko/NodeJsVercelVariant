import { Router } from "express";
import { getHealthHandler } from "../controllers/health.controllers";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

router.get('/', authMiddleware, getHealthHandler)

export default router