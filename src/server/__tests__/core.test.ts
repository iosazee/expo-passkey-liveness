import { expoPasskeyLiveness, clearCleanupIntervals } from "../core";
import type { LivenessProvider } from "../../types/liveness";

afterEach(() => clearCleanupIntervals());

function makeProvider(): LivenessProvider {
  return {
    name: "fake",
    minScoreDefault: 80,
    async createSession() {
      return { sessionId: "s", clientBootstrap: {} };
    },
    async getResults() {
      return { score: 90, passed: true };
    },
  };
}

describe("expoPasskeyLiveness", () => {
  test("returns a plugin with id, schema, and endpoints", () => {
    const plugin = expoPasskeyLiveness({
      rpId: "example.com",
      liveness: { required: "both", provider: makeProvider() },
    });

    expect(plugin.id).toBe("expo-passkey-liveness");
    expect(plugin.schema?.passkeyLivenessSession).toBeDefined();
    expect(plugin.endpoints?.createLivenessSession).toBeDefined();
    expect(plugin.endpoints?.verifyLivenessSession).toBeDefined();
  });

  test("schema declares passkeyLivenessSession with the spec fields", () => {
    const plugin = expoPasskeyLiveness({
      rpId: "example.com",
      liveness: { required: "both", provider: makeProvider() },
    });

    const schema = plugin.schema ?? {};
    const model = schema.passkeyLivenessSession;
    expect(model).toBeDefined();
    const fields = (model?.fields ?? {}) as Record<
      string,
      { type: string; required?: boolean }
    >;
    for (const f of [
      "userId",
      "provider",
      "providerSessionId",
      "challenge",
      "status",
      "createdAt",
      "expiresAt",
    ]) {
      expect(fields[f]?.required).toBe(true);
    }
    expect(fields.score?.required).toBeFalsy();
    expect(fields.registeredModality?.required).toBeFalsy();
    expect(fields.consumedAt?.required).toBeFalsy();
  });

  test("respects schema.passkeyLivenessSession.modelName override", () => {
    const plugin = expoPasskeyLiveness({
      rpId: "example.com",
      liveness: { required: "both", provider: makeProvider() },
      schema: { passkeyLivenessSession: { modelName: "custom_liveness_session" } },
    });
    expect(plugin.schema?.custom_liveness_session).toBeDefined();
    expect(plugin.schema?.passkeyLivenessSession).toBeUndefined();
  });

  test("throws when rpId is missing", () => {
    expect(() =>
      expoPasskeyLiveness({
        // @ts-expect-error required
        rpId: undefined,
        liveness: { required: "both", provider: makeProvider() },
      })
    ).toThrow(/rpId is required/);
  });

  test("throws when liveness.required is invalid", () => {
    expect(() =>
      expoPasskeyLiveness({
        rpId: "example.com",
        liveness: {
          // @ts-expect-error invalid
          required: "always",
          provider: makeProvider(),
        },
      })
    ).toThrow(/liveness.required must be one of/);
  });

  test("rejects fingerprintScoreDelta above 15 at init", () => {
    expect(() =>
      expoPasskeyLiveness({
        rpId: "example.com",
        liveness: {
          required: "both",
          provider: makeProvider(),
          modalityMismatch: { fingerprintScoreDelta: 20 },
        },
      })
    ).toThrow(/must be between 0 and 15/);
  });

  test("warns once when fingerprintScoreDelta > 5", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expoPasskeyLiveness({
        rpId: "example.com",
        liveness: {
          required: "both",
          provider: makeProvider(),
          modalityMismatch: { fingerprintScoreDelta: 10 },
        },
        logger: { enabled: true, level: "warn" },
      });
      expect(warn).toHaveBeenCalledWith(
        "[ExpoPasskeyLiveness]",
        expect.stringMatching(/fingerprintScoreDelta=10/)
      );
    } finally {
      warn.mockRestore();
    }
  });

  test("does not warn when fingerprintScoreDelta <= 5", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expoPasskeyLiveness({
        rpId: "example.com",
        liveness: {
          required: "both",
          provider: makeProvider(),
          modalityMismatch: { fingerprintScoreDelta: 5 },
        },
        logger: { enabled: true, level: "warn" },
      });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
