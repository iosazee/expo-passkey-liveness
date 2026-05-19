import { iproovProvider } from "../../providers/iproov";

function fakeFetch(
  responder: (
    path: string,
    body: unknown
  ) => { status?: number; body: unknown; text?: string }
): typeof fetch {
  const handler = async (input: unknown, init?: { body?: unknown }) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const r = responder(path, body);
    return {
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      statusText: "OK",
      async json() {
        return r.body;
      },
      async text() {
        return r.text ?? "";
      },
    } as Response;
  };
  return handler as unknown as typeof fetch;
}

const baseCfg = {
  apiKey: "k",
  secret: "s",
  baseUrl: "https://eu.rp.secure.iproov.me/api/v2",
};

describe("iproovProvider", () => {
  test("requires apiKey/secret/baseUrl", () => {
    expect(() => iproovProvider({ ...baseCfg, apiKey: "" })).toThrow(/apiKey/);
    expect(() => iproovProvider({ ...baseCfg, secret: "" })).toThrow(/secret/);
    expect(() => iproovProvider({ ...baseCfg, baseUrl: "" })).toThrow(/baseUrl/);
  });

  test("createSession routes registration to /claim/enrol/token", async () => {
    let observedPath = "";
    let observedBody: unknown = null;
    const provider = iproovProvider({
      ...baseCfg,
      __fetch: fakeFetch((path, body) => {
        observedPath = path;
        observedBody = body;
        return { body: { token: "tok-1" } };
      }),
    });

    const result = await provider.createSession({
      userId: "u",
      challenge: "registration",
      rpId: "example.com",
    });

    expect(observedPath).toContain("/claim/enrol/token");
    expect(observedBody).toMatchObject({
      api_key: "k",
      secret: "s",
      user_id: "u",
      resource: "example.com",
    });
    expect(result.sessionId).toBe("tok-1");
    expect(result.clientBootstrap).toEqual({
      token: "tok-1",
      mode: "enrol",
      baseUrl: baseCfg.baseUrl,
    });
  });

  test("createSession routes authentication to /claim/verify/token", async () => {
    let observedPath = "";
    const provider = iproovProvider({
      ...baseCfg,
      __fetch: fakeFetch((path) => {
        observedPath = path;
        return { body: { token: "tok-2" } };
      }),
    });
    await provider.createSession({
      userId: "u",
      challenge: "authentication",
      rpId: "example.com",
    });
    expect(observedPath).toContain("/claim/verify/token");
  });

  test("createSession honours forceMode override", async () => {
    let observedPath = "";
    const provider = iproovProvider({
      ...baseCfg,
      forceMode: "verify",
      __fetch: fakeFetch((path) => {
        observedPath = path;
        return { body: { token: "tok-3" } };
      }),
    });
    await provider.createSession({
      userId: "u",
      challenge: "registration",
      rpId: "example.com",
    });
    expect(observedPath).toContain("/claim/verify/token");
  });

  test("createSession throws when token missing", async () => {
    const provider = iproovProvider({
      ...baseCfg,
      __fetch: fakeFetch(() => ({ body: {} })),
    });
    await expect(
      provider.createSession({
        userId: "u",
        challenge: "registration",
        rpId: "example.com",
      })
    ).rejects.toThrow(/missing token/);
  });

  test("getResults maps passed + confidence", async () => {
    const provider = iproovProvider({
      ...baseCfg,
      __fetch: fakeFetch(() => ({
        body: { passed: true, confidence: 97.4, outcome: "passed" },
      })),
    });
    const result = await provider.getResults({
      providerSessionId: "tok",
      userId: "u",
      challenge: "authentication",
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(97.4);
  });

  test("getResults marks failed outcome", async () => {
    const provider = iproovProvider({
      ...baseCfg,
      __fetch: fakeFetch(() => ({
        body: { passed: false, outcome: "failed", confidence: 50, reason: "spoof" },
      })),
    });
    const result = await provider.getResults({
      providerSessionId: "tok",
      userId: "u",
      challenge: "authentication",
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(50);
    expect(result.meta).toEqual({ reason: "spoof" });
  });

  test("HTTP failures surface as errors with status code in message", async () => {
    const provider = iproovProvider({
      ...baseCfg,
      __fetch: fakeFetch(() => ({ status: 502, body: {}, text: "Bad Gateway" })),
    });
    await expect(
      provider.createSession({
        userId: "u",
        challenge: "authentication",
        rpId: "example.com",
      })
    ).rejects.toThrow(/502/);
  });
});
