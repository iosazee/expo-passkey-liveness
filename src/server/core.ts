/**
 * @file Server plugin entry point: `expoPasskeyLiveness()`.
 *
 * Phase 2 scope:
 *  - Plugin factory and option validation
 *  - Schema registration for the passkeyLivenessSession table
 *  - The two new endpoints (create-session, verify-session)
 *  - Hourly cleanup job for expired rows
 *
 * Phase 3 will add the `hooks.before` matchers for
 * /expo-passkey/register and /expo-passkey/authenticate.
 */

import { createAuthMiddleware } from "better-auth/api";
import { APIError } from "better-call";
import type { BetterAuthPlugin } from "better-auth/types";

import type {
  ExpoPasskeyLivenessOptions,
  ResolvedSchemaConfig,
} from "../types/server";
import {
  enforceLiveness,
  requiresLiveness,
} from "./liveness/enforce";

/**
 * Minimal structural type for the Better Auth context bits we touch.
 * Avoids depending on `MinimalAuthContext` directly, which moved between
 * `better-auth/types` (1.3.x) and `@better-auth/core/types` (1.6+);
 * pinning to either breaks one of those version ranges.
 */
interface MinimalAuthContext {
  secret?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: any;
}

import {
  createCreateSessionEndpoint,
  createVerifySessionEndpoint,
} from "./endpoints";
import { createLogger } from "./utils";

const cleanupIntervals: Array<ReturnType<typeof setInterval>> = [];

/** Test helper — clear any cleanup timers registered by the plugin. */
export function clearCleanupIntervals(): void {
  cleanupIntervals.forEach((i) => clearInterval(i));
  cleanupIntervals.length = 0;
}

function resolveSchemaConfig(
  options: ExpoPasskeyLivenessOptions
): ResolvedSchemaConfig {
  return {
    passkeyLivenessSessionModel:
      options.schema?.passkeyLivenessSession?.modelName ??
      "passkeyLivenessSession",
  };
}

function validateOptions(options: ExpoPasskeyLivenessOptions): void {
  if (!options.rpId) {
    throw new Error(
      "expoPasskeyLiveness: rpId is required and must match the host expo-passkey plugin's rpId"
    );
  }
  if (!options.liveness) {
    throw new Error("expoPasskeyLiveness: liveness configuration is required");
  }
  if (!options.liveness.provider) {
    throw new Error("expoPasskeyLiveness: liveness.provider is required");
  }
  const allowed = new Set(["registration", "authentication", "both"]);
  if (!allowed.has(options.liveness.required)) {
    throw new Error(
      `expoPasskeyLiveness: liveness.required must be one of registration|authentication|both, got ${options.liveness.required}`
    );
  }
  const delta = options.liveness.modalityMismatch?.fingerprintScoreDelta;
  if (delta !== undefined) {
    if (delta < 0 || delta > 15) {
      throw new Error(
        `expoPasskeyLiveness: modalityMismatch.fingerprintScoreDelta must be between 0 and 15 (got ${delta})`
      );
    }
  }
}

export const expoPasskeyLiveness = (
  options: ExpoPasskeyLivenessOptions
): BetterAuthPlugin => {
  validateOptions(options);
  const logger = createLogger(options.logger);

  // Warn once if the operator opted into a risky threshold relaxation.
  const delta = options.liveness.modalityMismatch?.fingerprintScoreDelta;
  if (delta !== undefined && delta > 5) {
    logger.warn(
      `modalityMismatch.fingerprintScoreDelta=${delta} is above the recommended limit of 5; this lowers the bar specifically for fingerprint-registered users and can preferentially affect that cohort under spoofing attempts`
    );
  }

  const schemaConfig = resolveSchemaConfig(options);

  const createSessionEndpoint = createCreateSessionEndpoint({
    options,
    logger,
    schemaConfig,
  });

  const verifySessionEndpoint = createVerifySessionEndpoint({
    options,
    logger,
    schemaConfig,
    resolveSigningKey: () => resolveSigningKey(),
  });

  // Better Auth invokes init(ctx) once; we capture the secret there
  // for the signing-key thunk above. This avoids requiring consumers
  // to duplicate their Better Auth secret in the liveness config.
  let currentMinimalAuthContext: MinimalAuthContext | null = null;

  return {
    id: "expo-passkey-liveness",

    schema: {
      [schemaConfig.passkeyLivenessSessionModel]: {
        modelName: schemaConfig.passkeyLivenessSessionModel,
        fields: {
          userId: {
            type: "string",
            required: true,
            references: {
              model: "user",
              field: "id",
              onDelete: "cascade",
            },
          },
          provider: { type: "string", required: true },
          providerSessionId: { type: "string", required: true },
          challenge: { type: "string", required: true },
          status: { type: "string", required: true, defaultValue: "pending" },
          score: { type: "number", required: false },
          registeredModality: { type: "string", required: false },
          createdAt: { type: "string", required: true },
          expiresAt: { type: "string", required: true },
          consumedAt: { type: "string", required: false },
        },
      },
    },

    init: (ctx: MinimalAuthContext) => {
      currentMinimalAuthContext = ctx;
      if (process.env.NODE_ENV !== "production") {
        logger.info("Initialising expo-passkey-liveness plugin");
      }
      registerCleanup(ctx, options, schemaConfig, logger);
    },

    endpoints: {
      createLivenessSession: createSessionEndpoint,
      verifyLivenessSession: verifySessionEndpoint,
    },

    hooks: {
      before: [
        {
          matcher: (ctx) => requiresLiveness(ctx, options.liveness),
          handler: createAuthMiddleware(async (ctx) => {
            await enforceLiveness(
              ctx as Parameters<typeof enforceLiveness>[0],
              {
                options,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                APIError: APIError as any,
                resolveSigningKey,
              }
            );
          }),
        },
      ],
    },
  };

  function resolveSigningKey(): string {
    if (options.liveness.signingKey) {
      return options.liveness.signingKey;
    }
    const ctxSecret = currentMinimalAuthContext?.secret;
    if (!ctxSecret) {
      throw new Error(
        "expoPasskeyLiveness: no signing key available; either configure liveness.signingKey or ensure Better Auth has a secret"
      );
    }
    return ctxSecret;
  }
};

function registerCleanup(
  ctx: MinimalAuthContext,
  options: ExpoPasskeyLivenessOptions,
  schemaConfig: ResolvedSchemaConfig,
  logger: ReturnType<typeof createLogger>
): void {
  if (options.cleanup?.disableInterval) {
    return;
  }
  const intervalMs = options.cleanup?.intervalMs ?? 60 * 60 * 1000;

  const run = async (): Promise<void> => {
    const now = new Date().toISOString();
    try {
      const deleted = await ctx.adapter.deleteMany({
        model: schemaConfig.passkeyLivenessSessionModel,
        where: [{ field: "expiresAt", operator: "lt", value: now }],
      });
      logger.debug(`Cleaned up ${deleted} expired liveness sessions`);
    } catch (err) {
      logger.error("Liveness session cleanup failed", err);
    }
  };

  // Run once on init, then on the interval.
  void run();
  const interval = setInterval(run, intervalMs);
  if (typeof (interval as unknown as { unref?: () => void }).unref === "function") {
    (interval as unknown as { unref: () => void }).unref();
  }
  cleanupIntervals.push(interval);
}
