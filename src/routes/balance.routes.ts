import { Router } from "express";

import { getBalanceHandler, getTopUpHandler } from "../controllers/balance.controllers.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";



const router = Router();

router.get("/",authMiddleware, getBalanceHandler);
router.post("/topup",authMiddleware, getTopUpHandler);

export default router