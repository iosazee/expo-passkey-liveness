/**
 * @file iOS config-plugin step.
 *
 * Two things land in the consumer's project here:
 *
 *   1. `NSCameraUsageDescription` in Info.plist (always).
 *   2. Provider SDK pods in the Podfile (when listed under `providers`):
 *        - "rekognition" → pod 'FaceLiveness' from amplify-ui-swift-liveness
 *        - "iproov"      → pod 'iProov'
 *
 *   We modify the consumer's Podfile rather than declaring these in
 *   our own podspec so that consumers who don't use a provider don't
 *   pay its build-graph cost.
 */

import {
  withInfoPlist,
  withDangerousMod,
  type ConfigPlugin,
} from "@expo/config-plugins";
import * as fs from "fs";
import * as path from "path";

import type {
  ExpoPasskeyLivenessPluginProps,
  LivenessProviderName,
} from "./index";

const POD_BLOCK_MARKER = "# expo-passkey-liveness:providers";

const PROVIDER_PODS: Record<LivenessProviderName, string[]> = {
  // amplify-ui-swift-liveness publishes the FaceLiveness Swift package;
  // when consumers need CocoaPods, they typically use the Amplify SDK
  // suite pod that exposes it.
  rekognition: ["FaceLiveness"],
  iproov: ["iProov"],
};

export const withLivenessIos: ConfigPlugin<ExpoPasskeyLivenessPluginProps> = (
  config,
  props
) => {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.NSCameraUsageDescription =
      props.cameraUsageDescription ?? cfg.modResults.NSCameraUsageDescription;
    return cfg;
  });

  if ((props.providers ?? []).length > 0) {
    config = withDangerousMod(config, [
      "ios",
      async (cfg) => {
        const podfilePath = path.join(
          cfg.modRequest.platformProjectRoot,
          "Podfile"
        );
        if (fs.existsSync(podfilePath)) {
          const original = fs.readFileSync(podfilePath, "utf8");
          const updated = ensurePodBlock(original, props.providers ?? []);
          if (updated !== original) {
            fs.writeFileSync(podfilePath, updated, "utf8");
          }
        }
        return cfg;
      },
    ]);
  }

  return config;
};

function ensurePodBlock(
  podfile: string,
  providers: LivenessProviderName[]
): string {
  // Strip any previously-managed block so the marker stays in sync
  // with the current `providers` list.
  const startRe = new RegExp(`${POD_BLOCK_MARKER}.*?${POD_BLOCK_MARKER}-end`, "s");
  const cleaned = podfile.replace(startRe, "").trimEnd();

  const pods = providers.flatMap((p) => PROVIDER_PODS[p] ?? []);
  if (pods.length === 0) {
    return cleaned + "\n";
  }

  const block = [
    POD_BLOCK_MARKER,
    ...pods.map((p) => `  pod '${p}'`),
    `${POD_BLOCK_MARKER}-end`,
  ].join("\n");

  // Inject at the end of the first `target ... do ... end` block.
  // Keeps the umbrella scope unchanged.
  const targetRe = /^(target\s+'[^']+'\s+do\s*\n[\s\S]*?)^end$/m;
  if (targetRe.test(cleaned)) {
    return cleaned.replace(
      targetRe,
      (_match, inner) => `${inner}${block}\nend`
    ) + "\n";
  }
  return cleaned + "\n" + block + "\n";
}
