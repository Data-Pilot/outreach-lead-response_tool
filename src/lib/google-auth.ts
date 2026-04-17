/**
 * Google Service Account → OAuth2 access token helper.
 *
 * Usage: set GOOGLE_SERVICE_ACCOUNT_JSON to the raw contents of your
 * service account key JSON file (the whole object as a string).
 *
 * Tokens are cached in-process for 55 minutes (Google issues 60-min tokens).
 */

import crypto from "crypto";

type ServiceAccountKey = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type TokenCache = {
  token: string;
  expiresAt: number; // ms since epoch
};

// Module-level cache — survives across requests in the same worker process
let cache: TokenCache | null = null;

const CACHE_DURATION_MS = 55 * 60 * 1000; // 55 min
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";

function base64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function makeJwt(key: ServiceAccountKey): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: SCOPE,
      aud: key.token_uri ?? TOKEN_URI,
      exp: now + 3600,
      iat: now,
    })
  );

  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  const sig = base64url(sign.sign(key.private_key));

  return `${signingInput}.${sig}`;
}

async function fetchAccessToken(key: ServiceAccountKey): Promise<string> {
  const jwt = makeJwt(key);

  const res = await fetch(key.token_uri ?? TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Service account token exchange failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("No access_token in Google token response");
  return data.access_token;
}

/**
 * Returns a valid access token, using the in-process cache when possible.
 * Throws if GOOGLE_SERVICE_ACCOUNT_JSON is missing or malformed.
 */
export async function getGoogleAccessToken(): Promise<string> {
  if (cache && Date.now() < cache.expiresAt) {
    return cache.token;
  }

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");

  let key: ServiceAccountKey;
  try {
    key = JSON.parse(raw) as ServiceAccountKey;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }

  if (!key.client_email || !key.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key");
  }

  const token = await fetchAccessToken(key);
  cache = { token, expiresAt: Date.now() + CACHE_DURATION_MS };
  return token;
}
