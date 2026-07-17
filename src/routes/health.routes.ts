import { Router } from "express";
import { getHealthHandler } from "../controllers/health.controllers.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.get('/', authMiddleware, getHealthHandler)

export default router