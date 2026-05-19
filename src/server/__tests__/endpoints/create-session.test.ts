import { APIError } from "better-call";

import { ERROR_CODES } from "../../../types/errors";
import type {
  LivenessProvider,
  ProviderResults,
} from "../../../types/liveness";
import type {
  ExpoPasskeyLivenessOptions,
  ResolvedSchemaConfig,
} from "../../../types/server";
import { createCreateSessionEndpoint } from "../../endpoints/create-session";

function makeProvider(
  overrides: Partial<LivenessProvider> = {}
): LivenessProvider {
  return {
    name: "fake",
    minScoreDefault: 80,
    async createSession() {
      return {
        sessionId: "vendor-sess-1",
        clientBootstrap: { region: "us-east-1" },
      };
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

function makeOptions(
  overrides: Partial<ExpoPasskeyLivenessOptions["liveness"]> = {}
): ExpoPasskeyLivenessOptions {
  return {
    rpId: "example.com",
    liveness: {
      required: "both",
      provider: makeProvider(),
      ...overrides,
    },
  };
}

function makeCtx(overrides: { session?: unknown; body?: unknown } = {}) {
  const headerMap = new Map<string, string>([
    ["x-forwarded-for", "1.2.3.4"],
  ]);
  return {
    body: overrides.body ?? {},
    headers: { get: (name: string) => headerMap.get(name) ?? null },
    context: {
      adapter: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: "row-1",
          ...data,
        })),
        update: jest.fn(async () => ({})),
        findOne: jest.fn(),
      },
      session: overrides.session ?? null,
    },
    json: jest.fn((data: unknown) => data),
  };
}

type Handler = (ctx: ReturnType<typeof makeCtx>) => Promise<unknown>;
function handlerOf(endpoint: unknown): Handler {
  return (endpoint as { handler: Handler }).handler;
}

describe("create-session endpoint", () => {
  beforeEach(() => jest.clearAllMocks());

  test("registration challenge persists a pending row and returns sessionId + bootstrap", async () => {
    const options = makeOptions();
    const ctx = makeCtx({
      session: { user: { id: "u-1" } },
      body: { challenge: "registration", registeredModality: "fingerprint" },
    });

    const endpoint = createCreateSessionEndpoint({
      options,
      logger: mockLogger,
      schemaConfig,
      _sessionFetcher: async () => ctx.context.session as never,
    });

    const result = (await handlerOf(endpoint)(ctx)) as {
      sessionId: string;
      provider: string;
      expiresAt: string;
      clientBootstrap: unknown;
    };

    expect(result.sessionId).toBe("row-1");
    expect(result.provider).toBe("fake");
    expect(result.clientBootstrap).toEqual({ region: "us-east-1" });
    expect(ctx.context.adapter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "passkeyLivenessSession",
        data: expect.objectContaining({
          userId: "u-1",
          provider: "fake",
          providerSessionId: "vendor-sess-1",
          challenge: "registration",
          status: "pending",
          registeredModality: "fingerprint",
        }),
      })
    );
  });

  test("rejects registration challenge without a session", async () => {
    const options = makeOptions();
    const ctx = makeCtx({ session: null, body: { challenge: "registration" } });

    const endpoint = createCreateSessionEndpoint({
      options,
      logger: mockLogger,
      schemaConfig,
      _sessionFetcher: async () => null as never,
    });

    await expect(handlerOf(endpoint)(ctx)).rejects.toBeInstanceOf(APIError);
  });

  test("authentication challenge accepts userId from body when no session", async () => {
    const options = makeOptions();
    const ctx = makeCtx({
      body: { challenge: "authentication", userId: "u-9" },
    });

    const endpoint = createCreateSessionEndpoint({
      options,
      logger: mockLogger,
      schemaConfig,
      _sessionFetcher: async () => null as never,
    });

    await handlerOf(endpoint)(ctx);

    expect(ctx.context.adapter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "u-9", challenge: "authentication" }),
      })
    );
  });

  test("authentication challenge with neither session nor userId errors", async () => {
    const options = makeOptions();
    const ctx = makeCtx({ body: { challenge: "authentication" } });

    const endpoint = createCreateSessionEndpoint({
      options,
      logger: mockLogger,
      schemaConfig,
      _sessionFetcher: async () => null as never,
    });

    await expect(handlerOf(endpoint)(ctx)).rejects.toBeInstanceOf(APIError);
  });

  test("provider error is surfaced as PROVIDER_ERROR", async () => {
    const failing = makeProvider({
      async createSession() {
        throw new Error("vendor down");
      },
    });
    const options = makeOptions({ provider: failing });
    const ctx = makeCtx({
      session: { user: { id: "u-1" } },
      body: { challenge: "registration" },
    });

    const endpoint = createCreateSessionEndpoint({
      options,
      logger: mockLogger,
      schemaConfig,
      _sessionFetcher: async () => ctx.context.session as never,
    });

    await expect(handlerOf(endpoint)(ctx)).rejects.toMatchObject({
      body: expect.objectContaining({
        code: ERROR_CODES.LIVENESS.PROVIDER_ERROR,
      }),
    });
  });

  test("step-up challenge requires a session", async () => {
    const options = makeOptions();
    const ctx = makeCtx({ session: null, body: { challenge: "step-up" } });

    const endpoint = createCreateSessionEndpoint({
      options,
      logger: mockLogger,
      schemaConfig,
      _sessionFetcher: async () => null as never,
    });

    await expect(handlerOf(endpoint)(ctx)).rejects.toBeInstanceOf(APIError);
  });
});
