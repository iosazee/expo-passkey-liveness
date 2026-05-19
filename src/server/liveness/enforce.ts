/**
 * @file Hook-based enforcement for liveness gating.
 *
 * The two helpers in this file are the integration point between
 * this plugin and the host expo-passkey plugin. They are wired into
 * Better Auth via `hooks.before` matchers (see core.ts), and they
 * run before the existing /expo-passkey/register and
 * /expo-passkey/authenticate handlers see the request.
 *
 *   requiresLiveness — predicate used by the matcher
 *   enforceLiveness  — validates ctx.body.livenessToken and mutates
 *                      ctx.body.metadata with the audit slice
 *
 * Failure modes throw APIError, which Better Auth will short-circuit
 * the request with. Successful enforcement is silent.
 */

import { ERROR_CODES, ERROR_MESSAGES } from "../../types/errors";
import type {
  LivenessConfig,
  LivenessMetadataSlice,
  RegisteredModality,
} from "../../types/liveness";
import type { ExpoPasskeyLivenessOptions } from "../../types/server";
import { verifyLivenessToken } from "./token";

const PATH_TO_OP: Record<string, "registration" | "authentication"> = {
  "/expo-passkey/register": "registration",
  "/expo-passkey/authenticate": "authentication",
};

export type EnforcementOperation = "registration" | "authentication";

export interface APIErrorLike {
  new (status: string, body: { code: string; message: string }): Error;
}

export interface EnforceLivenessDeps {
  options: ExpoPasskeyLivenessOptions;
  /**
   * Constructor for the APIError class. Injected so this module
   * does not import better-call directly (better-call is ESM-only
   * and complicates the test transform).
   */
  APIError: APIErrorLike;
  /** Signing key resolver. */
  resolveSigningKey: () => string;
}

/**
 * True if the current ctx.path matches /expo-passkey/register or
 * /expo-passkey/authenticate AND options.liveness.required gates it.
 */
export function requiresLiveness(
  ctx: { path?: string },
  liveness: LivenessConfig
): boolean {
  if (!ctx?.path) {
    return false;
  }
  const op = PATH_TO_OP[ctx.path];
  if (!op) {
    return false;
  }
  return operationIsGated(liveness, op);
}

export function operationIsGated(
  liveness: LivenessConfig,
  op: EnforcementOperation
): boolean {
  const r = liveness.required;
  if (r === "both") {
    return true;
  }
  return r === op;
}

interface MutableCtx {
  path?: string;
  body?: {
    livenessToken?: string;
    metadata?: Record<string, unknown>;
  } & Record<string, unknown>;
  context?: {
    session?: { user?: { id?: string } } | null;
  };
}

/**
 * Validate `ctx.body.livenessToken` and inject the audit slice into
 * `ctx.body.metadata`. Throws on any failure.
 *
 * Side-effects: mutates ctx.body.metadata.
 */
export async function enforceLiveness(
  ctx: MutableCtx,
  deps: EnforceLivenessDeps
): Promise<void> {
  const { options, APIError, resolveSigningKey } = deps;
  const { liveness } = options;

  if (!ctx.path) {
    return;
  }
  const op = PATH_TO_OP[ctx.path];
  if (!op) {
    return;
  }

  const token = ctx.body?.livenessToken;
  if (!token) {
    throw new APIError("BAD_REQUEST", {
      code: ERROR_CODES.LIVENESS.TOKEN_REQUIRED,
      message: ERROR_MESSAGES[ERROR_CODES.LIVENESS.TOKEN_REQUIRED],
    });
  }

  const expectedUserId = ctx.context?.session?.user?.id;

  // Effective threshold: base − (fingerprintScoreDelta if applicable).
  // We don't yet know the registered modality without inspecting the
  // token; verify in two passes — first a permissive verify to learn
  // rgm, then re-check against the modality-adjusted threshold.
  const permissive = await verifyLivenessToken({
    token,
    signingKey: resolveSigningKey(),
    expectedAudience: options.rpId,
    expectedChallenge: op,
    minScore: 0,
    expectedUserId,
  });
  if (!permissive.ok) {
    const code = permissive.code as keyof typeof ERROR_MESSAGES;
    throw new APIError("BAD_REQUEST", {
      code: permissive.code,
      message: ERROR_MESSAGES[code] ?? "Liveness token invalid",
    });
  }

  const registeredModality: RegisteredModality | undefined = permissive.payload.rgm;
  const effectiveMin = effectiveMinScore(liveness, op, registeredModality);

  if (permissive.payload.scr < effectiveMin) {
    throw new APIError("BAD_REQUEST", {
      code: ERROR_CODES.LIVENESS.PAD_BELOW_THRESHOLD,
      message: ERROR_MESSAGES[ERROR_CODES.LIVENESS.PAD_BELOW_THRESHOLD],
    });
  }

  // Replay enforcement, only run after threshold check passes so we
  // do not burn a jti on a token that would have been rejected.
  if (liveness.replayStore) {
    const seen = await liveness.replayStore.get(permissive.payload.jti);
    if (seen) {
      throw new APIError("BAD_REQUEST", {
        code: ERROR_CODES.LIVENESS.TOKEN_REPLAYED,
        message: ERROR_MESSAGES[ERROR_CODES.LIVENESS.TOKEN_REPLAYED],
      });
    }
    await liveness.replayStore.set(
      permissive.payload.jti,
      permissive.payload.exp
    );
  }

  const slice: LivenessMetadataSlice = {
    provider: permissive.payload.prv,
    score: permissive.payload.scr,
    sessionId: permissive.payload.sid,
    verifiedAt: new Date(permissive.payload.iat * 1000).toISOString(),
    ...(permissive.payload.pad ? { padLevel: permissive.payload.pad } : {}),
    ...(registeredModality ? { registeredModality } : {}),
  };

  ctx.body = ctx.body ?? {};
  ctx.body.metadata = {
    ...(ctx.body.metadata ?? {}),
    liveness: slice,
  };
}

export function effectiveMinScore(
  liveness: LivenessConfig,
  op: EnforcementOperation,
  registeredModality: RegisteredModality | undefined
): number {
  const base = liveness.minScore ?? liveness.provider.minScoreDefault;
  const opOverride = liveness.overrides?.[op]?.minScore;
  const start = opOverride ?? base;
  const delta = liveness.modalityMismatch?.fingerprintScoreDelta;
  if (delta && registeredModality === "fingerprint") {
    return Math.max(0, start - Math.min(15, delta));
  }
  return start;
}
