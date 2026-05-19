/**
 * @file POST /expo-passkey/liveness/verify
 *
 * Finalises a provider session, applies the policy, and mints a
 * short-lived signed liveness token. The token is what gets attached
 * to subsequent expo-passkey register/authenticate calls.
 */

import { createAuthEndpoint } from "better-auth/api";
import { APIError } from "better-call";

import { ERROR_CODES, ERROR_MESSAGES } from "../../types/errors";
import type { RegisteredModality } from "../../types/liveness";
import type {
  ExpoPasskeyLivenessOptions,
  PasskeyLivenessSessionRow,
  ResolvedSchemaConfig,
} from "../../types/server";
import { signLivenessToken } from "../liveness/token";
import type { Logger } from "../utils/logger";
import { verifySessionSchema } from "../utils/schema";

export interface VerifySessionEndpointDeps {
  options: ExpoPasskeyLivenessOptions;
  logger: Logger;
  schemaConfig: ResolvedSchemaConfig;
  /** Signing key resolver — usually the Better Auth secret. */
  resolveSigningKey: () => string;
}

export const createVerifySessionEndpoint = (deps: VerifySessionEndpointDeps) => {
  const { options, logger, schemaConfig, resolveSigningKey } = deps;
  const { liveness } = options;
  const { provider } = liveness;

  return createAuthEndpoint(
    "/expo-passkey/liveness/verify",
    {
      method: "POST",
      body: verifySessionSchema,
      metadata: {
        openapi: {
          description:
            "Finalise a provider liveness session. Returns a signed livenessToken bound to the user, challenge, and rpId.",
          tags: ["Liveness"],
        },
      },
    },
    async (ctx) => {
      const { sessionId } = ctx.body;

      const row = (await ctx.context.adapter.findOne({
        model: schemaConfig.passkeyLivenessSessionModel,
        where: [{ field: "id", operator: "eq", value: sessionId }],
      })) as PasskeyLivenessSessionRow | null;

      if (!row) {
        throw new APIError("NOT_FOUND", {
          code: ERROR_CODES.LIVENESS.SESSION_NOT_FOUND,
          message: ERROR_MESSAGES[ERROR_CODES.LIVENESS.SESSION_NOT_FOUND],
        });
      }

      if (row.status !== "pending") {
        throw new APIError("BAD_REQUEST", {
          code: ERROR_CODES.LIVENESS.SESSION_ALREADY_CONSUMED,
          message:
            ERROR_MESSAGES[ERROR_CODES.LIVENESS.SESSION_ALREADY_CONSUMED],
        });
      }

      const now = new Date();
      if (new Date(row.expiresAt).getTime() <= now.getTime()) {
        await ctx.context.adapter.update({
          model: schemaConfig.passkeyLivenessSessionModel,
          where: [{ field: "id", operator: "eq", value: sessionId }],
          update: { status: "expired" },
        });
        throw new APIError("BAD_REQUEST", {
          code: ERROR_CODES.LIVENESS.SESSION_EXPIRED,
          message: ERROR_MESSAGES[ERROR_CODES.LIVENESS.SESSION_EXPIRED],
        });
      }

      // Fetch provider results.
      let results;
      try {
        results = await provider.getResults({
          providerSessionId: row.providerSessionId,
          userId: row.userId,
          challenge: row.challenge,
        });
      } catch (err) {
        logger.error("Provider getResults failed", err);
        throw new APIError("BAD_GATEWAY", {
          code: ERROR_CODES.LIVENESS.PROVIDER_ERROR,
          message:
            ERROR_MESSAGES[ERROR_CODES.LIVENESS.PROVIDER_ERROR] +
            ": " +
            (err instanceof Error ? err.message : String(err)),
        });
      }

      const effectiveMinScore = computeMinScore(
        options,
        row.challenge,
        (row.registeredModality as RegisteredModality | null) ?? undefined
      );

      if (!results.passed || results.score < effectiveMinScore) {
        await ctx.context.adapter.update({
          model: schemaConfig.passkeyLivenessSessionModel,
          where: [{ field: "id", operator: "eq", value: sessionId }],
          update: {
            status: "failed",
            score: results.score,
          },
        });
        throw new APIError("BAD_REQUEST", {
          code: ERROR_CODES.LIVENESS.PAD_BELOW_THRESHOLD,
          message: ERROR_MESSAGES[ERROR_CODES.LIVENESS.PAD_BELOW_THRESHOLD],
        });
      }

      const maxAgeSeconds = computeMaxAge(options, row.challenge);
      const signed = await signLivenessToken({
        signingKey: resolveSigningKey(),
        audience: options.rpId,
        challenge: row.challenge,
        sessionId: row.id,
        provider: provider.name,
        score: results.score,
        userId: row.userId,
        padLevel: provider.padLevel,
        registeredModality:
          (row.registeredModality as RegisteredModality | null) ?? undefined,
        maxAgeSeconds,
      });

      await ctx.context.adapter.update({
        model: schemaConfig.passkeyLivenessSessionModel,
        where: [{ field: "id", operator: "eq", value: sessionId }],
        update: {
          status: "verified",
          score: results.score,
        },
      });

      logger.debug("Issued liveness token", {
        sessionId: row.id,
        jti: signed.jti,
        challenge: row.challenge,
      });

      return ctx.json({
        livenessToken: signed.token,
        expiresAt: signed.expiresAt.toISOString(),
        score: results.score,
        provider: provider.name,
        sessionId: row.id,
        challenge: row.challenge,
      });
    }
  );
};

function computeMinScore(
  options: ExpoPasskeyLivenessOptions,
  challenge: PasskeyLivenessSessionRow["challenge"],
  registeredModality: RegisteredModality | undefined
): number {
  const { liveness } = options;
  const base = liveness.minScore ?? liveness.provider.minScoreDefault;
  let effective = base;
  if (challenge === "registration") {
    effective = liveness.overrides?.registration?.minScore ?? base;
  } else if (challenge === "authentication") {
    effective = liveness.overrides?.authentication?.minScore ?? base;
  }
  const delta = liveness.modalityMismatch?.fingerprintScoreDelta;
  if (delta && registeredModality === "fingerprint") {
    effective = Math.max(0, effective - Math.min(15, delta));
  }
  return effective;
}

function computeMaxAge(
  options: ExpoPasskeyLivenessOptions,
  challenge: PasskeyLivenessSessionRow["challenge"]
): number {
  const { liveness } = options;
  const base = liveness.tokenMaxAge ?? 300;
  if (challenge === "registration") {
    return liveness.overrides?.registration?.tokenMaxAge ?? base;
  }
  if (challenge === "authentication") {
    return liveness.overrides?.authentication?.tokenMaxAge ?? base;
  }
  return base;
}
