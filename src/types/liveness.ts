/**
 * @file Public type definitions for the liveness extension.
 *
 * These are the contracts that consumers, provider authors, and the
 * server/client implementations all agree on. Phase 1 freezes them
 * before any runtime wiring is written.
 */

export type LivenessChallenge =
  | "registration"
  | "authentication"
  | "step-up";

export type RegisteredModality =
  | "face"
  | "fingerprint"
  | "iris"
  | "other"
  | "unknown";

export type PadLevel = "L1" | "L2" | "L3";

export interface ProviderCreateSessionInput {
  userId: string;
  challenge: LivenessChallenge;
  ipAddress?: string;
  rpId: string;
  /** Hint from the client about the registered passkey modality. */
  registeredModality?: RegisteredModality;
}

export interface ProviderCreateSessionResult {
  /** Vendor session id. */
  sessionId: string;
  /** Bootstrap data passed to the native SDK on the client. */
  clientBootstrap: Record<string, unknown>;
}

export interface ProviderGetResultsInput {
  providerSessionId: string;
  userId: string;
  challenge: LivenessChallenge;
}

export interface ProviderResults {
  /** Normalised 0–100 score. */
  score: number;
  /** Whether the provider's own pass/fail signal is true. */
  passed: boolean;
  /** Optional reference frame hash or audit pointer. */
  referenceHash?: string;
  /** Free-form provider metadata. Must not contain PII. */
  meta?: Record<string, unknown>;
}

export interface LivenessProvider {
  /** Stable identifier, e.g. "rekognition" or "iproov". */
  readonly name: string;

  /** Highest iBeta PAD level the provider is currently certified at. */
  readonly padLevel?: PadLevel;

  /** Default minimum acceptable score for this provider. */
  readonly minScoreDefault: number;

  createSession(
    input: ProviderCreateSessionInput
  ): Promise<ProviderCreateSessionResult>;

  getResults(input: ProviderGetResultsInput): Promise<ProviderResults>;
}

export interface LivenessReplayStore {
  /** Returns true if the jti has been observed before. */
  get(jti: string): Promise<boolean>;
  /** Records the jti with an expiry (epoch seconds). */
  set(jti: string, expSeconds: number): Promise<void>;
}

export interface ModalityMismatchConfig {
  /**
   * Show a context-aware explainer screen before the camera launches
   * when the user's registered passkey biometric differs from face.
   * Default true.
   */
  showExplainer?: boolean;

  /** Override the default explainer copy per modality. */
  explainerStrings?: Partial<Record<RegisteredModality, ExplainerStrings>>;

  /**
   * Relax the score threshold for users whose registered biometric
   * was fingerprint, on the basis that face-liveness is doing
   * supplementary work rather than primary auth. Capped at 15 at init
   * time; values above 5 emit a one-time warning.
   */
  fingerprintScoreDelta?: number;
}

export interface ExplainerStrings {
  title?: string;
  body?: string;
  continueCta?: string;
  cancelCta?: string;
}

export interface LivenessOperationOverrides {
  minScore?: number;
  tokenMaxAge?: number;
}

export interface LivenessConfig {
  /** Which operations require a valid liveness token. */
  required: "registration" | "authentication" | "both";

  /** The provider that issues and verifies liveness sessions. */
  provider: LivenessProvider;

  /** Minimum acceptable PAD score (0–100). Defaults to provider.minScoreDefault. */
  minScore?: number;

  /** Token lifetime in seconds. Default 300. */
  tokenMaxAge?: number;

  /** Replay-protection store. Required in production. */
  replayStore?: LivenessReplayStore;

  /** Optional signing key. If omitted, derived from the Better Auth secret. */
  signingKey?: string;

  /** Per-operation overrides. */
  overrides?: {
    registration?: LivenessOperationOverrides;
    authentication?: LivenessOperationOverrides;
  };

  /** Cross-modality UX configuration. */
  modalityMismatch?: ModalityMismatchConfig;

  /** Cleanup TTL for liveness session rows, seconds. Default 600. */
  sessionTtlSeconds?: number;
}

export interface VerifyLivenessOptions {
  challenge: LivenessChallenge;
  userId?: string;
  timeout?: number;
  metadata?: Record<string, unknown>;
}

export interface VerifyLivenessSuccessData {
  livenessToken: string;
  expiresAt: string;
  score: number;
  provider: string;
  sessionId: string;
  registeredModality: RegisteredModality;
}

export interface VerifyLivenessResult {
  data: VerifyLivenessSuccessData | null;
  error: Error | null;
}

/**
 * Decoded liveness token payload. Mirrors the JWS claims defined in
 * the design spec, with shortened keys to keep tokens compact.
 */
export interface LivenessTokenPayload {
  jti: string;
  iat: number;
  exp: number;
  aud: string;
  iss: "expo-passkey-liveness";
  sid: string;
  prv: string;
  pad?: PadLevel;
  scr: number;
  chl: LivenessChallenge;
  uid?: string;
  /** Registered passkey modality at token-mint time, for audit. */
  rgm?: RegisteredModality;
}

/**
 * Slice merged into the existing authPasskey.metadata blob when a
 * liveness-gated operation completes. The expo-passkey register/auth
 * handlers are unchanged; the hook mutates ctx.body.metadata to add
 * this slice before the existing handler persists it.
 */
export interface LivenessMetadataSlice {
  provider: string;
  padLevel?: PadLevel;
  score: number;
  sessionId: string;
  verifiedAt: string;
  registeredModality?: RegisteredModality;
}
