/**
 * @file Android config-plugin step.
 *
 * Two things land in the consumer's project here:
 *
 *   1. `android.permission.CAMERA` in AndroidManifest.xml (always).
 *   2. Provider SDK Gradle dependencies in app/build.gradle (when
 *      listed under `providers`):
 *        - "rekognition" → com.amplifyframework.ui:liveness:1.x.x
 *        - "iproov"      → com.iproov.sdk:iproov:9.x.x
 *
 *   We modify the consumer's app build.gradle rather than declaring
 *   these in our own build.gradle so consumers who don't use a
 *   provider don't pay its build-graph cost.
 */

import {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  type ConfigPlugin,
} from "@expo/config-plugins";

import type {
  ExpoPasskeyLivenessPluginProps,
  LivenessProviderName,
} from "./index";

const CAMERA_PERMISSION = "android.permission.CAMERA";
const GRADLE_BLOCK_MARKER = "// expo-passkey-liveness:providers";

const PROVIDER_GRADLE_DEPS: Record<LivenessProviderName, string[]> = {
  rekognition: [
    "implementation 'com.amplifyframework.ui:liveness:1.5.0'",
  ],
  iproov: [
    "implementation 'com.iproov.sdk:iproov:9.5.0'",
  ],
};

export const withLivenessAndroid: ConfigPlugin<ExpoPasskeyLivenessPluginProps> = (
  config,
  props
) => {
  config = withAndroidManifest(config, (cfg) => {
    cfg.modResults = ensureCameraPermission(cfg.modResults);
    cfg.modResults = ensureLivenessActivities(cfg.modResults, props.providers ?? []);
    return cfg;
  });

  if ((props.providers ?? []).length > 0) {
    config = withAppBuildGradle(config, (cfg) => {
      cfg.modResults.contents = ensureGradleBlock(
        cfg.modResults.contents,
        props.providers ?? []
      );
      return cfg;
    });
  }

  return config;
};

function ensureCameraPermission(
  manifest: AndroidConfig.Manifest.AndroidManifest
): AndroidConfig.Manifest.AndroidManifest {
  const manifestRoot = manifest.manifest;
  manifestRoot["uses-permission"] = manifestRoot["uses-permission"] ?? [];
  const already = manifestRoot["uses-permission"].some(
    (p) => p.$["android:name"] === CAMERA_PERMISSION
  );
  if (!already) {
    manifestRoot["uses-permission"].push({
      $: { "android:name": CAMERA_PERMISSION },
    });
  }
  return manifest;
}

function ensureLivenessActivities(
  manifest: AndroidConfig.Manifest.AndroidManifest,
  providers: LivenessProviderName[]
): AndroidConfig.Manifest.AndroidManifest {
  if (!providers.includes("rekognition")) {
    return manifest;
  }
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  application.activity = application.activity ?? [];
  const name = "expo.modules.passkeyliveness.adapters.RekognitionLivenessActivity";
  const already = application.activity.some(
    (a) => a.$["android:name"] === name
  );
  if (!already) {
    application.activity.push({
      $: {
        "android:name": name,
        "android:exported": "false",
        "android:theme": "@android:style/Theme.Translucent.NoTitleBar",
      },
    });
  }
  return manifest;
}

function ensureGradleBlock(
  source: string,
  providers: LivenessProviderName[]
): string {
  const startRe = new RegExp(
    `${escapeRegex(GRADLE_BLOCK_MARKER)}[\\s\\S]*?${escapeRegex(GRADLE_BLOCK_MARKER)}-end`
  );
  const cleaned = source.replace(startRe, "").trimEnd();

  const deps = providers.flatMap((p) => PROVIDER_GRADLE_DEPS[p] ?? []);
  if (deps.length === 0) {
    return cleaned + "\n";
  }

  const block = [
    GRADLE_BLOCK_MARKER,
    "dependencies {",
    ...deps.map((d) => `    ${d}`),
    "}",
    `${GRADLE_BLOCK_MARKER}-end`,
  ].join("\n");

  return cleaned + "\n\n" + block + "\n";
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
