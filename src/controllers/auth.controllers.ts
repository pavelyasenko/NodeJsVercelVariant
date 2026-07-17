import { Request, Response } from "express";
import { AuthService } from "../services/auth.service";

export const loginHandler = async (req:Request, res:Response): Promise<void> => {
    try {
        const {email, password} = req.body
        const result = await AuthService.login({email, password})

        res.status(200).json(result)
    }catch(error:any) {
        res.status(400).json({message: error.message})
    }
}

export const registerHandler = async (req:Request, res:Response): Promise<void> => {
    try {
        const {email, password} = req.body
        const result = await AuthService.register({email, password})

        res.status(201).json(result)
    }catch(error:any) {
        res.status(401).json({message: error.message})
    }
}

export const logoutHandler = async (req:Request, res:Response): Promise<void> => {
    try {
        const userId = (req as any ).userId
        const result = await AuthService.logout(userId)

        res.status(201).json(result)
    }catch(error:any) {
        res.status(401).json({message: error.message})
    }
}

export const changePasswordHandler = async(req:Request, res:Response):Promise<void> =>{
    try {
        const userId = (req as any).userId
        const { oldPassword, newPassword } = req.body;
        const result = await AuthService.changePassword(userId,{oldPassword, newPassword})

        res.status(200).json(result)
    }catch(error:any) {
        res.status(401).json({message: error.message})
        
    }
}