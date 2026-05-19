import { APIError } from "better-call";

import { ERROR_CODES } from "../../../types/errors";
import type {
  LivenessProvider,
  ProviderResults,
} from "../../../types/liveness";
import type {
  ExpoPasskeyLivenessOptions,
  ResolvedSchemaConfig,
  PasskeyLivenessSessionRow,
} from "../../../types/server";
import { verifyLivenessToken } from "../../liveness/token";
import { createVerifySessionEndpoint } from "../../endpoints/verify-session";

function makeProvider(
  overrides: Partial<LivenessProvider> = {}
): LivenessProvider {
  return {
    name: "fake",
    padLevel: "L2",
    minScoreDefault: 80,
    async createSession() {
      return { sessionId: "vendor-1", clientBootstrap: {} };
    },
    async getResults(): Promise<ProviderResults> {
      return { score: 95, passed: true };
    },
    ...overrides,
  };
}

const schemaConfig: ResolvedSchemaConfig = {
  passkeyLivenessSessionModel: "passkeyLivenessSession",
};
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
const SECRET = "test-secret";

function makeOptions(
  overrides: Partial<ExpoPasskeyLivenessOptions["liveness"]> = {}
): ExpoPasskeyLivenessOptions {
  return {
    rpId: "example.com",
    liveness: {
      required: "both",
      provider: makeProvider(),
      minScore: 90,
      ...overrides,
    },
  };
}

function makeRow(
  overrides: Partial<PasskeyLivenessSessionRow> = {}
): PasskeyLivenessSessionRow {
  const now = Date.now();
  return {
    id: "row-1",
    userId: "u-1",
    provider: "fake",
    providerSessionId: "vendor-1",
    challenge: "registration",
    status: "pending",
    score: null,
    registeredModality: "fingerprint",
    createdAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    consumedAt: null,
    ...overrides,
  };
}

function makeCtx(row: PasskeyLivenessSessionRow | null) {
  return {
    body: { sessionId: "row-1" },
    context: {
      adapter: {
        findOne: jest.fn(async () => row),
        update: jest.fn(async () => ({})),
      },
    },
    json: jest.fn((data: unknown) => data),
  };
}

type Handler = (ctx: ReturnType<typeof makeCtx>) => Promise<unknown>;
function handlerOf(endpoint: unknown): Handler {
  return (endpoint as { handler: Handler }).handler;
}

