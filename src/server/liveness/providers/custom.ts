/**
 * @file Identity-adapter provider.
 *
 * customProvider lets consumers plug in any LivenessProvider
 * implementation — a self-hosted model, an unsupported vendor SDK,
 * or a TEE-resident verifier — without the library having any
 * opinion about how it works. The "adapter" is just a passthrough.
 */

import type { LivenessProvider } from "../../../types/liveness";

export function customProvider(impl: LivenessProvider): LivenessProvider {
  if (!impl || typeof impl.createSession !== "function" || typeof impl.getResults !== "function") {
    throw new Error("customProvider: impl must implement LivenessProvider");
  }
  if (!impl.name) {
    throw new Error("customProvider: impl.name is required");
  }
  if (typeof impl.minScoreDefault !== "number") {
    throw new Error("customProvider: impl.minScoreDefault is required");
  }
  return impl;
}
