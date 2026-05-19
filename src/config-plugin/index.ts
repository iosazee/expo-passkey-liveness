/**
 * @file Expo config plugin entry point.
 *
 * Adds the camera permission and (optionally) wires the provider
 * SDK dependencies. Inputs come from the consumer's app.json:
 *
 *     [
 *       "expo-passkey-liveness",
 *       {
 *         "providers": ["rekognition"],
 *         "cameraUsageDescription": "Used to verify you are a real person"
 *       }
 *     ]
 *
 * The config plugin is intentionally a thin glue layer: provider-
 * specific iOS subspecs and Android Gradle additions are handled by
 * the per-provider helpers in ./ios.ts and ./android.ts.
 */

import type { ConfigPlugin } from "@expo/config-plugins";

import { withLivenessAndroid } from "./android";
import { withLivenessIos } from "./ios";

export type LivenessProviderName = "rekognition" | "iproov";

export interface ExpoPasskeyLivenessPluginProps {
  /** Providers to link natively. Default: []. */
  providers?: LivenessProviderName[];
  /** Camera-usage description for Info.plist. Default supplied. */
  cameraUsageDescription?: string;
  /**
   * Permission rationale shown when Android asks for the camera at
   * runtime. Default supplied.
   */
  androidCameraRationale?: string;
}

const DEFAULT_USAGE =
  "This app uses the camera for a quick liveness check during sign-in";

const withExpoPasskeyLiveness: ConfigPlugin<ExpoPasskeyLivenessPluginProps | void> = (
  config,
  props
) => {
  const resolved: ExpoPasskeyLivenessPluginProps = {
    providers: props?.providers ?? [],
    cameraUsageDescription: props?.cameraUsageDescription ?? DEFAULT_USAGE,
    androidCameraRationale: props?.androidCameraRationale ?? DEFAULT_USAGE,
  };
  config = withLivenessIos(config, resolved);
  config = withLivenessAndroid(config, resolved);
  return config;
};

export default withExpoPasskeyLiveness;
