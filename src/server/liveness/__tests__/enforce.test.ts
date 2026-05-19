import { ERROR_CODES } from "../../../types/errors";
import type {
  LivenessConfig,
  LivenessProvider,
  RegisteredModality,
} from "../../../types/liveness";
import type { ExpoPasskeyLivenessOptions } from "../../../types/server";
import {
  effectiveMinScore,
  enforceLiveness,
  operationIsGated,
  requiresLiveness,
} from "../enforce";
import { inMemoryReplayStore } from "../replay-store";
import { signLivenessToken } from "../token";

class APIErrorLike extends Error {
  body: { code: string; message: string };
  status: string;
  constructor(status: string, body: { code: string; message: string }) {
    super(body.message);
    this.name = "APIError";
    this.status = status;
    this.body = body;
  }
}

const SECRET = "test-secret";

function makeProvider(): LivenessProvider {
  return {
    name: "fake",
    padLevel: "L2",
    minScoreDefault: 80,
    async createSession() {
      return { sessionId: "s", clientBootstrap: {} };
    },
    async getResults() {
      return { score: 90, passed: true };
    },
  };
}

function makeOptions(
  livenessOverrides: Partial<LivenessConfig> = {}
): ExpoPasskeyLivenessOptions {
  return {
    rpId: "example.com",
    liveness: {
      required: "both",
      provider: makeProvider(),
      minScore: 90,
      ...livenessOverrides,
    },
  };
}

async function makeToken(
  overrides: Partial<Parameters<typeof signLivenessToken>[0]> = {}
) {
  const signed = await signLivenessToken({
    signingKey: SECRET,
    audience: "example.com",
    challenge: "registration",
    sessionId: "sess",
    provider: "fake",
    score: 95,
    userId: "u-1",
    padLevel: "L2",
    registeredModality: "face",
    ...overrides,
  });
  return signed;
}

function makeCtx(
  overrides: { path?: string; body?: Record<string, unknown>; sessionUserId?: string } = {}
) {
  return {
    path: overrides.path ?? "/expo-passkey/register",
    body: overrides.body ?? {},
    context: {
      session: overrides.sessionUserId
        ? { user: { id: overrides.sessionUserId } }
        : null,
    },
  };
}

describe("requiresLiveness", () => {
  test("matches register path when required = registration or both", () => {
    expect(
      requiresLiveness(
        { path: "/expo-passkey/register" },
        { required: "registration", provider: makeProvider() }
      )
    ).toBe(true);
    expect(
      requiresLiveness(
        { path: "/expo-passkey/register" },
        { required: "both", provider: makeProvider() }
      )
    ).toBe(true);
  });

  test("does not match register path when required = authentication only", () => {
    expect(
      requiresLiveness(
        { path: "/expo-passkey/register" },
        { required: "authentication", provider: makeProvider() }
      )
    ).toBe(false);
  });

  test("does not match unrelated paths", () => {
    expect(
      requiresLiveness(
        { path: "/expo-passkey/challenge" },
        { required: "both", provider: makeProvider() }
      )
    ).toBe(false);
  });
});

describe("operationIsGated", () => {
  test.each<["registration" | "authentication", "both" | "registration" | "authentication", boolean]>([
    ["registration", "both", true],
    ["authentication", "both", true],
    ["registration", "registration", true],
    ["authentication", "registration", false],
    ["registration", "authentication", false],
    ["authentication", "authentication", true],
  ])("op=%s with required=%s -> %s", (op, required, expected) => {
    expect(
      operationIsGated({ required, provider: makeProvider() }, op)
    ).toBe(expected);
  });
});

describe("effectiveMinScore", () => {
  const liveness: LivenessConfig = {
    required: "both",
    provider: makeProvider(),
    minScore: 90,
    overrides: { registration: { minScore: 95 } },
    modalityMismatch: { fingerprintScoreDelta: 5 },
  };

  test("uses per-operation override", () => {
    expect(effectiveMinScore(liveness, "registration", "face")).toBe(95);
    expect(effectiveMinScore(liveness, "authentication", "face")).toBe(90);
  });

  test("applies fingerprint delta only for fingerprint modality", () => {
    expect(effectiveMinScore(liveness, "authentication", "fingerprint")).toBe(85);
    expect(effectiveMinScore(liveness, "authentication", "face")).toBe(90);
  });

  test("caps delta at 15", () => {
    const huge = {
      ...liveness,
      modalityMismatch: { fingerprintScoreDelta: 50 },
    };
    expect(effectiveMinScore(huge, "authentication", "fingerprint")).toBe(75);
  });
});

