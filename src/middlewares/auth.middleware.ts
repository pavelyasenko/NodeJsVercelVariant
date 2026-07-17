import type { Request, Response, NextFunction } from 'express';
import  jwt  from 'jsonwebtoken';
import { prisma } from '../config/db.js';

export const authMiddleware = async (req:Request, res:Response, next:NextFunction):Promise<void> => {
console.log("=== МИДЛВАР СРАБОТАЛ! ===");
    const authHeader = req.headers.authorization;
    console.log("Заголовок:", authHeader)

    if(!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({message: "Unauthoried"})
        return
    }

    const token = authHeader.split(" ")[1]

        try{
            const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
                userId:string
                userEmail:string
            }
            const user = await prisma.user.findUnique({
                where:{
                    id:decoded.userId
                }
            })
            
            if (!user || user.token !== token) {
                res.status(401).json({ message: "Unauthorized" });
            return;
            }

            (req as any).userId = decoded.userId;
            (req as any).token = token;

            next();
        } catch {
            res.status(401).json({ message: "Invalid token" });
        }
 };