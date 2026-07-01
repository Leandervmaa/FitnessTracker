import { Router } from "express";
import { authenticate, createSession, publicUser } from "../services/identityService.js";
import { logoutCurrentSession, SESSION_COOKIE, sessionCookieOptions } from "../lib/auth.js";

const router = Router();

router.get("/me", (req, res) => {
  return void res.json({ user: req.auth?.user ?? null });
});

router.post("/login", async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");

    if (!username || !password) {
      return void res.status(400).json({ error: "Gebruikersnaam en wachtwoord zijn verplicht" });
    }

    const user = await authenticate(username, password);
    if (!user) {
      return void res.status(401).json({ error: "Onjuiste inloggegevens" });
    }

    const session = await createSession(user.id);
    res.cookie(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));

    return void res.json({ user: publicUser(user) });
  } catch (err) {
    req.log.error({ err }, "Login failed");
    return void res.status(500).json({ error: "Inloggen mislukt" });
  }
});

router.post("/logout", async (req, res) => {
  await logoutCurrentSession(req, res);
  return void res.json({ ok: true });
});

export default router;
