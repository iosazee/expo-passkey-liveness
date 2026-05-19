/**
 * @file Default explainer copy per registered modality.
 *
 * Kept minimal and on-brand-neutral. Consumers override via
 * LivenessConfig.modalityMismatch.explainerStrings or by passing
 * a custom render function for the screen entirely.
 */

import type { ExplainerStrings, RegisteredModality } from "../../../types/liveness";

const continueCta = "Continue";
const cancelCta = "Cancel";

export const DEFAULT_EXPLAINER_STRINGS: Record<
  RegisteredModality,
  Required<ExplainerStrings>
> = {
  face: {
    title: "Quick face check",
    body:
      "Please point your camera at your face. We just need to confirm you're really here.",
    continueCta,
    cancelCta,
  },
  fingerprint: {
    title: "Quick face check",
    body:
      "You just signed in with your fingerprint. To finish, we need a quick check that you're really here. Please point your camera at your face.",
    continueCta,
    cancelCta,
  },
  iris: {
    title: "Quick face check",
    body:
      "You just signed in with your eye scan. To finish, we need a quick face check. Please point your camera at your face.",
    continueCta,
    cancelCta,
  },
  other: {
    title: "Quick face check",
    body:
      "To finish, we need a quick check that you're really here. Please point your camera at your face.",
    continueCta,
    cancelCta,
  },
  unknown: {
    title: "Quick face check",
    body:
      "To finish, we need a quick check that you're really here. Please point your camera at your face.",
    continueCta,
    cancelCta,
  },
};

export function resolveExplainerStrings(
  modality: RegisteredModality,
  overrides:
    | Partial<Record<RegisteredModality, ExplainerStrings>>
    | undefined
): Required<ExplainerStrings> {
  const base = DEFAULT_EXPLAINER_STRINGS[modality];
  const override = overrides?.[modality];
  return {
    title: override?.title ?? base.title,
    body: override?.body ?? base.body,
    continueCta: override?.continueCta ?? base.continueCta,
    cancelCta: override?.cancelCta ?? base.cancelCta,
  };
}
