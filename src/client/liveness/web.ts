/**
 * @file Web platform stub.
 *
 * Web liveness is deferred to a future release. We export the same
 * function names as ./native so consumers can write platform-agnostic
 * code; all entry points return LIVENESS_NOT_SUPPORTED.
 */

import { ERROR_CODES, ERROR_MESSAGES } from "../../types/errors";
import type {
  VerifyLivenessResult,
} from "../../types/liveness";
import { LivenessError } from "./errors";

const notSupportedError = () =>
  new LivenessError(
    ERROR_CODES.LIVENESS.NOT_SUPPORTED,
    ERROR_MESSAGES[ERROR_CODES.LIVENESS.NOT_SUPPORTED]
  );

export async function verifyLiveness(): Promise<VerifyLivenessResult> {
  return { data: null, error: notSupportedError() };
}

export async function registerPasskeyWithLiveness(): Promise<{
  data: null;
  error: Error;
}> {
  return { data: null, error: notSupportedError() };
}

export async function authenticateWithPasskeyAndLiveness(): Promise<{
  data: null;
  error: Error;
}> {
  return { data: null, error: notSupportedError() };
}

export { LivenessError } from "./errors";
