import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
} from "jose";
import { prisma } from "../config/db.js";

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

interface TelegramAuthData {
  idToken: string;
}

interface AuthResponse {
  success: boolean;
  token: string;
}

interface TelegramIdTokenClaims extends JWTPayload {
  id?: number;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  picture?: string;
}

type AuthProvider = "password" | "telegram";

const TELEGRAM_ISSUER = "https://oauth.telegram.org";

const telegramJwks = createRemoteJWKSet(
  new URL(
    "https://oauth.telegram.org/.well-known/jwks.json",
  ),
);

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return secret;
};

const getTelegramClientId = (): string => {
  const clientId =
    process.env.TELEGRAM_CLIENT_ID?.trim();

  if (!clientId) {
    throw new Error(
      "TELEGRAM_CLIENT_ID is not configured",
    );
  }

  return clientId;
};

const issueAuthToken = async (
  user: {
    id: string;
    email: string | null;
  },
  provider: AuthProvider,
): Promise<string> => {
  const token = jwt.sign(
    {
      userId: user.id,
      userEmail: user.email ?? undefined,
      authProvider: provider,
    },
    getJwtSecret(),
    {
      expiresIn: "7d",
    },
  );

  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      token,
    },
  });

  return token;
};

const validateTelegramIdToken = async (
  idToken: string,
): Promise<TelegramIdTokenClaims> => {
  const cleanToken = idToken?.trim();

  if (!cleanToken) {
    throw new Error("Telegram ID token is missing");
  }

  const { payload } = await jwtVerify(
    cleanToken,
    telegramJwks,
    {
      issuer: TELEGRAM_ISSUER,
      audience: getTelegramClientId(),
      algorithms: ["RS256"],
    },
  );

  const claims = payload as TelegramIdTokenClaims;

  if (!claims.id && !claims.sub) {
    throw new Error(
      "Telegram ID token does not contain a user ID",
    );
  }

  return claims;
};

export const AuthService = {
  register: async (
    data: RegisterData,
  ): Promise<AuthResponse> => {
    const email = data.email?.trim().toLowerCase();
    const password = data.password ?? "";

    if (!email) {
      throw new Error("Email is required");
    }

    if (password.length < 6) {
      throw new Error(
        "Password must be at least 6 characters",
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (existingUser) {
      throw new Error("User already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
      },
    });

    const token = await issueAuthToken(user, "password");

    return {
      success: true,
      token,
    };
  },

  login: async (
    data: LoginData,
  ): Promise<AuthResponse> => {
    const email = data.email?.trim().toLowerCase();
    const password = data.password ?? "";

    if (!email || !password) {
      throw new Error("Invalid email or password");
    }

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user?.password) {
      throw new Error("Invalid email or password");
    }

    const isValidPassword = await bcrypt.compare(
      password,
      user.password,
    );

    if (!isValidPassword) {
      throw new Error("Invalid email or password");
    }

    const token = await issueAuthToken(user, "password");

    return {
      success: true,
      token,
    };
  },

  loginWithTelegram: async (
    data: TelegramAuthData,
  ): Promise<AuthResponse> => {
    const claims = await validateTelegramIdToken(
      data.idToken,
    );

    const telegramId = String(claims.id ?? claims.sub);
    const firstName =
      claims.given_name?.trim() ||
      claims.name?.trim() ||
      "Telegram user";
    const lastName =
      claims.family_name?.trim() || null;
    const username =
      claims.preferred_username?.trim() || null;
    const photoUrl = claims.picture?.trim() || null;

    const user = await prisma.user.upsert({
      where: {
        telegramId,
      },
      update: {
        telegramUsername: username,
        telegramFirstName: firstName,
        telegramLastName: lastName,
        telegramPhotoUrl: photoUrl,
      },
      create: {
        telegramId,
        telegramUsername: username,
        telegramFirstName: firstName,
        telegramLastName: lastName,
        telegramPhotoUrl: photoUrl,
      },
    });

    const token = await issueAuthToken(user, "telegram");

    return {
      success: true,
      token,
    };
  },

  logout: async (
    userId: string,
  ): Promise<{ success: boolean }> => {
    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        token: null,
      },
    });

    return {
      success: true,
    };
  },

  changePassword: async (
    userId: string,
    data: ChangePasswordData,
  ): Promise<{ success: boolean }> => {
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (!user.password) {
      throw new Error(
        "Password login is not configured for this account",
      );
    }

    if (data.newPassword.length < 6) {
      throw new Error(
        "Password must be at least 6 characters",
      );
    }

    if (data.oldPassword === data.newPassword) {
      throw new Error(
        "New password must be different from the current password",
      );
    }

    const isValidPassword = await bcrypt.compare(
      data.oldPassword,
      user.password,
    );

    if (!isValidPassword) {
      throw new Error("Incorrect password");
    }

    const hashedPassword = await bcrypt.hash(
      data.newPassword,
      10,
    );

    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        password: hashedPassword,
      },
    });

    return {
      success: true,
    };
  },
};