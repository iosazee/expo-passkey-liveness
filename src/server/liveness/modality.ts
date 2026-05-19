/**
 * @file Modality detection from an existing authPasskey metadata blob.
 *
 * expo-passkey records the authenticator type at registration time
 * inside authPasskey.metadata. This helper normalises that field into
 * the RegisteredModality union used by the liveness extension's
 * UX layer (explainer screen) and policy layer (threshold relaxation).
 *
 * Supported source values cover what expo-local-authentication's
 * AuthenticationType enum surfaces on each platform, plus the more
 * common free-form spellings we have observed in the wild.
 */

import type { RegisteredModality } from "../../types/liveness";

const FACE_VALUES = new Set([
  "faceid",
  "face_id",
  "face",
  "facialrecognition",
  "facial_recognition",
  "2", // expo-local-authentication AuthenticationType.FACIAL_RECOGNITION
]);

const FINGERPRINT_VALUES = new Set([
  "fingerprint",
  "touchid",
  "touch_id",
  "1", // expo-local-authentication AuthenticationType.FINGERPRINT
]);

const IRIS_VALUES = new Set([
  "iris",
  "3", // expo-local-authentication AuthenticationType.IRIS
]);

/**
 * Parse the existing metadata JSON and return the registered modality.
 * Returns "unknown" for any input we can't confidently classify,
 * including missing/garbage JSON.
 */
export function detectModalityFromMetadata(
  metadataJson: string | null | undefined
): RegisteredModality {
  if (!metadataJson) {
    return "unknown";
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(metadataJson);
  } catch {
    return "unknown";
  }

  if (!parsed || typeof parsed !== "object") {
    return "unknown";
  }

  const root = parsed as Record<string, unknown>;
  const candidate = pickBiometricType(root);

  return normalize(candidate);
}

/**
 * Direct mapping from a known biometric-type string to the union.
 * Exported for the client-side helper that reads the type from
 * CredentialMetadata rather than a JSON blob.
 */
export function normalizeBiometricType(value: unknown): RegisteredModality {
  return normalize(value);
}

function pickBiometricType(root: Record<string, unknown>): unknown {
  // expo-passkey writes biometricType at the top of the metadata blob.
  if ("biometricType" in root) {
    return root.biometricType;
  }
  // Some older entries nested it under verificationSettings.
  const vs = root.verificationSettings;
  if (vs && typeof vs === "object" && "biometricType" in (vs as object)) {
    return (vs as Record<string, unknown>).biometricType;
  }
  // Even older entries used the singular form.
  if ("biometric" in root) {
    return root.biometric;
  }
  return undefined;
}

function normalize(value: unknown): RegisteredModality {
  if (value == null) {
    return "unknown";
  }

  if (Array.isArray(value)) {
    // expo-local-authentication can return multiple supported types.
    // Prefer face when present, then fingerprint, then iris.
    if (value.some((v) => normalize(v) === "face")) {return "face";}
    if (value.some((v) => normalize(v) === "fingerprint")) {return "fingerprint";}
    if (value.some((v) => normalize(v) === "iris")) {return "iris";}
    return "other";
  }

  const key = String(value).trim().toLowerCase();
  if (!key) {
    return "unknown";
  }
  if (FACE_VALUES.has(key)) {return "face";}
  if (FINGERPRINT_VALUES.has(key)) {return "fingerprint";}
  if (IRIS_VALUES.has(key)) {return "iris";}
  return "other";
}
