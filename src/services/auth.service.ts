
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createHmac, timingSafeEqual } from "node:crypto";
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
  initData: string;
}

interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
}

interface ValidatedTelegramData {
  user: TelegramWebAppUser;
  authDate: number;
}

interface AuthResponse {
  success: boolean;
  token: string;
}

type AuthProvider = "password" | "telegram";

const DEFAULT_TELEGRAM_AUTH_MAX_AGE_SECONDS = 600;
const TELEGRAM_CLOCK_SKEW_SECONDS = 60;
const MAX_INIT_DATA_LENGTH = 10_000;

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return secret;
};

const getTelegramBotToken = (): string => {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  return token;
};

const getTelegramAuthMaxAge = (): number => {
  const value = Number(process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS);

  if (Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  return DEFAULT_TELEGRAM_AUTH_MAX_AGE_SECONDS;
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

const parseTelegramUser = (
  rawUser: string | null,
): TelegramWebAppUser => {
  if (!rawUser) {
    throw new Error("Telegram authorization data does not contain a user");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawUser);
  } catch {
    throw new Error("Invalid Telegram user data");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("id" in parsed) ||
    !("first_name" in parsed)
  ) {
    throw new Error("Invalid Telegram user data");
  }

  const user = parsed as Partial<TelegramWebAppUser>;

  if (
    typeof user.id !== "number" ||
    !Number.isSafeInteger(user.id) ||
    user.id <= 0 ||
    typeof user.first_name !== "string" ||
    !user.first_name.trim()
  ) {
    throw new Error("Invalid Telegram user data");
  }

  return {
    id: user.id,
    first_name: user.first_name.trim(),
    last_name:
      typeof user.last_name === "string"
        ? user.last_name.trim()
        : undefined,
    username:
      typeof user.username === "string"
        ? user.username.trim()
        : undefined,
    language_code:
      typeof user.language_code === "string"
        ? user.language_code.trim()
        : undefined,
    photo_url:
      typeof user.photo_url === "string"
        ? user.photo_url.trim()
        : undefined,
    is_premium: user.is_premium === true ? true : undefined,
  };
};

const validateTelegramInitData = (
  initData: string,
): ValidatedTelegramData => {
  const cleanInitData = initData.trim();

  if (!cleanInitData) {
    throw new Error("Telegram authorization data is missing");
  }

  if (cleanInitData.length > MAX_INIT_DATA_LENGTH) {
    throw new Error("Telegram authorization data is too large");
  }

  const botToken = getTelegramBotToken();
  const params = new URLSearchParams(cleanInitData);
  const receivedHash = params.get("hash");

  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    throw new Error("Invalid Telegram authorization signature");
  }

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const calculatedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const receivedHashBuffer = Buffer.from(receivedHash.toLowerCase(), "hex");
  const calculatedHashBuffer = Buffer.from(calculatedHash, "hex");

  if (
    receivedHashBuffer.length !== calculatedHashBuffer.length ||
    !timingSafeEqual(receivedHashBuffer, calculatedHashBuffer)
  ) {
    throw new Error("Invalid Telegram authorization signature");
  }

  const authDate = Number(params.get("auth_date"));

  if (!Number.isSafeInteger(authDate) || authDate <= 0) {
    throw new Error("Invalid Telegram authorization date");
  }

  const currentTimestamp = Math.floor(Date.now() / 1000);
  const maxAge = getTelegramAuthMaxAge();

  if (authDate > currentTimestamp + TELEGRAM_CLOCK_SKEW_SECONDS) {
    throw new Error("Invalid Telegram authorization date");
  }

  if (currentTimestamp - authDate > maxAge) {
    throw new Error("Telegram authorization data has expired");
  }

  return {
    user: parseTelegramUser(params.get("user")),
    authDate,
  };
};

export const AuthService = {
  register: async (data: RegisterData): Promise<AuthResponse> => {
    const email = data.email?.trim().toLowerCase();
    const password = data.password ?? "";

    if (!email) {
      throw new Error("Email is required");
    }

    if (password.length < 6) {
      throw new Error("Password must be at least 6 characters");
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

  login: async (data: LoginData): Promise<AuthResponse> => {
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

    const isValidPassword = await bcrypt.compare(password, user.password);

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
    const telegramData = validateTelegramInitData(data.initData);
    const telegramUser = telegramData.user;
    const telegramId = String(telegramUser.id);

    const user = await prisma.user.upsert({
      where: {
        telegramId,
      },
      update: {
        telegramUsername: telegramUser.username ?? null,
        telegramFirstName: telegramUser.first_name,
        telegramLastName: telegramUser.last_name ?? null,
        telegramPhotoUrl: telegramUser.photo_url ?? null,
        telegramLanguageCode: telegramUser.language_code ?? null,
      },
      create: {
        telegramId,
        telegramUsername: telegramUser.username ?? null,
        telegramFirstName: telegramUser.first_name,
        telegramLastName: telegramUser.last_name ?? null,
        telegramPhotoUrl: telegramUser.photo_url ?? null,
        telegramLanguageCode: telegramUser.language_code ?? null,
      },
    });

    const token = await issueAuthToken(user, "telegram");

    return {
      success: true,
      token,
    };
  },

  logout: async (userId: string): Promise<{ success: boolean }> => {
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
      throw new Error("Password login is not configured for this account");
    }

    if (data.newPassword.length < 6) {
      throw new Error("Password must be at least 6 characters");
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

    const hashedPassword = await bcrypt.hash(data.newPassword, 10);

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