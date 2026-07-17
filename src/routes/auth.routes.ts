import { Router } from "express";
import {
    changePasswordHandler, 
    loginHandler, 
    logoutHandler, 
    registerHandler 
} from "../controllers/auth.controllers";
import { authMiddleware } from "../middlewares/auth.middleware";



const router = Router();

router.post("/login", loginHandler);
router.post("/register", registerHandler);
router.post("/logout",authMiddleware ,logoutHandler);
router.post("/change-password",authMiddleware ,changePasswordHandler);

export default router