import { Router } from "express";
import {
    changePasswordHandler, 
    loginHandler, 
    logoutHandler, 
    registerHandler, 
    telegramAuthHandler
} from "../controllers/auth.controllers.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";



const router = Router();

router.post("/login", loginHandler);
router.post("/register", registerHandler);
router.post("/telegram", telegramAuthHandler);
router.post("/logout",authMiddleware ,logoutHandler);
router.post("/change-password",authMiddleware ,changePasswordHandler);

export default router