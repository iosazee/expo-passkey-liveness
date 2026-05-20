# Changelog

All notable changes to this package are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0-alpha.2] - 2026-05-20

### Documentation

- Clarify alpha integration docs, valid liveness enforcement modes, web stub
  behavior, provider setup, and the current `epk-example-app` flow.

## [0.1.0-alpha.1] - 2026-05-19

### Fixed

- Exclude `**/__tests__/**` from the TypeScript build so test mocks
  (`better-call`, `better-auth-api`) no longer ship in the published
  npm tarball. Reduces the package from 172 → 164 files and removes
  test-only code from the consumer surface.

### Internal

- First publish via the tag-triggered GitHub Actions release workflow
  (OIDC `--provenance --access public`). 0.1.0-alpha.0 was published
  manually to bootstrap the package name on the npm registry.

## [Pre-history]

### Added

- Phase 0 scaffold: package.json, TS/Jest/ESLint/Prettier configs,
  Expo module manifest, iOS/Android native module stubs, src/
  entrypoints, type contracts (`LivenessProvider`, `LivenessConfig`,
  `LivenessReplayStore`, `LivenessTokenPayload`,
  `LivenessMetadataSlice`), and error-code namespace.
- ADR-0001 documenting the sibling-package architectural decision.
- Phase 1 — type contracts frozen and supporting helpers:
  - `signLivenessToken` / `verifyLivenessToken` (HS256 JWS via `jose`)
    with discriminated-result error reporting; covers signature,
    expiry, audience, challenge, score, user-binding, and replay
    failures.
  - `inMemoryReplayStore` (Map + periodic eviction with `unref`'d
    timer) and `redisReplayStore` (SET NX EX-based, library-agnostic
    `RedisLike` interface). Shared parameterised test suite.
  - `detectModalityFromMetadata` / `normalizeBiometricType` mapping
    expo-local-authentication `AuthenticationType` values plus
    free-form aliases to the `RegisteredModality` union.
  - `rekognitionProvider` (AWS Rekognition Face Liveness, optional
    peer-dep via dynamic import) and `customProvider` (identity
    adapter for self-hosted models).
  - 47 unit tests, type-check clean, lint clean.
- Phase 2 — server plugin, endpoints, and schema:
  - `expoPasskeyLiveness(options)` factory returning a `BetterAuthPlugin`.
    Validates options at init (rejects `fingerprintScoreDelta > 15`,
    warns when > 5), registers the schema, wires endpoints, and runs
    an hourly cleanup of expired `passkeyLivenessSession` rows.
  - `passkeyLivenessSession` table registered with Better Auth.
    Renamable via `schema.passkeyLivenessSession.modelName`.
  - `POST /expo-passkey/liveness/session` (createSessionEndpoint):
    session-gated for registration/step-up, optional session for
    authentication (accepts `userId` in body in that case). Calls
    `provider.createSession`, persists a pending row, returns
    `{ sessionId, provider, expiresAt, clientBootstrap }`. Surfaces
    provider failures as `LIVENESS_PROVIDER_ERROR`.
  - `POST /expo-passkey/liveness/verify` (verifySessionEndpoint):
    loads the pending row, calls `provider.getResults`, applies the
    effective minScore (with per-operation override), mints a token
    via `signLivenessToken`, marks the row `verified|failed|expired`,
    returns `{ livenessToken, expiresAt, score, provider, sessionId }`.
  - Test harness mocks `better-auth/api` and `better-call` (both
    ESM-only) so the CJS ts-jest transform works against the
    endpoint handlers directly.
  - 22 new tests covering happy paths, missing/expired/consumed rows,
    threshold mismatch, provider failures, schema shape, init
    validation, and the modality-delta warning. 69 tests total.
- Phase 3 — enforcement hook + modality-aware policy:
  - `enforceLiveness` / `requiresLiveness` / `effectiveMinScore` /
    `operationIsGated` exported from `expo-passkey-liveness/server`.
  - Plugin attaches `hooks.before` matchers for
    `/expo-passkey/register` and `/expo-passkey/authenticate` when
    `liveness.required` covers that op. Hook validates
    `ctx.body.livenessToken`, applies modality-aware threshold,
    enforces replay via `liveness.replayStore`, and mutates
    `ctx.body.metadata` to include the audit slice
    (`provider/score/sessionId/verifiedAt/padLevel/registeredModality`).
  - `verify-session` now applies the same modality-adjusted threshold
    so a token issued by verify always passes the hook unless the
    operator changed configuration between calls.
  - `fingerprintScoreDelta` is capped at 15; values above 5 emit a
    one-time init warning. Both behaviours covered by tests.
  - 22 new tests; 91 tests total.
  - **Upstream coordination**: this phase assumes `expo-passkey` will
    accept `livenessToken: z.string().optional()` on its register and
    authenticate request schemas. The hook reads from `ctx.body.livenessToken`.
    Without that upstream change, the field is silently stripped and
    the hook will report `TOKEN_REQUIRED`. See ADR-0001.
- Phase 4 — JS surface for `ExpoPasskeyLivenessModule`:
  - `getExpoPasskeyLivenessModule()` lazily resolves the native
    module; returns `null` on server/web. Cached.
  - `__setExpoPasskeyLivenessModule` / `__reset*` test seams.
  - iOS/Android module bodies still return `LIVENESS_NOT_SUPPORTED`;
    Rekognition adapter integration deferred until physical-device
    hardware is available.
- Phase 5 — client API, explainer UI, config plugin:
  - `verifyLiveness(options, deps)` — full ceremony with optional
    explainer presenter.
  - `registerPasskeyWithLiveness` / `authenticateWithPasskeyAndLiveness`
    DI wrappers (consumer supplies the expo-passkey action).
  - `detectClientModality` (expo-local-authentication-backed).
  - `ExplainerScreen` + `DEFAULT_EXPLAINER_STRINGS` + `resolveExplainerStrings`.
  - Web stub: same exports, all return `LIVENESS_NOT_SUPPORTED`.
  - Config plugin: adds NSCameraUsageDescription and android.permission.CAMERA.
    Provider SDK wiring stays consumer-owned.
  - 21 new tests; 112 tests total.

- Phase 6 — second provider (`iproovProvider`):
  - REST-based wrapping of iProov's Genuine Presence Assurance API.
  - Routes registration challenges to `/claim/enrol/token` and
    authentication challenges to `/claim/verify/token`;
    `forceMode` override available.
  - `getResults` maps the validate response's `passed`/`outcome`/
    `confidence` triple to the `ProviderResults` shape.
  - `__fetch` test seam so the provider is fully unit-testable
    without network. 7 new tests.
- Phase 7 — docs (in progress):
  - README rewritten with install, server config, client usage,
    and the modality-aware explainer pattern.
  - `docs/usage.md` — three integration modes with working snippets.
  - `docs/modality.md` — full cross-modality UX rationale and
    recommended consumer policy.
  - `docs/providers.md` — built-in provider comparison and the
    `customProvider` escape hatch.

## [0.1.0-alpha.0] — TBD

Initial pre-release scaffold. No runtime behaviour yet.
