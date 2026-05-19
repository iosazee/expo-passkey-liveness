/**
 * @file Client liveness API.
 *
 * Exposes three primitives:
 *
 *   verifyLiveness(opts, deps)
 *     Runs the full ceremony: session creation → native PAD → verify.
 *     Returns `{ data, error }` so consumers can branch on
 *     `error?.code`.
 *
 *   registerPasskeyWithLiveness(opts, deps)
 *   authenticateWithPasskeyAndLiveness(opts, deps)
 *     Convenience wrappers that call verifyLiveness, propagate any
 *     error, and on success forward to the underlying expo-passkey
 *     action with the token attached.
 *
 * All entry points take a `deps` argument containing the http
 * fetcher and the expo-passkey action. This is intentional: it
 * keeps this package decoupled from a specific Better Auth client
 * shape and makes the contract testable without mocking globals.
 */

import { ERROR_CODES, ERROR_MESSAGES } from "../../types/errors";
import type {
  LivenessChallenge,
  RegisteredModality,
  VerifyLivenessResult,
  ExplainerStrings,
} from "../../types/liveness";
import { getExpoPasskeyLivenessModule } from "../../ExpoPasskeyLivenessModule";
import { detectClientModality } from "./modality";
import { LivenessError } from "./errors";

export interface LivenessFetcher {
  <T = unknown>(
    path: string,
    init: { method: "POST"; body?: unknown; headers?: Record<string, string> }
  ): Promise<{ data: T | null; error: { code?: string; message?: string } | null }>;
}

export interface VerifyLivenessDeps {
  fetcher: LivenessFetcher;
  /**
   * Optional async resolver invoked when an explainer needs to be
   * shown. Consumer is responsible for mounting the
   * <ExplainerScreen> and resolving with `true` (continue) or
   * `false` (cancel). When omitted, no explainer is shown.
   */
  presentExplainer?: (input: {
    modality: RegisteredModality;
    strings?: Partial<Record<RegisteredModality, ExplainerStrings>>;
  }) => Promise<boolean>;
}

export interface VerifyLivenessOptions {
  challenge: LivenessChallenge;
  userId?: string;
  /** Explicit modality override. Skips detection. */
  registeredModalityHint?: RegisteredModality;
  /** Disable the explainer even when a presenter is supplied. */
  showExplainer?: boolean;
  /** Override explainer copy per modality. */
  explainerStrings?: Partial<Record<RegisteredModality, ExplainerStrings>>;
  /** Native run timeout. Default 90_000 ms. */
  timeoutMs?: number;
  /** Locale hint for the native SDK. */
  locale?: string;
  /** Free-form metadata appended to the create-session request. */
  metadata?: Record<string, unknown>;
}

interface CreateSessionResponse {
  sessionId: string;
  provider: string;
  challenge: LivenessChallenge;
  expiresAt: string;
  clientBootstrap: Record<string, unknown>;
}

interface VerifySessionResponse {
  livenessToken: string;
  expiresAt: string;
  score: number;
  provider: string;
  sessionId: string;
  challenge: LivenessChallenge;
}

