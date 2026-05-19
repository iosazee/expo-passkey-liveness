export {
  verifyLiveness,
  registerPasskeyWithLiveness,
  authenticateWithPasskeyAndLiveness,
  type VerifyLivenessOptions,
  type VerifyLivenessDeps,
  type LivenessFetcher,
} from "./native";

export { LivenessError } from "./errors";

export {
  detectClientModality,
  type DetectClientModalityOptions,
} from "./modality";

export { ExplainerScreen, type ExplainerScreenProps } from "./ui/ExplainerScreen";
export {
  DEFAULT_EXPLAINER_STRINGS,
  resolveExplainerStrings,
} from "./ui/defaultStrings";
