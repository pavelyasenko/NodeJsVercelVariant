import { Response, Request } from "express";
import { balanceService } from "../services/balance.service.js"

export const getBalanceHandler = async (req:Request, res:Response):Promise<void> =>{
    try {
        const userId = (req as any).userId;
        const result = await balanceService.getBalance(userId);
        
        res.status(200).json(result);

        }catch(error:any) {
            res.status(500).json({message: error.message});
        }
}

export const getTopUpHandler = async (req:Request, res:Response,):Promise<void> => {
    try {
        const userId = (req as any).userId;
        const { amount } = req.body
        const result = await balanceService.topUp(Number(amount), userId);
        
        res.status(200).json(result);
    } catch (error: any) {
        if (error.message.includes("Amount must be greater then 0")) {
            res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
};