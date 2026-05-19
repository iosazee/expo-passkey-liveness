import { ERROR_CODES } from "../../../types/errors";
import {
  __resetExpoPasskeyLivenessModule,
  __setExpoPasskeyLivenessModule,
} from "../../../ExpoPasskeyLivenessModule";
import {
  authenticateWithPasskeyAndLiveness,
  registerPasskeyWithLiveness,
  verifyLiveness,
  type LivenessFetcher,
  type VerifyLivenessDeps,
} from "../native";

afterEach(() => {
  __resetExpoPasskeyLivenessModule();
});

function fakeNativeModule(
  overrides: Partial<{
    isLivenessSupported: () => boolean;
    runLivenessCheck: (input: unknown) => Promise<string>;
  }> = {}
) {
  return {
    isLivenessSupported: overrides.isLivenessSupported ?? (() => true),
    runLivenessCheck:
      overrides.runLivenessCheck ?? (async () => '{"sessionId":"vendor-1"}'),
    cancel: jest.fn(async () => undefined),
  };
}

function fakeFetcher(impl: {
  session?: { data?: unknown; error?: { code: string; message?: string } };
  verify?: { data?: unknown; error?: { code: string; message?: string } };
}): LivenessFetcher & { calls: string[] } {
  const calls: string[] = [];
  const fetcher = async (path: string) => {
    calls.push(path);
    if (path === "/expo-passkey/liveness/session") {
      return {
        data: impl.session?.data ?? {
          sessionId: "row-1",
          provider: "fake",
          challenge: "registration",
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          clientBootstrap: { region: "us-east-1" },
        },
        error: impl.session?.error ?? null,
      };
    }
    if (path === "/expo-passkey/liveness/verify") {
      return {
        data: impl.verify?.data ?? {
          livenessToken: "tok",
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          score: 95,
          provider: "fake",
          sessionId: "row-1",
          challenge: "registration",
        },
        error: impl.verify?.error ?? null,
      };
    }
    throw new Error("unexpected path " + path);
  };
  const wrapped = fetcher as unknown as LivenessFetcher & { calls: string[] };
  wrapped.calls = calls;
  return wrapped;
}

const baseDeps = (extra: Partial<VerifyLivenessDeps> = {}): VerifyLivenessDeps => ({
  fetcher: fakeFetcher({}),
  ...extra,
});