describe("enforceLiveness", () => {
  test("happy path: validates token and injects metadata slice", async () => {
    const signed = await makeToken();
    const ctx = makeCtx({
      body: { livenessToken: signed.token },
      sessionUserId: "u-1",
    });

    await enforceLiveness(ctx, {
      options: makeOptions(),
      APIError: APIErrorLike,
      resolveSigningKey: () => SECRET,
    });

    expect(ctx.body.metadata).toMatchObject({
      liveness: {
        provider: "fake",
        score: 95,
        sessionId: "sess",
        padLevel: "L2",
        registeredModality: "face",
        verifiedAt: expect.any(String),
      },
    });
  });

  test("rejects when token is missing", async () => {
    const ctx = makeCtx({ body: {} });
    await expect(
      enforceLiveness(ctx, {
        options: makeOptions(),
        APIError: APIErrorLike,
        resolveSigningKey: () => SECRET,
      })
    ).rejects.toMatchObject({
      body: { code: ERROR_CODES.LIVENESS.TOKEN_REQUIRED },
    });
  });

  test("rejects with TOKEN_USER_MISMATCH when uid != session user", async () => {
    const signed = await makeToken({ userId: "u-other" });
    const ctx = makeCtx({
      body: { livenessToken: signed.token },
      sessionUserId: "u-1",
    });

    await expect(
      enforceLiveness(ctx, {
        options: makeOptions(),
        APIError: APIErrorLike,
        resolveSigningKey: () => SECRET,
      })
    ).rejects.toMatchObject({
      body: { code: ERROR_CODES.LIVENESS.TOKEN_USER_MISMATCH },
    });
  });

  test("rejects with TOKEN_CHALLENGE_MISMATCH when path != token challenge", async () => {
    const signed = await makeToken({ challenge: "authentication" });
    const ctx = makeCtx({
      path: "/expo-passkey/register",
      body: { livenessToken: signed.token },
      sessionUserId: "u-1",
    });

    await expect(
      enforceLiveness(ctx, {
        options: makeOptions(),
        APIError: APIErrorLike,
        resolveSigningKey: () => SECRET,
      })
    ).rejects.toMatchObject({
      body: { code: ERROR_CODES.LIVENESS.TOKEN_CHALLENGE_MISMATCH },
    });
  });

  test("rejects below-threshold token with PAD_BELOW_THRESHOLD", async () => {
    const signed = await makeToken({
      score: 80,
      registeredModality: "face",
    });
    const ctx = makeCtx({
      body: { livenessToken: signed.token },
      sessionUserId: "u-1",
    });

    await expect(
      enforceLiveness(ctx, {
        options: makeOptions({ minScore: 90 }),
        APIError: APIErrorLike,
        resolveSigningKey: () => SECRET,
      })
    ).rejects.toMatchObject({
      body: { code: ERROR_CODES.LIVENESS.PAD_BELOW_THRESHOLD },
    });
  });

  test("modality delta accepts a token that would fail at base threshold for fingerprint users", async () => {
    const signed = await makeToken({
      score: 87,
      registeredModality: "fingerprint",
    });
    const ctx = makeCtx({
      body: { livenessToken: signed.token },
      sessionUserId: "u-1",
    });

    await expect(
      enforceLiveness(ctx, {
        options: makeOptions({
          minScore: 90,
          modalityMismatch: { fingerprintScoreDelta: 5 },
        }),
        APIError: APIErrorLike,
        resolveSigningKey: () => SECRET,
      })
    ).resolves.not.toThrow();

    expect(ctx.body.metadata).toMatchObject({
      liveness: expect.objectContaining({ registeredModality: "fingerprint" }),
    });
  });

  test("same configuration rejects when modality is face", async () => {
    const signed = await makeToken({
      score: 87,
      registeredModality: "face",
    });
    const ctx = makeCtx({
      body: { livenessToken: signed.token },
      sessionUserId: "u-1",
    });

    await expect(
      enforceLiveness(ctx, {
        options: makeOptions({
          minScore: 90,
          modalityMismatch: { fingerprintScoreDelta: 5 },
        }),
        APIError: APIErrorLike,
        resolveSigningKey: () => SECRET,
      })
    ).rejects.toMatchObject({
      body: { code: ERROR_CODES.LIVENESS.PAD_BELOW_THRESHOLD },
    });
  });

  test("rejects replayed token via replay store", async () => {
    const store = inMemoryReplayStore({ cleanupIntervalMs: 0 });
    try {
      const signed = await makeToken();
      const first = makeCtx({
        body: { livenessToken: signed.token },
        sessionUserId: "u-1",
      });
      const second = makeCtx({
        body: { livenessToken: signed.token },
        sessionUserId: "u-1",
      });

      const options = makeOptions({ replayStore: store });

      await enforceLiveness(first, {
        options,
        APIError: APIErrorLike,
        resolveSigningKey: () => SECRET,
      });

      await expect(
        enforceLiveness(second, {
          options,
          APIError: APIErrorLike,
          resolveSigningKey: () => SECRET,
        })
      ).rejects.toMatchObject({
        body: { code: ERROR_CODES.LIVENESS.TOKEN_REPLAYED },
      });
    } finally {
      store.dispose();
    }
  });

  test("preserves existing metadata fields when injecting the liveness slice", async () => {
    const signed = await makeToken();
    const ctx = makeCtx({
      body: {
        livenessToken: signed.token,
        metadata: { deviceModel: "iPhone 15 Pro", appVersion: "1.2.3" },
      },
      sessionUserId: "u-1",
    });

    await enforceLiveness(ctx, {
      options: makeOptions(),
      APIError: APIErrorLike,
      resolveSigningKey: () => SECRET,
    });

    expect(ctx.body.metadata).toMatchObject({
      deviceModel: "iPhone 15 Pro",
      appVersion: "1.2.3",
      liveness: expect.objectContaining({ provider: "fake" }),
    });
  });

  test("no-op when path is not a known operation", async () => {
    const ctx = makeCtx({ path: "/expo-passkey/challenge", body: {} });
    await expect(
      enforceLiveness(ctx, {
        options: makeOptions(),
        APIError: APIErrorLike,
        resolveSigningKey: () => SECRET,
      })
    ).resolves.not.toThrow();
    expect(ctx.body.metadata).toBeUndefined();
  });
});

// Reference the type once so eslint doesn't flag the import.
void (null as RegisteredModality | null);