describe("verify-session endpoint", () => {
  beforeEach(() => jest.clearAllMocks());

  test("mints a token, updates row to verified, and returns expected shape", async () => {
    const options = makeOptions();
    const row = makeRow();
    const ctx = makeCtx(row);

    const endpoint = createVerifySessionEndpoint({
      options,
      logger: mockLogger,
      schemaConfig,
      resolveSigningKey: () => SECRET,
    });

    const result = (await handlerOf(endpoint)(ctx)) as {
      livenessToken: string;
      provider: string;
      score: number;
    };

    expect(result.provider).toBe("fake");
    expect(result.score).toBe(95);

    const verified = await verifyLivenessToken({
      token: result.livenessToken,
      signingKey: SECRET,
      expectedAudience: "example.com",
      expectedChallenge: "registration",
      minScore: 90,
    });
    expect(verified.ok).toBe(true);
    if (!verified.ok) {return;}
    expect(verified.payload.uid).toBe("u-1");
    expect(verified.payload.rgm).toBe("fingerprint");

    expect(ctx.context.adapter.update).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: "verified", score: 95 }),
      })
    );
  });

  test("returns SESSION_NOT_FOUND when row missing", async () => {
    const options = makeOptions();
    const ctx = makeCtx(null);

    const endpoint = createVerifySessionEndpoint({
      options,
      logger: mockLogger,
      schemaConfig,
      resolveSigningKey: () => SECRET,
    });

    await expect(handlerOf(endpoint)(ctx)).rejects.toMatchObject({
      body: expect.objectContaining({
        code: ERROR_CODES.LIVENESS.SESSION_NOT_FOUND,
      }),
    });
  });

  test("returns SESSION_EXPIRED and marks the row when row is past expiry", async () => {
    const options = makeOptions();
    const row = makeRow({
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const ctx = makeCtx(row);

    const endpoint = createVerifySessionEndpoint({
      options,
      logger: mockLogger,
      schemaConfig,
      resolveSigningKey: () => SECRET,
    });

    await expect(handlerOf(endpoint)(ctx)).rejects.toMatchObject({
      body: expect.objectContaining({
        code: ERROR_CODES.LIVENESS.SESSION_EXPIRED,
      }),
    });
    expect(ctx.context.adapter.update).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: "expired" }),
      })
    );
  });

  test("rejects a session whose status is not pending", async () => {
    const options = makeOptions();
    const row = makeRow({ status: "verified" });
    const ctx = makeCtx(row);

    const endpoint = createVerifySessionEndpoint({
      options,
      logger: mockLogger,
      schemaConfig,
      resolveSigningKey: () => SECRET,
    });

    await expect(handlerOf(endpoint)(ctx)).rejects.toMatchObject({
      body: expect.objectContaining({
        code: ERROR_CODES.LIVENESS.SESSION_ALREADY_CONSUMED,
      }),
    });
  });

  test("returns PAD_BELOW_THRESHOLD and marks the row failed when score < min", async () => {
    const provider = makeProvider({
      async getResults() {
        return { score: 60, passed: true };
      },
    });
    const options = makeOptions({ provider, minScore: 90 });
    const row = makeRow();
    const ctx = makeCtx(row);

    const endpoint = createVerifySessionEndpoint({
      options,
      logger: mockLogger,
      schemaConfig,
      resolveSigningKey: () => SECRET,
    });

    await expect(handlerOf(endpoint)(ctx)).rejects.toMatchObject({
      body: expect.objectContaining({
        code: ERROR_CODES.LIVENESS.PAD_BELOW_THRESHOLD,
      }),
    });
    expect(ctx.context.adapter.update).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: "failed", score: 60 }),
      })
    );
  });

  test("rejects when provider says !passed even with high score", async () => {
    const provider = makeProvider({
      async getResults() {
        return { score: 99, passed: false };
      },
    });
    const options = makeOptions({ provider });
    const row = makeRow();
    const ctx = makeCtx(row);

    const endpoint = createVerifySessionEndpoint({
      options,
      logger: mockLogger,
      schemaConfig,
      resolveSigningKey: () => SECRET,
    });

    await expect(handlerOf(endpoint)(ctx)).rejects.toMatchObject({
      body: expect.objectContaining({
        code: ERROR_CODES.LIVENESS.PAD_BELOW_THRESHOLD,
      }),
    });
  });

  test("applies per-operation threshold override", async () => {
    const provider = makeProvider({
      async getResults() {
        return { score: 75, passed: true };
      },
    });
    const options = makeOptions({
      provider,
      minScore: 90,
      overrides: { registration: { minScore: 70 } },
    });
    const row = makeRow();
    const ctx = makeCtx(row);

    const endpoint = createVerifySessionEndpoint({
      options,
      logger: mockLogger,
      schemaConfig,
      resolveSigningKey: () => SECRET,
    });

    const result = await handlerOf(endpoint)(ctx);
    expect(result).toBeTruthy();
  });

  test("provider getResults failure surfaces as PROVIDER_ERROR", async () => {
    const provider = makeProvider({
      async getResults() {
        throw new Error("vendor 500");
      },
    });
    const options = makeOptions({ provider });
    const row = makeRow();
    const ctx = makeCtx(row);

    const endpoint = createVerifySessionEndpoint({
      options,
      logger: mockLogger,
      schemaConfig,
      resolveSigningKey: () => SECRET,
    });

    await expect(handlerOf(endpoint)(ctx)).rejects.toMatchObject({
      body: expect.objectContaining({
        code: ERROR_CODES.LIVENESS.PROVIDER_ERROR,
      }),
    });
  });
});

// Suppress an unused-import warning when only used via expect()
void APIError;
