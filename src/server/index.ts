/**
 * @file Server module entry point
 * @module expo-passkey-liveness/server
 *
 * Exports the plugin factory, type contracts, token helpers, replay
 * stores, modality detection, and built-in providers.
 *
 * The hook-based enforcement attaches in Phase 3.
 */

export { ERROR_CODES, ERROR_MESSAGES } from "../types/errors";
export type * from "../types/liveness";
export type {
  ExpoPasskeyLivenessOptions,
  ExpoPasskeyLivenessSchemaConfig,
  ResolvedSchemaConfig,
  PasskeyLivenessSessionRow,
} from "../types/server";

export { expoPasskeyLiveness, clearCleanupIntervals } from "./core";

export {
  enforceLiveness,
  requiresLiveness,
  operationIsGated,
  effectiveMinScore,
  type EnforcementOperation,
  type EnforceLivenessDeps,
} from "./liveness/enforce";

export {
  signLivenessToken,
  verifyLivenessToken,
  inMemoryReplayStore,
  redisReplayStore,
  detectModalityFromMetadata,
  normalizeBiometricType,
  customProvider,
  rekognitionProvider,
  iproovProvider,
} from "./liveness";
export type {
  SignLivenessTokenInput,
  SignLivenessTokenResult,
  VerifyLivenessTokenInput,
  VerifyLivenessTokenResult,
  InMemoryReplayStoreOptions,
  RedisLike,
  RedisReplayStoreOptions,
  RekognitionProviderConfig,
  RekognitionSdkLike,
  RekognitionClientLike,
  IProovProviderConfig,
} from "./liveness";
