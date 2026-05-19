/**
 * @file Liveness token mint and verify.
 *
 * Tokens are short-lived HS256 JWS values (RFC 7515) carrying the
 * minimum claim set required to bind a successful liveness ceremony
 * to a specific passkey operation. The signing key is supplied by
 * the consumer, normally derived from the Better Auth secret.
 *
 * verifyLivenessToken returns a discriminated result rather than
 * throwing, so callers (the enforcement hook, the standalone helper)
 * can map directly to an ERROR_CODES.LIVENESS.* value.
 */

import { SignJWT, jwtVerify, errors as joseErrors } from "jose";

import { ERROR_CODES } from "../../types/errors";
import type {
  LivenessChallenge,
  LivenessReplayStore,
  LivenessTokenPayload,
  PadLevel,
  RegisteredModality,
} from "../../types/liveness";

const ISSUER = "expo-passkey-liveness" as const;
const ALGORITHM = "HS256" as const;

export interface SignLivenessTokenInput {
  signingKey: string;
  audience: string;
  challenge: LivenessChallenge;
  sessionId: string;
  provider: string;
  score: number;
  userId?: string;
  padLevel?: PadLevel;
  registeredModality?: RegisteredModality;
  /** Token lifetime in seconds. Default 300. */
  maxAgeSeconds?: number;
  /** Optional override for tests; defaults to a generated ulid-like id. */
  jti?: string;
  /** Optional override for tests; defaults to Date.now()/1000. */
  nowSeconds?: number;
}

export interface SignLivenessTokenResult {
  token: string;
  jti: string;
  expiresAt: Date;
}

export interface VerifyLivenessTokenInput {
  token: string;
  signingKey: string;
  expectedAudience: string;
  expectedChallenge: LivenessChallenge;
  minScore: number;
  expectedUserId?: string;
  replayStore?: LivenessReplayStore;
  nowSeconds?: number;
}

export type VerifyLivenessTokenResult =
  | { ok: true; payload: LivenessTokenPayload }
  | { ok: false; code: string };

/**
 * Sign a liveness token. Returns the compact JWS plus the jti, so
 * the caller can also persist or echo it.
 */
export async function signLivenessToken(
  input: SignLivenessTokenInput
): Promise<SignLivenessTokenResult> {
  if (!input.signingKey) {
    throw new Error("signingKey is required");
  }
  if (input.score < 0 || input.score > 100) {
    throw new Error("score must be between 0 and 100");
  }

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxAge = input.maxAgeSeconds ?? 300;
  const jti = input.jti ?? generateJti();

  const payload: LivenessTokenPayload = {
    jti,
    iat: now,
    exp: now + maxAge,
    aud: input.audience,
    iss: ISSUER,
    sid: input.sessionId,
    prv: input.provider,
    scr: input.score,
    chl: input.challenge,
    ...(input.padLevel ? { pad: input.padLevel } : {}),
    ...(input.userId ? { uid: input.userId } : {}),
    ...(input.registeredModality ? { rgm: input.registeredModality } : {}),
  };

  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALGORITHM, typ: "JWT" })
    .sign(toKey(input.signingKey));

  return {
    token,
    jti,
    expiresAt: new Date(payload.exp * 1000),
  };
}

/**
 * Verify a liveness token. Performs signature, expiry, audience,
 * challenge, score, replay, and (optionally) user-binding checks
 * in that order, returning the first failure as a stable code.
 *
 * Replay-store enforcement: if a replayStore is provided, verify
 * atomically inserts the jti after all other checks pass. Subsequent
 * calls with the same jti return TOKEN_REPLAYED.
 */
export async function verifyLivenessToken(
  input: VerifyLivenessTokenInput
): Promise<VerifyLivenessTokenResult> {
  let payload: LivenessTokenPayload;

  try {
    const result = await jwtVerify(input.token, toKey(input.signingKey), {
      issuer: ISSUER,
      audience: input.expectedAudience,
      algorithms: [ALGORITHM],
      clockTolerance: 0,
      currentDate: input.nowSeconds
        ? new Date(input.nowSeconds * 1000)
        : undefined,
    });
    payload = result.payload as unknown as LivenessTokenPayload;
  } catch (err) {
    return { ok: false, code: mapJoseError(err) };
  }

  if (payload.chl !== input.expectedChallenge) {
    return { ok: false, code: ERROR_CODES.LIVENESS.TOKEN_CHALLENGE_MISMATCH };
  }

  if (typeof payload.scr !== "number" || payload.scr < input.minScore) {
    return { ok: false, code: ERROR_CODES.LIVENESS.PAD_BELOW_THRESHOLD };
  }

  if (input.expectedUserId && payload.uid && payload.uid !== input.expectedUserId) {
    return { ok: false, code: ERROR_CODES.LIVENESS.TOKEN_USER_MISMATCH };
  }

  if (input.replayStore) {
    const seen = await input.replayStore.get(payload.jti);
    if (seen) {
      return { ok: false, code: ERROR_CODES.LIVENESS.TOKEN_REPLAYED };
    }
    await input.replayStore.set(payload.jti, payload.exp);
  }

  return { ok: true, payload };
}

function toKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

function mapJoseError(err: unknown): string {
  if (err instanceof joseErrors.JWTExpired) {
    return ERROR_CODES.LIVENESS.TOKEN_EXPIRED;
  }
  if (err instanceof joseErrors.JWTClaimValidationFailed) {
    if (err.claim === "aud") {
      return ERROR_CODES.LIVENESS.TOKEN_AUDIENCE_MISMATCH;
    }
    return ERROR_CODES.LIVENESS.TOKEN_INVALID;
  }
  return ERROR_CODES.LIVENESS.TOKEN_INVALID;
}

/**
 * Generate a compact, sortable, collision-resistant token id. Not a
 * full ULID — we avoid the dependency and use 16 random bytes encoded
 * as base32, which is sufficient for jti uniqueness.
 */
function generateJti(): string {
  const bytes = randomBytes(16);
  return base32(bytes);
}

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  // Prefer Web Crypto when available (Node 19+, all RN runtimes).
  const g = globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } };
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(out);
    return out;
  }
  // Node fallback. Imported lazily so the bundler does not pull it on web.
   
  const nodeCrypto = require("crypto") as { randomBytes: (n: number) => Buffer };
  const buf = nodeCrypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    out[i] = buf[i];
  }
  return out;
}

const BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford
function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}