export async function verifyLiveness(
  options: VerifyLivenessOptions,
  deps: VerifyLivenessDeps
): Promise<VerifyLivenessResult> {
  try {
    const modality = await detectClientModality({
      hint: options.registeredModalityHint,
    });

    if (options.showExplainer !== false && deps.presentExplainer) {
      const continueRequested = await deps.presentExplainer({
        modality,
        strings: options.explainerStrings,
      });
      if (!continueRequested) {
        return {
          data: null,
          error: new LivenessError(
            ERROR_CODES.LIVENESS.USER_CANCELED,
            ERROR_MESSAGES[ERROR_CODES.LIVENESS.USER_CANCELED]
          ),
        };
      }
    }

    const sessionRes = await deps.fetcher<CreateSessionResponse>(
      "/expo-passkey/liveness/session",
      {
        method: "POST",
        body: {
          challenge: options.challenge,
          registeredModality: modality,
          ...(options.userId ? { userId: options.userId } : {}),
        },
      }
    );
    if (sessionRes.error || !sessionRes.data) {
      return {
        data: null,
        error: new LivenessError(
          sessionRes.error?.code ?? ERROR_CODES.LIVENESS.PROVIDER_ERROR,
          sessionRes.error?.message ??
            "Failed to create liveness session"
        ),
      };
    }

    const nativeModule = getExpoPasskeyLivenessModule();
    if (!nativeModule) {
      return {
        data: null,
        error: new LivenessError(
          ERROR_CODES.LIVENESS.NOT_SUPPORTED,
          ERROR_MESSAGES[ERROR_CODES.LIVENESS.NOT_SUPPORTED]
        ),
      };
    }
    if (!nativeModule.isLivenessSupported()) {
      return {
        data: null,
        error: new LivenessError(
          ERROR_CODES.LIVENESS.NOT_SUPPORTED,
          ERROR_MESSAGES[ERROR_CODES.LIVENESS.NOT_SUPPORTED]
        ),
      };
    }

    try {
      await nativeModule.runLivenessCheck({
        provider: sessionRes.data.provider,
        bootstrap: JSON.stringify(sessionRes.data.clientBootstrap),
        timeoutMs: options.timeoutMs ?? 90_000,
        locale: options.locale,
      });
    } catch (err) {
      const code = inferNativeCode(err);
      const codeKey = code as keyof typeof ERROR_MESSAGES;
      return {
        data: null,
        error: new LivenessError(
          code,
          ERROR_MESSAGES[codeKey] ??
            (err instanceof Error ? err.message : String(err)),
          err
        ),
      };
    }

    const verifyRes = await deps.fetcher<VerifySessionResponse>(
      "/expo-passkey/liveness/verify",
      {
        method: "POST",
        body: { sessionId: sessionRes.data.sessionId },
      }
    );
    if (verifyRes.error || !verifyRes.data) {
      return {
        data: null,
        error: new LivenessError(
          verifyRes.error?.code ?? ERROR_CODES.LIVENESS.PROVIDER_ERROR,
          verifyRes.error?.message ?? "Failed to verify liveness session"
        ),
      };
    }

    return {
      data: {
        livenessToken: verifyRes.data.livenessToken,
        expiresAt: verifyRes.data.expiresAt,
        score: verifyRes.data.score,
        provider: verifyRes.data.provider,
        sessionId: verifyRes.data.sessionId,
        registeredModality: modality,
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

function inferNativeCode(err: unknown): string {
  const code =
    typeof err === "object" && err && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  if (!code) {
    return ERROR_CODES.LIVENESS.PROVIDER_ERROR;
  }
  const lower = code.toLowerCase();
  if (lower.includes("cancel")) {return ERROR_CODES.LIVENESS.USER_CANCELED;}
  if (lower.includes("permission")) {return ERROR_CODES.LIVENESS.CAMERA_PERMISSION_DENIED;}
  if (lower.includes("not_supported") || lower.includes("not-supported"))
    {return ERROR_CODES.LIVENESS.NOT_SUPPORTED;}
  return ERROR_CODES.LIVENESS.PROVIDER_ERROR;
}

/**
 * Convenience wrapper: runs verifyLiveness with challenge="registration"
 * and forwards the token to the supplied registerPasskey function.
 */
export async function registerPasskeyWithLiveness<TRegisterInput, TRegisterResult>(
  options: VerifyLivenessOptions & TRegisterInput,
  deps: VerifyLivenessDeps & {
    registerPasskey: (
      input: TRegisterInput & { livenessToken: string }
    ) => Promise<TRegisterResult>;
  }
): Promise<{ data: TRegisterResult | null; error: Error | null }> {
  const livenessRes = await verifyLiveness(
    { ...options, challenge: "registration" },
    deps
  );
  if (livenessRes.error || !livenessRes.data) {
    return { data: null, error: livenessRes.error };
  }
  try {
    const data = await deps.registerPasskey({
      ...(options as TRegisterInput),
      livenessToken: livenessRes.data.livenessToken,
    });
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/**
 * Convenience wrapper: runs verifyLiveness with challenge="authentication"
 * and forwards the token to the supplied authenticateWithPasskey function.
 */
export async function authenticateWithPasskeyAndLiveness<
  TAuthInput,
  TAuthResult,
>(
  options: VerifyLivenessOptions & TAuthInput,
  deps: VerifyLivenessDeps & {
    authenticateWithPasskey: (
      input: TAuthInput & { livenessToken: string }
    ) => Promise<TAuthResult>;
  }
): Promise<{ data: TAuthResult | null; error: Error | null }> {
  const livenessRes = await verifyLiveness(
    { ...options, challenge: "authentication" },
    deps
  );
  if (livenessRes.error || !livenessRes.data) {
    return { data: null, error: livenessRes.error };
  }
  try {
    const data = await deps.authenticateWithPasskey({
      ...(options as TAuthInput),
      livenessToken: livenessRes.data.livenessToken,
    });
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}
