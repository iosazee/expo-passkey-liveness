/**
 * @file Native module interface.
 *
 * Surface kept deliberately small: the JS layer is responsible for
 * provider selection, server I/O, and policy. Native only owns the
 * camera ceremony and SDK invocation.
 */

export interface NativeRunLivenessOptions {
  /** Provider name (e.g. "rekognition"). Used to dispatch the adapter. */
  provider: string;
  /** Bootstrap data from /expo-passkey/liveness/session, JSON-stringified. */
  bootstrap: string;
  /** Timeout in milliseconds. Default 90_000. */
  timeoutMs?: number;
  /** Caller-supplied locale, e.g. "en-US". Hints the SDK's UI. */
  locale?: string;
}

/**
 * Native completion payload. JSON-stringified before crossing the
 * bridge so the JS side can extend the schema without re-shipping
 * native code.
 */
export interface NativeLivenessCompletion {
  /** Provider's own session id (echoes the one passed in). */
  sessionId: string;
  /**
   * Best-effort confidence the native SDK exposes locally. The
   * authoritative score still comes from the server's verify call;
   * this is only useful for debug logging.
   */
  localConfidence?: number;
  /** Free-form provider metadata. Must not include PII. */
  meta?: Record<string, unknown>;
}

export interface ExpoPasskeyLivenessInterface {
  /** Camera available + OS version supports it. Cheap to call. */
  isLivenessSupported(): boolean;
  /**
   * Run the provider SDK flow. Resolves to a JSON-stringified
   * NativeLivenessCompletion; rejects with a known LIVENESS_* code
   * on cancel, permission denial, or provider error.
   */
  runLivenessCheck(options: NativeRunLivenessOptions): Promise<string>;
  /** Cancel any in-flight check. */
  cancel(): Promise<void>;
}
