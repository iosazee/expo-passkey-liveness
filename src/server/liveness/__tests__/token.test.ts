import {
  signLivenessToken,
  verifyLivenessToken,
} from "../token";
import { inMemoryReplayStore } from "../replay-store";
import { ERROR_CODES } from "../../../types/errors";

const SECRET = "test-secret-do-not-use-in-production";
const AUDIENCE = "example.com";

function baseInput(overrides: Partial<Parameters<typeof signLivenessToken>[0]> = {}) {
  return {
    signingKey: SECRET,
    audience: AUDIENCE,
    challenge: "registration" as const,
    sessionId: "sess_abc123",
    provider: "rekognition",
    score: 95,
    userId: "user_xyz",
    padLevel: "L2" as const,
    registeredModality: "fingerprint" as const,
    ...overrides,
  };
}

describe("liveness token", () => {
  test("round-trips a valid token and exposes claims", async () => {
    const signed = await signLivenessToken(baseInput());

    const result = await verifyLivenessToken({
      token: signed.token,
      signingKey: SECRET,
      expectedAudience: AUDIENCE,
      expectedChallenge: "registration",
      minScore: 90,
      expectedUserId: "user_xyz",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {return;}
    expect(result.payload.aud).toBe(AUDIENCE);
    expect(result.payload.chl).toBe("registration");
    expect(result.payload.scr).toBe(95);
    expect(result.payload.uid).toBe("user_xyz");
    expect(result.payload.prv).toBe("rekognition");
    expect(result.payload.pad).toBe("L2");
    expect(result.payload.rgm).toBe("fingerprint");
    expect(result.payload.iss).toBe("expo-passkey-liveness");
    expect(result.payload.jti).toBeTruthy();
  });

  test("rejects a tampered signature", async () => {
    const signed = await signLivenessToken(baseInput());

    const result = await verifyLivenessToken({
      token: signed.token,
      signingKey: "different-secret",
      expectedAudience: AUDIENCE,
      expectedChallenge: "registration",
      minScore: 90,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {return;}
    expect(result.code).toBe(ERROR_CODES.LIVENESS.TOKEN_INVALID);
  });

  test("rejects an expired token", async () => {
    const past = Math.floor(Date.now() / 1000) - 1000;
    const signed = await signLivenessToken(
      baseInput({ nowSeconds: past, maxAgeSeconds: 60 })
    );

    const result = await verifyLivenessToken({
      token: signed.token,
      signingKey: SECRET,
      expectedAudience: AUDIENCE,
      expectedChallenge: "registration",
      minScore: 90,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {return;}
    expect(result.code).toBe(ERROR_CODES.LIVENESS.TOKEN_EXPIRED);
  });

  test("rejects an audience mismatch", async () => {
    const signed = await signLivenessToken(baseInput());

    const result = await verifyLivenessToken({
      token: signed.token,
      signingKey: SECRET,
      expectedAudience: "different.com",
      expectedChallenge: "registration",
      minScore: 90,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {return;}
    expect(result.code).toBe(ERROR_CODES.LIVENESS.TOKEN_AUDIENCE_MISMATCH);
  });

  test("rejects a challenge mismatch", async () => {
    const signed = await signLivenessToken(baseInput({ challenge: "registration" }));

    const result = await verifyLivenessToken({
      token: signed.token,
      signingKey: SECRET,
      expectedAudience: AUDIENCE,
      expectedChallenge: "authentication",
      minScore: 90,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {return;}
    expect(result.code).toBe(ERROR_CODES.LIVENESS.TOKEN_CHALLENGE_MISMATCH);
  });

  test("rejects when score is below the configured minimum", async () => {
    const signed = await signLivenessToken(baseInput({ score: 70 }));

    const result = await verifyLivenessToken({
      token: signed.token,
      signingKey: SECRET,
      expectedAudience: AUDIENCE,
      expectedChallenge: "registration",
      minScore: 90,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {return;}
    expect(result.code).toBe(ERROR_CODES.LIVENESS.PAD_BELOW_THRESHOLD);
  });

  test("rejects when uid does not match expectedUserId", async () => {
    const signed = await signLivenessToken(baseInput({ userId: "user_a" }));

    const result = await verifyLivenessToken({
      token: signed.token,
      signingKey: SECRET,
      expectedAudience: AUDIENCE,
      expectedChallenge: "registration",
      minScore: 90,
      expectedUserId: "user_b",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {return;}
    expect(result.code).toBe(ERROR_CODES.LIVENESS.TOKEN_USER_MISMATCH);
  });

  test("rejects a replayed jti when a replay store is configured", async () => {
    const store = inMemoryReplayStore({ cleanupIntervalMs: 0 });
    try {
      const signed = await signLivenessToken(baseInput());

      const first = await verifyLivenessToken({
        token: signed.token,
        signingKey: SECRET,
        expectedAudience: AUDIENCE,
        expectedChallenge: "registration",
        minScore: 90,
        replayStore: store,
      });
      expect(first.ok).toBe(true);

      const second = await verifyLivenessToken({
        token: signed.token,
        signingKey: SECRET,
        expectedAudience: AUDIENCE,
        expectedChallenge: "registration",
        minScore: 90,
        replayStore: store,
      });
      expect(second.ok).toBe(false);
      if (second.ok) {return;}
      expect(second.code).toBe(ERROR_CODES.LIVENESS.TOKEN_REPLAYED);
    } finally {
      store.dispose();
    }
  });

  test("rejects out-of-range score at sign time", async () => {
    await expect(signLivenessToken(baseInput({ score: 150 }))).rejects.toThrow(
      /score must be between 0 and 100/
    );
  });

  test("omits optional claims when not provided", async () => {
    const signed = await signLivenessToken({
      signingKey: SECRET,
      audience: AUDIENCE,
      challenge: "authentication",
      sessionId: "s",
      provider: "custom",
      score: 80,
    });

    const result = await verifyLivenessToken({
      token: signed.token,
      signingKey: SECRET,
      expectedAudience: AUDIENCE,
      expectedChallenge: "authentication",
      minScore: 50,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {return;}
    expect(result.payload.uid).toBeUndefined();
    expect(result.payload.pad).toBeUndefined();
    expect(result.payload.rgm).toBeUndefined();
  });
});
