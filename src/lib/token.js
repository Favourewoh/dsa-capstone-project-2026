import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_SECONDS = 60 * 60 * 24;

function getTokenSecret(overrideSecret) {
  if (typeof overrideSecret === "string" && overrideSecret.length > 0) {
    return overrideSecret;
  }
  return (
    process.env.JWT_SECRET ||
    process.env.TOKEN_SECRET ||
    "dev-only-change-jwt-secret-in-production"
  );
}

function toBase64Url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), "utf8");
  return buf
    .toString("base64")
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}

function fromBase64Url(part) {
  const normalized = String(part).replaceAll("-", "+").replaceAll("_", "/");
  const remainder = normalized.length % 4;
  const padded = remainder === 0 ? normalized : normalized + "=".repeat(4 - remainder);
  return Buffer.from(padded, "base64");
}

export function signToken(payload = {}, options = {}) {
  const secret = getTokenSecret(options.secret);
  const ttlSeconds =
    typeof options.expiresInSeconds === "number" &&
    Number.isFinite(options.expiresInSeconds) &&
    options.expiresInSeconds > 0
      ? Math.floor(options.expiresInSeconds)
      : DEFAULT_TTL_SECONDS;

  const nowSec =
    typeof options.nowSeconds === "number" ? options.nowSeconds : Math.floor(Date.now() / 1000);

  const header = { alg: "HS256", typ: "JWT" };
  const claims = {
    ...payload,
    iat: nowSec,
    exp: nowSec + ttlSeconds,
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest();

  return `${signingInput}.${toBase64Url(signature)}`;
}

export function verifyToken(token, options = {}) {
  if (typeof token !== "string" || token.trim() === "") {
    throw new Error("Token is missing.");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Token format is invalid.");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  let header;
  try {
    header = JSON.parse(fromBase64Url(encodedHeader).toString("utf8"));
  } catch {
    throw new Error("Token header is invalid.");
  }

  if (!header || header.alg !== "HS256" || header.typ !== "JWT") {
    throw new Error("Token algorithm must be HS256.");
  }

  const secret = getTokenSecret(options.secret);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSig = createHmac("sha256", secret).update(signingInput).digest();
  const actualSig = fromBase64Url(encodedSignature);

  if (actualSig.length !== expectedSig.length || !timingSafeEqual(actualSig, expectedSig)) {
    throw new Error("Token signature is invalid.");
  }

  let claims;
  try {
    claims = JSON.parse(fromBase64Url(encodedPayload).toString("utf8"));
  } catch {
    throw new Error("Token payload is invalid.");
  }

  const nowSec =
    typeof options.nowSeconds === "number" ? options.nowSeconds : Math.floor(Date.now() / 1000);

  if (typeof claims?.exp !== "number" || nowSec >= claims.exp) {
    throw new Error("Token has expired.");
  }

  return claims;
}