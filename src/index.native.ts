/**
 * @file Native module entry point
 * @module expo-passkey-liveness/native
 */

export { ERROR_CODES } from "./types/errors";
export type * from "./types/liveness";

export {
  verifyLiveness,
  registerPasskeyWithLiveness,
  authenticateWithPasskeyAndLiveness,
  LivenessError,
  detectClientModality,
  ExplainerScreen,
  DEFAULT_EXPLAINER_STRINGS,
  resolveExplainerStrings,
  type VerifyLivenessOptions,
  type VerifyLivenessDeps,
  type LivenessFetcher,
  type DetectClientModalityOptions,
  type ExplainerScreenProps,
} from "./client/liveness";
