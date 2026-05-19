/**
 * @file Server-plugin-internal types.
 *
 * Public types live in ./liveness.ts. This file holds the shapes
 * used between modules inside src/server/.
 */

import type { LoggerOptions } from "../server/utils/logger";
import type { LivenessConfig } from "./liveness";

export interface ExpoPasskeyLivenessSchemaConfig {
  passkeyLivenessSession?: { modelName?: string };
}

export interface ResolvedSchemaConfig {
  passkeyLivenessSessionModel: string;
}

export interface ExpoPasskeyLivenessOptions {
  /**
   * Relying-party identifier — must exactly match what the host
   * expo-passkey plugin uses (`options.rpId`). Used as the JWT `aud`
   * binding so tokens minted by this plugin cannot be replayed
   * against other applications sharing the same Better Auth secret.
   */
  rpId: string;

  /** Liveness policy and provider configuration. */
  liveness: LivenessConfig;

  /** Schema overrides. */
  schema?: ExpoPasskeyLivenessSchemaConfig;

  /** Logger options. */
  logger?: LoggerOptions;

  /** Cleanup options for expired session rows. */
  cleanup?: {
    /** Cleanup interval ms. Default 3_600_000 (1h). */
    intervalMs?: number;
    /** Set true in serverless environments. */
    disableInterval?: boolean;
  };

  /** Rate limiting overrides. */
  rateLimit?: {
    /** Max create-session calls per window. Default 5. */
    createSessionMax?: number;
    /** Max verify-session calls per window. Default 10. */
    verifySessionMax?: number;
    /** Window in seconds. Default 60. */
    windowSeconds?: number;
  };
}

/**
 * Database row shape for the passkeyLivenessSession table. Mirrors
 * the schema declared by the plugin.
 */
export interface PasskeyLivenessSessionRow {
  id: string;
  userId: string;
  provider: string;
  providerSessionId: string;
  challenge: "registration" | "authentication" | "step-up";
  status: "pending" | "verified" | "failed" | "expired" | "consumed";
  score: number | null;
  registeredModality: string | null;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
}
