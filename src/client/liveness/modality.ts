/**
 * @file Client-side modality detection.
 *
 * Two sources, in priority order:
 *
 *   1. An explicitly-supplied modality from the caller (consumer
 *      already knows which biometric the user just used).
 *   2. expo-local-authentication's `supportedAuthenticationTypesAsync`
 *      heuristic. Loaded via dynamic import so this module works on
 *      web/server without the peer dep present.
 *
 * Both sources funnel through the shared `normalizeBiometricType`
 * helper from the server module to keep the union consistent.
 */

import { normalizeBiometricType } from "../../server/liveness/modality";
import type { RegisteredModality } from "../../types/liveness";

export interface DetectClientModalityOptions {
  /** Explicit override — bypasses detection when provided. */
  hint?: RegisteredModality;
  /**
   * Test seam — inject a custom AuthenticationType resolver. When
   * provided, dynamic import of expo-local-authentication is skipped.
   */
  __resolver?: () => Promise<unknown>;
}

export async function detectClientModality(
  options: DetectClientModalityOptions = {}
): Promise<RegisteredModality> {
  if (options.hint) {
    return options.hint;
  }
  try {
    const types = await loadAuthenticationTypes(options.__resolver);
    if (Array.isArray(types)) {
      if (types.length === 0) {
        return "unknown";
      }
      return normalizeBiometricType(types);
    }
    if (types != null) {
      return normalizeBiometricType(types);
    }
  } catch {
    // Fall through to unknown — better-than-nothing UX.
  }
  return "unknown";
}

async function loadAuthenticationTypes(
  resolver?: () => Promise<unknown>
): Promise<unknown> {
  if (resolver) {
    return resolver();
  }
  // Optional peer dep — only available on native.
  let mod: unknown;
  try {
    // @ts-expect-error -- expo-local-authentication is an optional peer dep
    mod = await import("expo-local-authentication");
  } catch {
    return null;
  }
  const m = mod as {
    supportedAuthenticationTypesAsync?: () => Promise<number[]>;
  };
  if (typeof m.supportedAuthenticationTypesAsync !== "function") {
    return null;
  }
  const raw = await m.supportedAuthenticationTypesAsync();
  // expo-local-authentication enum:
  //   FINGERPRINT = 1, FACIAL_RECOGNITION = 2, IRIS = 3
  return raw.map(String);
}
