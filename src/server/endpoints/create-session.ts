/**
 * @file POST /expo-passkey/liveness/session
 *
 * Creates a provider liveness session and persists a pending row
 * for replay/audit. Authentication challenges may run without a
 * session (mirroring expo-passkey's own /expo-passkey/challenge);
 * registration and step-up always require an authenticated user.
 */

import { createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { APIError } from "better-call";

import { ERROR_CODES, ERROR_MESSAGES } from "../../types/errors";
import type {
  ExpoPasskeyLivenessOptions,
  ResolvedSchemaConfig,
} from "../../types/server";
import type { Logger } from "../utils/logger";
import { createSessionSchema } from "../utils/schema";

export const _getSession = getSessionFromCtx;

export interface CreateSessionEndpointDeps {
  options: ExpoPasskeyLivenessOptions;
  logger: Logger;
  schemaConfig: ResolvedSchemaConfig;
  /** @internal — test seam. */
  _sessionFetcher?: typeof getSessionFromCtx;
}

export const createCreateSessionEndpoint = (deps: CreateSessionEndpointDeps) => {
  const { options, logger, schemaConfig, _sessionFetcher = _getSession } = deps;
  const { provider } = options.liveness;

  return createAuthEndpoint(
    "/expo-passkey/liveness/session",
    {
      method: "POST",
      body: createSessionSchema,
      metadata: {
        openapi: {
          description:
            "Create a provider liveness session and return the client bootstrap data needed to run the PAD ceremony on-device.",
          tags: ["Liveness"],
        },
      },
    },
    async (ctx) => {
      const { challenge, registeredModality, userId: bodyUserId } = ctx.body;

      // Resolve userId.
      let userId: string | null = null;
      let session: Awaited<ReturnType<typeof _sessionFetcher>> | null = null;
      try {
        session = await _sessionFetcher(ctx);
      } catch (err) {
        logger.debug("Session fetch failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        session = null;
      }

      if (challenge === "registration" || challenge === "step-up") {
        if (!session?.user?.id) {
          throw new APIError("UNAUTHORIZED", {
            code: "SESSION_REQUIRED",
            message: "You must be logged in to start a liveness session",
          });
        }
        userId = session.user.id;
      } else {
        userId = session?.user?.id ?? bodyUserId ?? null;
        if (!userId) {
          throw new APIError("BAD_REQUEST", {
            code: ERROR_CODES.LIVENESS.CONFIG_INVALID,
            message:
              "An authentication liveness session requires either a session or a userId in the request body",
          });
        }
      }

      const ipAddress =
        ctx.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        ctx.headers?.get("x-real-ip") ||
        undefined;

      let providerSession;
      try {
        providerSession = await provider.createSession({
          userId,
          challenge,
          rpId: options.rpId,
          ipAddress,
          registeredModality,
        });
      } catch (err) {
        logger.error("Provider createSession failed", err);
        throw new APIError("BAD_GATEWAY", {
          code: ERROR_CODES.LIVENESS.PROVIDER_ERROR,
          message:
            ERROR_MESSAGES[ERROR_CODES.LIVENESS.PROVIDER_ERROR] +
            ": " +
            (err instanceof Error ? err.message : String(err)),
        });
      }

      const ttlSeconds = options.liveness.sessionTtlSeconds ?? 600;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

      const row = await ctx.context.adapter.create({
        model: schemaConfig.passkeyLivenessSessionModel,
        data: {
          userId,
          provider: provider.name,
          providerSessionId: providerSession.sessionId,
          challenge,
          status: "pending",
          score: null,
          registeredModality: registeredModality ?? null,
          createdAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          consumedAt: null,
        },
      });

      logger.debug("Created liveness session", {
        sessionId: (row as { id?: string }).id,
        provider: provider.name,
        challenge,
      });

      return ctx.json({
        sessionId: (row as { id: string }).id,
        provider: provider.name,
        challenge,
        expiresAt: expiresAt.toISOString(),
        clientBootstrap: providerSession.clientBootstrap,
      });
    }
  );
};
