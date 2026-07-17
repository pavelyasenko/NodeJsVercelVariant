import { Request, Response } from "express";
import { checkServerHealth } from "../services/health.service.js"

export const getHealthHandler = (req:Request, res:Response ): void => {
    try{
        const healthData = checkServerHealth();
        res.status(200).json(healthData)
    } catch (error) {
        res.status(500).json({error:"505"})
    }
}