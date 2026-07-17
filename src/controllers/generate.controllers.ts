import { Request, Response } from "express";
import { generateService } from "../services/generate.service";

export const generateController = {
  async generate (req:Request, res:Response) {
    try {
        const userId = (req as any).userId;
        const result = await generateService.generate(req.body, userId)
        res.json(result)
    } catch(error:any) {
      if ( error.message === "Insufficient balance"){
        return res.status(402).json({
          code: "INSUFFICIENT_BALANCE",
          message: "Insufficient balance"
        });
      }
        console.log(error)

        res.status(500).json({
            success:false,
            message:"Generate error"
        })
    }
  },

    async generateHistory(req:Request,res:Response) {
    try{
      const userId = (req as any).userId;
      const {
        page,
        limit,
        language,
        complexity,
        sort,
        search,
      } = req.query
      
      const history = await generateService.getGenerateHistory({
        userId,
        page: Number(page) || 1,
        limit: Number(limit) || 12,
        language: language as string | undefined,
        complexity: complexity as string | undefined,
        sort: (sort as "new" | "old") || "new",
        search: search as string | undefined,
      })

      res.json(history)
    } catch(error){
      console.log(error)
      res.status(500).json({
        success:false,
        message: "Failed to get history",
      })
    }
  }
}