describe("verifyLiveness", () => {
  test("happy path posts to /session, runs native, posts to /verify, returns token", async () => {
    __setExpoPasskeyLivenessModule(fakeNativeModule());
    const fetcher = fakeFetcher({});
    const result = await verifyLiveness(
      { challenge: "registration", registeredModalityHint: "face" },
      { fetcher }
    );
    expect(result.error).toBeNull();
    expect(result.data?.livenessToken).toBe("tok");
    expect(result.data?.registeredModality).toBe("face");
    expect(fetcher.calls).toEqual([
      "/expo-passkey/liveness/session",
      "/expo-passkey/liveness/verify",
    ]);
  });

  test("returns NOT_SUPPORTED when native module is absent", async () => {
    __setExpoPasskeyLivenessModule(null);
    const result = await verifyLiveness(
      { challenge: "registration", registeredModalityHint: "face" },
      baseDeps()
    );
    expect(result.error).toBeTruthy();
    expect((result.error as unknown as { code: string }).code).toBe(
      ERROR_CODES.LIVENESS.NOT_SUPPORTED
    );
  });

  test("returns NOT_SUPPORTED when isLivenessSupported is false", async () => {
    __setExpoPasskeyLivenessModule(
      fakeNativeModule({ isLivenessSupported: () => false })
    );
    const result = await verifyLiveness(
      { challenge: "registration", registeredModalityHint: "face" },
      baseDeps()
    );
    expect((result.error as unknown as { code: string }).code).toBe(
      ERROR_CODES.LIVENESS.NOT_SUPPORTED
    );
  });

  test("maps native cancel error to USER_CANCELED", async () => {
    __setExpoPasskeyLivenessModule(
      fakeNativeModule({
        runLivenessCheck: async () => {
          const e = new Error("cancelled") as Error & { code: string };
          e.code = "LIVENESS_USER_CANCELLED";
          throw e;
        },
      })
    );
    const result = await verifyLiveness(
      { challenge: "registration", registeredModalityHint: "face" },
      baseDeps()
    );
    expect((result.error as unknown as { code: string }).code).toBe(
      ERROR_CODES.LIVENESS.USER_CANCELED
    );
  });

  test("maps native permission error to CAMERA_PERMISSION_DENIED", async () => {
    __setExpoPasskeyLivenessModule(
      fakeNativeModule({
        runLivenessCheck: async () => {
          const e = new Error("perm") as Error & { code: string };
          e.code = "PERMISSION_DENIED";
          throw e;
        },
      })
    );
    const result = await verifyLiveness(
      { challenge: "registration", registeredModalityHint: "face" },
      baseDeps()
    );
    expect((result.error as unknown as { code: string }).code).toBe(
      ERROR_CODES.LIVENESS.CAMERA_PERMISSION_DENIED
    );
  });

  test("explainer cancel short-circuits with USER_CANCELED", async () => {
    __setExpoPasskeyLivenessModule(fakeNativeModule());
    const presenter = jest.fn(async () => false);
    const result = await verifyLiveness(
      {
        challenge: "registration",
        registeredModalityHint: "fingerprint",
      },
      { fetcher: fakeFetcher({}), presentExplainer: presenter }
    );
    expect(presenter).toHaveBeenCalledWith({
      modality: "fingerprint",
      strings: undefined,
    });
    expect((result.error as unknown as { code: string }).code).toBe(
      ERROR_CODES.LIVENESS.USER_CANCELED
    );
  });

  test("explainer is skipped when showExplainer=false", async () => {
    __setExpoPasskeyLivenessModule(fakeNativeModule());
    const presenter = jest.fn(async () => true);
    const result = await verifyLiveness(
      {
        challenge: "registration",
        registeredModalityHint: "fingerprint",
        showExplainer: false,
      },
      { fetcher: fakeFetcher({}), presentExplainer: presenter }
    );
    expect(presenter).not.toHaveBeenCalled();
    expect(result.error).toBeNull();
  });

  test("session error propagates with provider error code", async () => {
    __setExpoPasskeyLivenessModule(fakeNativeModule());
    const fetcher = fakeFetcher({
      session: {
        error: { code: "liveness_provider_error", message: "vendor 500" },
      },
    });
    const result = await verifyLiveness(
      { challenge: "registration", registeredModalityHint: "face" },
      { fetcher }
    );
    expect((result.error as unknown as { code: string }).code).toBe(
      ERROR_CODES.LIVENESS.PROVIDER_ERROR
    );
  });
});

describe("registerPasskeyWithLiveness", () => {
  test("forwards token to registerPasskey on success", async () => {
    __setExpoPasskeyLivenessModule(fakeNativeModule());
    const register = jest.fn(async (input: { livenessToken: string }) => ({
      data: { credentialId: "cred-1", token: input.livenessToken },
      error: null,
    }));
    const result = await registerPasskeyWithLiveness(
      { registeredModalityHint: "face", userName: "x" } as never,
      {
        fetcher: fakeFetcher({}),
        registerPasskey: register,
      }
    );
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ livenessToken: "tok" })
    );
    expect(result.error).toBeNull();
  });

  test("aborts when liveness fails", async () => {
    __setExpoPasskeyLivenessModule(null);
    const register = jest.fn();
    const result = await registerPasskeyWithLiveness(
      { registeredModalityHint: "face" } as never,
      {
        fetcher: fakeFetcher({}),
        registerPasskey: register as never,
      }
    );
    expect(register).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });
});

describe("authenticateWithPasskeyAndLiveness", () => {
  test("forwards token to authenticateWithPasskey on success", async () => {
    __setExpoPasskeyLivenessModule(fakeNativeModule());
    const authenticate = jest.fn(async (input: { livenessToken: string }) => ({
      data: { sessionId: "abc", token: input.livenessToken },
      error: null,
    }));
    const result = await authenticateWithPasskeyAndLiveness(
      { registeredModalityHint: "fingerprint" } as never,
      {
        fetcher: fakeFetcher({}),
        authenticateWithPasskey: authenticate,
      }
    );
    expect(authenticate).toHaveBeenCalledWith(
      expect.objectContaining({ livenessToken: "tok" })
    );
    expect(result.error).toBeNull();
  });
});
