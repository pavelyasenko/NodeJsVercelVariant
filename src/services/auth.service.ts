import { prisma } from "../config/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

interface RegisterData {
    email: string;
    password: string;
}

interface LoginData {
    email: string;
    password: string;
}

interface ChangePasswordData {
    oldPassword: string;
    newPassword: string;
}

interface AuthResponse {
    success: boolean;
    token: string;
}

export const AuthService = {
    register: async (data:RegisterData):Promise<AuthResponse> => {
        const exsistingUser = await prisma.user.findUnique({
            where:{
                email: data.email
            }
        })

        if(exsistingUser) {
            throw new Error("User allredy exsists")
        }

        const hashedPassword = await bcrypt.hash(data.password, 10)

        const user = await prisma.user.create({
            data:{
                email: data.email,
                password: hashedPassword,
            }
        })

        const token = jwt.sign(
            {
                userId: user.id,
                userEmail: user.email,
            },
            process.env.JWT_SECRET!,
            {expiresIn: "7d"}
        )

        await prisma.user.update({
            where:{
                id:user.id
            },

            data:{
                token
            }
        })

        return {
            success:true,
            token,
        }
    },

    login: async (data:LoginData):Promise<AuthResponse> => {
        const user = await prisma.user.findUnique({
            where: {
                email: data.email,
            }
        })

        if(!user) {
            throw new Error("Invalid email or password")
        }

        const isValidPassword = await bcrypt.compare(
            data.password,
            user.password,
        )

        if(!isValidPassword) {
            throw new Error("Invalid email or password")
        }

        const token = jwt.sign(
            {
                userId: user.id,
                userEmail: user.email,
            },
            process.env.JWT_SECRET!,
            {expiresIn: "7d"}
        )

        await prisma.user.update({
            where:{
                id:user.id
            },

            data:{
                token
            }
        })

        return {
            success:true,
            token,
        }
    },

   logout: async (userId:string):Promise<{success:boolean}> => {
    await prisma.user.update({
        where:{
            id: userId
        },

        data:{
            token: null
        }
    });

    return {
        success:true
    }
   },

   changePassword: async (userId:string, data:ChangePasswordData):Promise<{success:boolean}> =>{
    const user = await prisma.user.findUnique({
        where:{
            id: userId,
        }
    })

    if (!user) {
        throw new Error("User not found")
    }
    
    if (data.newPassword.length < 6) {
        throw new Error("Password must be at least 6 characters");
    }

    if (data.oldPassword === data.newPassword) {
        throw new Error("New password must be different from the current password");
    }

    const isValidPassword = await bcrypt.compare(
        data.oldPassword,
        user.password
    )

    if(!isValidPassword) {
        throw new Error("Incorrect password")
    }

    const hashedPassword = await bcrypt.hash(data.newPassword, 10)

    await prisma.user.update({
        where:{
            id:userId
        },
        data:{
            password:hashedPassword
        }
    })

    return {
        success: true,
    }
   },
}