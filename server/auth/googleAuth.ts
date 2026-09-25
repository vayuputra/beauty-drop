import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";
import crypto from "crypto";

import passport from "passport";
import session from "express-session";
import type { Express } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import type { SessionUser } from "./identity";

const isProduction = process.env.NODE_ENV === "production";

function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.OAUTH_CALLBACK_URL);
}

function resolveSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (isProduction) {
    if (!secret) throw new Error("SESSION_SECRET must be set in production");
    console.warn("[auth] SESSION_SECRET is shorter than 32 characters; use a longer random value.");
    return secret;
  }
  console.warn("[auth] SESSION_SECRET missing or short; using a random dev-only secret (sessions reset on restart).");
  return crypto.randomBytes(32).toString("hex");
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL("https://accounts.google.com"),
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: resolveSessionSecret(),
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      // "lax" keeps the cookie off cross-site POSTs, which is our main CSRF defence.
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Only the user id lives in the session; profile data is read from the users table.
  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      req.session.destroy(() => {
        res.redirect("/auth");
      });
    });
  });

  if (!googleConfigured()) {
    if (isProduction) {
      throw new Error("GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and OAUTH_CALLBACK_URL must be set");
    }
    console.warn("[auth] Google OAuth not configured; /api/login is disabled. Email/password sign-in still works.");
    app.get("/api/login", (_req, res) => {
      res.status(503).json({ message: "Google sign-in is not configured on this server" });
    });
    return;
  }

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    try {
      const claims = tokens.claims();
      if (!claims?.sub) return verified(new Error("Google did not return a subject"));
      await authStorage.upsertUser({
        id: claims.sub,
        email: claims.email as string | undefined,
        firstName: claims.given_name as string | undefined,
        lastName: claims.family_name as string | undefined,
        profileImageUrl: claims.picture as string | undefined,
      });
      const user: SessionUser = { id: claims.sub };
      verified(null, user);
    } catch (err) {
      verified(err as Error);
    }
  };

  passport.use(
    new Strategy(
      {
        name: "google",
        config,
        scope: "openid email profile",
        callbackURL: process.env.OAUTH_CALLBACK_URL!,
      },
      verify
    )
  );

  app.get("/api/login", (req, res, next) => {
    // We only need identity, so no offline access and no forced consent screen.
    passport.authenticate("google", {
      scope: ["openid", "email", "profile"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    passport.authenticate("google", {
      successReturnToOrRedirect: "/",
      failureRedirect: "/auth?error=login_failed",
    })(req, res, next);
  });
}
