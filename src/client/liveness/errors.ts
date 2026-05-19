/**
 * Client-side error class. Mirrors the shape of expo-passkey's
 * `PasskeyError` so consumers can branch on `error.code` uniformly.
 */
export class LivenessError extends Error {
  readonly code: string;
  readonly cause?: unknown;
  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = "LivenessError";
    this.code = code;
    this.cause = cause;
  }
}
