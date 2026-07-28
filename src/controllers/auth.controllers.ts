import {
  Request,
  Response,
} from "express";
import { AuthService } from "../services/auth.service.js";
import { TelegramWebAppService } from "../services/telegramWebApp.service.js";

const getErrorMessage = (
  error: unknown,
): string =>
  error instanceof Error
    ? error.message
    : "Unknown authorization error";

export const loginHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { email, password } = req.body;
    const result = await AuthService.login({
      email,
      password,
    });

    res.status(200).json(result);
  } catch (error: unknown) {
    res.status(400).json({
      message: getErrorMessage(error),
    });
  }
};

export const registerHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { email, password } = req.body;
    const result = await AuthService.register({
      email,
      password,
    });

    res.status(201).json(result);
  } catch (error: unknown) {
    res.status(400).json({
      message: getErrorMessage(error),
    });
  }
};

// Existing Telegram Web Login / OpenID Connect endpoint.
export const telegramLoginHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const idToken =
      typeof req.body?.idToken === "string"
        ? req.body.idToken
        : "";

    if (!idToken) {
      throw new Error(
        "Telegram ID token is missing",
      );
    }

    const result =
      await AuthService.loginWithTelegram({
        idToken,
      });

    res.status(200).json(result);
  } catch (error: unknown) {
    res.status(400).json({
      message: getErrorMessage(error),
    });
  }
};

// New Telegram Mini App / WebView endpoint.
export const telegramWebAppLoginHandler =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const initData =
        typeof req.body?.initData === "string"
          ? req.body.initData
          : "";

      const result =
        await TelegramWebAppService.login(
          initData,
        );

      res.status(200).json(result);
    } catch (error: unknown) {
      res.status(400).json({
        message: getErrorMessage(error),
      });
    }
  };

export const logoutHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).userId;
    const result =
      await AuthService.logout(userId);

    res.status(200).json(result);
  } catch (error: unknown) {
    res.status(401).json({
      message: getErrorMessage(error),
    });
  }
};

export const changePasswordHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).userId;
    const { oldPassword, newPassword } =
      req.body;

    const result =
      await AuthService.changePassword(userId, {
        oldPassword,
        newPassword,
      });

    res.status(200).json(result);
  } catch (error: unknown) {
    res.status(401).json({
      message: getErrorMessage(error),
    });
  }
};