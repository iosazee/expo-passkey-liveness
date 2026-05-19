/**
 * @file Web module entry point
 * @module expo-passkey-liveness/web
 */

export { ERROR_CODES } from "./types/errors";
export type * from "./types/liveness";

export {
  verifyLiveness,
  registerPasskeyWithLiveness,
  authenticateWithPasskeyAndLiveness,
  LivenessError,
} from "./client/liveness/web";
