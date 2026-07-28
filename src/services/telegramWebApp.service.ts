import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../config/db.js";

interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

const MAX_AUTH_AGE_SECONDS = 600;

const getBotToken = (): string => {
  const token =
    process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN is not configured",
    );
  }

  return token;
};

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret) {
    throw new Error(
      "JWT_SECRET is not configured",
    );
  }

  return secret;
};

const validateInitData = (
  initData: string,
): TelegramWebAppUser => {
  if (!initData?.trim()) {
    throw new Error(
      "Telegram authorization data is missing",
    );
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");

  if (
    !receivedHash ||
    !/^[a-f0-9]{64}$/i.test(receivedHash)
  ) {
    throw new Error(
      "Telegram authorization hash is missing",
    );
  }

  const dataCheckString = Array.from(
    params.entries(),
  )
    .filter(([key]) => key !== "hash")
    .sort(([firstKey], [secondKey]) =>
      firstKey.localeCompare(secondKey),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac(
    "sha256",
    "WebAppData",
  )
    .update(getBotToken())
    .digest();

  const calculatedHash = createHmac(
    "sha256",
    secretKey,
  )
    .update(dataCheckString)
    .digest("hex");

  const receivedBuffer = Buffer.from(
    receivedHash.toLowerCase(),
    "hex",
  );
  const calculatedBuffer = Buffer.from(
    calculatedHash,
    "hex",
  );

  if (
    receivedBuffer.length !==
      calculatedBuffer.length ||
    !timingSafeEqual(
      receivedBuffer,
      calculatedBuffer,
    )
  ) {
    throw new Error(
      "Invalid Telegram authorization signature",
    );
  }

  const authDate = Number(
    params.get("auth_date"),
  );
  const currentTimestamp = Math.floor(
    Date.now() / 1000,
  );

  if (
    !Number.isSafeInteger(authDate) ||
    authDate <= 0 ||
    authDate > currentTimestamp + 60 ||
    currentTimestamp - authDate >
      MAX_AUTH_AGE_SECONDS
  ) {
    throw new Error(
      "Telegram authorization data has expired",
    );
  }

  const rawUser = params.get("user");

  if (!rawUser) {
    throw new Error(
      "Telegram user data is missing",
    );
  }

  let user: TelegramWebAppUser;

  try {
    user = JSON.parse(
      rawUser,
    ) as TelegramWebAppUser;
  } catch {
    throw new Error(
      "Invalid Telegram user data",
    );
  }

  if (
    !Number.isSafeInteger(user.id) ||
    user.id <= 0 ||
    typeof user.first_name !== "string" ||
    !user.first_name.trim()
  ) {
    throw new Error(
      "Invalid Telegram user data",
    );
  }

  return user;
};

export const TelegramWebAppService = {
  login: async (
    initData: string,
  ): Promise<{
    success: boolean;
    token: string;
  }> => {
    const telegramUser =
      validateInitData(initData);
    const telegramId = String(
      telegramUser.id,
    );

    const user = await prisma.user.upsert({
      where: {
        telegramId,
      },
      update: {
        telegramUsername:
          telegramUser.username ?? null,
        telegramFirstName:
          telegramUser.first_name,
        telegramLastName:
          telegramUser.last_name ?? null,
        telegramPhotoUrl:
          telegramUser.photo_url ?? null,
        telegramLanguageCode:
          telegramUser.language_code ?? null,
      },
      create: {
        telegramId,
        telegramUsername:
          telegramUser.username ?? null,
        telegramFirstName:
          telegramUser.first_name,
        telegramLastName:
          telegramUser.last_name ?? null,
        telegramPhotoUrl:
          telegramUser.photo_url ?? null,
        telegramLanguageCode:
          telegramUser.language_code ?? null,
      },
    });

    const token = jwt.sign(
      {
        userId: user.id,
        userEmail: user.email ?? undefined,
        authProvider: "telegram-webapp",
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

    return {
      success: true,
      token,
    };
  },
};