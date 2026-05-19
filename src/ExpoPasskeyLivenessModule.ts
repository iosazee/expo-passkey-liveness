/**
 * @file Typed handle to the native module.
 *
 * Loaded lazily so that web/server bundles do not crash on the
 * `requireNativeModule` call. The exported module is `null` when
 * the native module is not present (server, web, or a misconfigured
 * RN app); callers should check before invoking and surface
 * `LIVENESS_NOT_SUPPORTED` if so.
 */

import type { ExpoPasskeyLivenessInterface } from "./ExpoPasskeyLivenessModule.types";

let cached: ExpoPasskeyLivenessInterface | null | undefined;

export function getExpoPasskeyLivenessModule(): ExpoPasskeyLivenessInterface | null {
  if (cached !== undefined) {
    return cached;
  }
  try {
     
    const core = require("expo-modules-core") as {
      requireNativeModule: (name: string) => ExpoPasskeyLivenessInterface;
    };
    cached = core.requireNativeModule("ExpoPasskeyLivenessModule");
  } catch {
    cached = null;
  }
  return cached;
}

/** For tests — replace the cached module without touching the loader. */
export function __setExpoPasskeyLivenessModule(
  mod: ExpoPasskeyLivenessInterface | null
): void {
  cached = mod;
}

/** For tests — restore loader behaviour. */
export function __resetExpoPasskeyLivenessModule(): void {
  cached = undefined;
}

export type { ExpoPasskeyLivenessInterface } from "./ExpoPasskeyLivenessModule.types";
