# Expo Passkey Liveness

<p align="center">
  <img src="https://img.shields.io/badge/Platform-iOS%20%7C%20Android%20%7C%20Web-blue" alt="Platform iOS | Android | Web" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License" />
  <img src="https://img.shields.io/badge/TypeScript-Ready-blue" alt="TypeScript Ready" />
  <img src="https://img.shields.io/badge/Status-ALPHA-orange" alt="Alpha Status" />
</p>

Optional liveness-detection extension for
[`expo-passkey`](https://github.com/iosazee/expo-passkey). Adds face
**presentation-attack-detection (PAD)** gating to passkey
registration, authentication, and recovery flows so a stolen device
unlock or a deepfake-injection attack cannot complete a sensitive
WebAuthn ceremony on its own.

> **🧪 v0.1.0-alpha**: API surface is stable but the package is in
> alpha while we shake out provider integrations on real devices.
> Pin exactly until 0.1.0 final.

## 📋 Table of Contents

- [Overview](#overview)
- [Why face liveness](#why-face-liveness)
- [Integration modes](#integration-modes)
- [Installation](#installation)
- [Server setup](#server-setup)
- [Client usage](#client-usage)
  - [Mode 1: Standalone](#mode-1-standalone)
  - [Mode 2: Composed](#mode-2-composed)
  - [Mode 3: Server-enforced](#mode-3-server-enforced)
- [Providers](#providers)
- [Cross-modality UX](#cross-modality-ux)
- [Database schema](#database-schema)
- [Replay protection](#replay-protection)
- [Token claims](#token-claims)
- [Example app](#example-app)
- [Roadmap](#roadmap)
- [License](#license)

## Overview

`expo-passkey-liveness` is a **sibling** Better Auth plugin that
composes alongside `expo-passkey` in the same `betterAuth()` call. It
adds:

- Two endpoints — `/expo-passkey/liveness/session` and
  `/expo-passkey/liveness/verify` — that drive a provider-backed
  liveness ceremony and mint a short-lived signed token.
- A `hooks.before` enforcement layer that validates the token on
  `expo-passkey`'s register and authenticate calls and writes an
  audit slice into `passkey.metadata.liveness`.
- Cross-platform clients (native + web) that orchestrate the camera
  ceremony and pass the token through to `expo-passkey`'s existing
  client methods.

The two packages remain decoupled: `expo-passkey` consumers who don't
install this extension are unaffected.

## Why face liveness

A passkey assertion proves *someone with the unlocked device and the
right biometric completed the WebAuthn ceremony*. It does not prove
*who* that someone was — and on Android-fingerprint devices, that
gap is the largest. Adding a vendor-attested face PAD step:

- Binds the credential to a specific human face (anti-coercion,
  anti-account-takeover)
- Resists deepfake injection that the device secure enclave does not
  see
- Provides an auditable score / passLevel claim on every privileged
  operation

See [`docs/modality.md`](./docs/modality.md) for the longer argument,
including why the Android-fingerprint cohort benefits the most despite
seeing the most UX friction.

## Integration modes

The library supports three orthogonal integration shapes — pick the
one that matches your trust model.

| Mode | Server config | Token validation | Use when |
|---|---|---|---|
| **1. Standalone** | Plugin loaded, `required: "none"` | You call `verifyLivenessToken` yourself | Gating non-passkey flows (KYC, account deletion, high-value transfers) |
| **2. Composed** | Plugin loaded, `required: "none"` | Client passes `livenessToken`; `expo-passkey` accepts it; app code decides when to gate | Most apps — your code holds the policy |
| **3. Server-enforced** | `required: "register" \| "authenticate" \| "both"` | Hook validates before `expo-passkey` handler runs; fails closed | Strict environments where the server must enforce regardless of client |

Worked examples for each: [`docs/usage.md`](./docs/usage.md).

## Installation

```bash
# Install both libraries — they ship as a pair
npm install expo-passkey expo-passkey-liveness@next

# Recommended peer deps depending on which provider you use:
npm install @aws-sdk/client-rekognition   # for rekognitionProvider
npm install @iproov/react-native           # for iproovProvider
```

This is an **Expo module** — for bare React Native projects you must
be using Expo Modules and run `expo prebuild` after install. The
`app.plugin.js` shipped in this package adds the camera permission
string and the conditional native SDK linking.

### iOS

Adds `NSCameraUsageDescription` automatically via the config plugin.

### Android

The config plugin adds `<uses-permission
android:name="android.permission.CAMERA" />` and skips the
provider-specific native SDK link unless that provider is configured.

## Server setup

Wire the plugin alongside `expoPasskey` in a single `betterAuth()`
call. The two are designed to compose.

```ts
// lib/auth.ts
import { betterAuth } from "better-auth";
import { expoPasskey } from "expo-passkey/server";
import {
  expoPasskeyLiveness,
  rekognitionProvider,
  redisReplayStore,
} from "expo-passkey-liveness/server";

export const auth = betterAuth({
  // ...your database, secret, baseURL
  plugins: [
    expoPasskey({
      rpName: "My App",
      rpId: "my-app.com",
      origin: ["https://my-app.com"],
    }),
    expoPasskeyLiveness({
      rpId: "my-app.com",
      liveness: {
        required: "both",                              // server-enforced mode
        provider: rekognitionProvider({ region: "us-east-1" }),
        minScore: 90,
        replayStore: redisReplayStore(redis),
        modalityMismatch: { showExplainer: true },
      },
    }),
  ],
});
```

This exposes two new endpoints on the Better Auth handler:

- `POST /expo-passkey/liveness/session` — opens a provider session
- `POST /expo-passkey/liveness/verify` — submits results and mints a
  signed `livenessToken`

And — when `required` is `register`, `authenticate`, or `both` —
registers a `hooks.before` that validates the token on the matching
`expo-passkey` endpoints.

## Client usage

### Mode 1: Standalone

Gate any operation that returns a token your server validates with
`verifyLivenessToken`.

```ts
import { verifyLiveness } from "expo-passkey-liveness/native";

const result = await verifyLiveness(
  { challenge: "step-up" },
  { fetcher }
);
if (result.error) return showError(result.error.message);

await fetch("/api/account/begin-recovery", {
  method: "POST",
  body: JSON.stringify({ livenessToken: result.data.livenessToken }),
});
```

### Mode 2: Composed

Run the liveness ceremony, then pass the token to `expo-passkey`'s
existing methods. App code holds the policy.

```ts
import { verifyLiveness } from "expo-passkey-liveness/native";
import { authClient } from "./auth-client";

const liveness = await verifyLiveness({ challenge: "authentication" }, { fetcher });
if (liveness.error) return { error: liveness.error };

return authClient.authenticateWithPasskey({
  livenessToken: liveness.data.livenessToken,
});
```

### Mode 3: Server-enforced

Use the wrappers — one call orchestrates liveness + passkey and
fails closed if the server hook rejects the token.

```ts
import {
  registerPasskeyWithLiveness,
  authenticateWithPasskeyAndLiveness,
} from "expo-passkey-liveness/native";

await registerPasskeyWithLiveness(
  { userName: "alice", displayName: "Alice" },
  { fetcher, registerPasskey: authClient.registerPasskey }
);

await authenticateWithPasskeyAndLiveness(
  {},
  { fetcher, authenticateWithPasskey: authClient.authenticateWithPasskey }
);
```

Web equivalents (`expo-passkey-liveness/web`) export the same symbols
for browser flows that use platform authenticators.

## Providers

A provider abstracts the PAD vendor. Three built-in factories plus an
identity adapter for self-hosted models.

### `rekognitionProvider` — AWS Rekognition Face Liveness (iBeta PAD L1)

```ts
import { rekognitionProvider } from "expo-passkey-liveness/server";

rekognitionProvider({
  region: "us-east-1",
  // Optional — defaults to the AWS SDK provider chain
  credentials: { accessKeyId, secretAccessKey },
  // Optional — write reference frames to your bucket for audit
  auditImagesBucket: "my-app-liveness-audit",
});
```

Peer dep: `@aws-sdk/client-rekognition` (dynamic import — only loaded
if you construct the provider).

### `iproovProvider` — iProov (FIDO Face Verification certified, PAD L2)

```ts
import { iproovProvider } from "expo-passkey-liveness/server";

iproovProvider({
  apiKey: process.env.IPROOV_API_KEY!,
  secret: process.env.IPROOV_SECRET!,
  baseUrl: "https://eu.rp.secure.iproov.me/api/v2",
});
```

Peer dep: `@iproov/react-native` on the client side.

### `customProvider` — your own model

```ts
import { customProvider } from "expo-passkey-liveness/server";

const provider = customProvider({
  name: "my-tee-verifier",
  padLevel: "L2",
  minScoreDefault: 95,
  async createSession({ challenge }) {
    /* talk to your service, return { sessionId, clientBootstrap } */
  },
  async getResults({ sessionId }) {
    /* return { score, passed, meta } */
  },
});
```

Use the custom adapter to wire in self-hosted PAD models, TEE
verifiers, or on-prem deployments.

See [`docs/providers.md`](./docs/providers.md) for the full reference.

## Cross-modality UX

When the user just authenticated with **fingerprint** (or another
non-face modality) and the library is about to launch a camera, it
shows an explainer screen first.

```ts
expoPasskeyLiveness({
  liveness: {
    modalityMismatch: {
      showExplainer: true,                  // default: true
      explainerStrings: {
        fingerprint: {
          title: "Quick face check",
          body:  "You just signed in with your fingerprint. To finish, …",
        },
      },
    },
  },
});
```

The detected modality propagates through the entire flow — into the
session row, the signed token's `rgm` claim, and the
`passkey.metadata.liveness` audit slice — so you can analyse PAD
behaviour per modality. Full details in
[`docs/modality.md`](./docs/modality.md).

## Database schema

Adds one table — `passkeyLivenessSession` — and writes an audit
slice into the existing `passkey.metadata.liveness` field on each
gated operation. No changes to `expo-passkey`'s schema.

```ts
// Custom table name
expoPasskeyLiveness({
  schema: {
    passkeyLivenessSession: { modelName: "liveness_session" },
  },
});
```

## Replay protection

Each minted token is bound to a `jti` that is recorded in a replay
store on first use and rejected on reuse.

```ts
import { redisReplayStore, inMemoryReplayStore } from "expo-passkey-liveness/server";

// Production
replayStore: redisReplayStore(redis),

// Tests / single-process demos only
replayStore: inMemoryReplayStore({ cleanupIntervalMs: 60_000 }),
```

The `RedisLike` interface is library-agnostic — `ioredis`, `node-redis`,
Upstash, anything that exposes `SET key value NX EX`.

## Token claims

The signed `livenessToken` is an HS256 JWS with the standard claims
plus:

| Claim | Purpose |
|---|---|
| `sub` | Better Auth user ID |
| `aud` | `rpId` |
| `jti` | Replay binding |
| `op`  | `register` / `authenticate` / `step-up` |
| `chl` | Operation-specific challenge |
| `prv` | Provider name |
| `scr` | PAD score |
| `pad` | Provider's iBeta PAD level |
| `rgm` | Registered modality (`face` / `fingerprint` / `unknown`) |
| `exp` | Default TTL is 5 minutes |

Use `verifyLivenessToken` from `expo-passkey-liveness/server` for
standalone validation.

## Example app

A full Next.js + Expo monorepo demo lives at
[`epk-example-app`](https://github.com/iosazee/epk-example-app):

- **Web** (`apps/web`) — Next.js + Better Auth backend that wires
  both plugins, plus a `/test` page for the WebAuthn flow
- **Mobile** (`apps/mobile`) — Expo SDK 55 app that runs the native
  liveness ceremony against the same backend

The web flow uses an auto-passing `customProvider` so you can see
the full server pipeline without AWS / iProov credentials; the mobile
app exercises the real camera ceremony.

## Roadmap

- ✅ Phase 0–5 — types, server, hook, native module, config plugin
- ✅ Phase 6 — iProov adapter validates the abstraction
- 🚧 Phase 7 — physical-device QA matrix, docs polish, 0.1.0 final
- 🔜 Hardware-key attestation in the audit slice
- 🔜 Optional `voice` modality for accessibility paths

Track progress in [`docs/PLAN.md`](./docs/PLAN.md).

## License

MIT
