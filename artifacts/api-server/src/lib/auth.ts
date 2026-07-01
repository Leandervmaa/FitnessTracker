import type { NextFunction, Request, Response } from "express";
import { DEFAULT_CLIENT_ID, destroySession, findSessionUser, publicUser, type AuthUser } from "../services/identityService.js";

export const SESSION_COOKIE = "ft_session";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        user: AuthUser;
      };
    }
  }
}

export const sessionCookieOptions = (expires?: Date) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  expires,
});

export function getSessionToken(req: Request): string | undefined {
  return req.cookies?.[SESSION_COOKIE];
}

export async function attachAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = await findSessionUser(getSessionToken(req));
    if (user) {
      req.auth = { user: publicUser(user) };
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.auth?.user) {
    return void res.status(401).json({ error: "Log eerst in" });
  }
  return next();
}

export function requireTrainer(req: Request, res: Response, next: NextFunction) {
  if (!req.auth?.user) {
    return void res.status(401).json({ error: "Log eerst in" });
  }
  if (req.auth.user.role !== "trainer") {
    return void res.status(403).json({ error: "Alleen beschikbaar voor de trainer" });
  }
  return next();
}

export function getScopedClientId(req: Request): string {
  const user = req.auth?.user;
  if (user?.role === "client") {
    return user.clientId || DEFAULT_CLIENT_ID;
  }

  const headerClientId = req.header("x-client-id")?.trim();
  const queryClientId = typeof req.query.clientId === "string" ? req.query.clientId.trim() : "";
  const bodyClientId = typeof req.body?.clientId === "string" ? req.body.clientId.trim() : "";

  return headerClientId || queryClientId || bodyClientId || DEFAULT_CLIENT_ID;
}

export async function logoutCurrentSession(req: Request, res: Response) {
  await destroySession(getSessionToken(req));
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}
