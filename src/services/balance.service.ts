import {prisma} from "../config/db"

interface BalanceResponse  {
    balance: number;
};

interface TopUpResponse {
    success: boolean;
    newBalance: number;
};

export const balanceService = {
    getBalance: async (userId:string):Promise<BalanceResponse> => {
        let userBalance = await prisma.userBalance.findUnique({
            where: {userId}
        })

        if (!userBalance) {
        userBalance = await prisma.userBalance.create({
            data: {userId, balance:0}
        })

        }

        return {balance: userBalance.balance}

    },

    topUp: async (amount:number, userId:string):Promise<TopUpResponse> => {
        if(amount <= 0) {
            throw new Error("Amount must be greater then 0")
        }
        
        const updated = await prisma.userBalance.update({
            where: {userId},
            data: {
                balance:{
                    increment: amount
                }
            }
        })

        return {
            success: true,
            newBalance: updated.balance
        }
    }
    }
