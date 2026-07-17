import { Router } from "express";
import { generateController } from "../controllers/generate.controllers";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

router.post("/",authMiddleware, generateController.generate)
router.get("/history",authMiddleware, generateController.generateHistory)

export default router