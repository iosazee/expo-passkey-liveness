/**
 * @file iProov Genuine Presence Assurance provider.
 *
 * iProov ships a REST API for server-side session management; the
 * actual ceremony runs on-device via the iProov SDK using a token
 * minted by /claim/verify/token (or /claim/enrol/token for first-time
 * registration). This adapter wraps both calls behind the
 * LivenessProvider contract.
 *
 * The HTTP client is supplied via the `__fetch` test seam so the
 * provider is testable without network. In production it defaults
 * to the global fetch.
 */

import type {
  LivenessProvider,
  ProviderCreateSessionInput,
  ProviderCreateSessionResult,
  ProviderGetResultsInput,
  ProviderResults,
} from "../../../types/liveness";

export interface IProovProviderConfig {
  /** API key issued by iProov for the relying party. */
  apiKey: string;
  /** Shared secret issued alongside the API key. */
  secret: string;
  /**
   * iProov region API base (e.g. "https://eu.rp.secure.iproov.me/api/v2").
   * Required because iProov does not have a single global endpoint.
   */
  baseUrl: string;
  /** Default minimum acceptable confidence (0–100). Default 95. */
  minScoreDefault?: number;
  /**
   * "enrol" or "verify" — iProov distinguishes first-time face
   * enrolment from subsequent verifications. The default routing is
   * based on the challenge: registration → enrol, others → verify.
   */
  forceMode?: "enrol" | "verify";
  /** Test seam — replace the HTTP client. */
  __fetch?: typeof fetch;
}

interface IProovTokenResponse {
  token?: string;
}
interface IProovValidateResponse {
  passed?: boolean;
  outcome?: "passed" | "failed" | "error";
  confidence?: number;
  reason?: string;
}

export function iproovProvider(config: IProovProviderConfig): LivenessProvider {
  if (!config.apiKey) {
    throw new Error("iproovProvider: apiKey is required");
  }
  if (!config.secret) {
    throw new Error("iproovProvider: secret is required");
  }
  if (!config.baseUrl) {
    throw new Error("iproovProvider: baseUrl is required");
  }
  const minScoreDefault = config.minScoreDefault ?? 95;
  const fetchImpl = config.__fetch ?? globalThis.fetch.bind(globalThis);

  function modeFor(challenge: ProviderCreateSessionInput["challenge"]): "enrol" | "verify" {
    if (config.forceMode) {return config.forceMode;}
    return challenge === "registration" ? "enrol" : "verify";
  }

  async function postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetchImpl(joinUrl(config.baseUrl, path), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `iproov: ${res.status} ${res.statusText} from ${path}${text ? ` — ${text}` : ""}`
      );
    }
    return (await res.json()) as T;
  }

  return {
    name: "iproov",
    padLevel: "L2",
    minScoreDefault,

    async createSession(
      input: ProviderCreateSessionInput
    ): Promise<ProviderCreateSessionResult> {
      const mode = modeFor(input.challenge);
      const path = mode === "enrol" ? "/claim/enrol/token" : "/claim/verify/token";

      const data = await postJson<IProovTokenResponse>(path, {
        api_key: config.apiKey,
        secret: config.secret,
        user_id: input.userId,
        resource: input.rpId,
      });
      if (!data.token) {
        throw new Error("iproov: missing token in response");
      }
      return {
        sessionId: data.token,
        clientBootstrap: {
          token: data.token,
          mode,
          baseUrl: config.baseUrl,
        },
      };
    },

    async getResults(input: ProviderGetResultsInput): Promise<ProviderResults> {
      // iProov's verify-token endpoint returns the result once the
      // client has completed the ceremony.
      const data = await postJson<IProovValidateResponse>(
        "/claim/verify/validate",
        {
          api_key: config.apiKey,
          secret: config.secret,
          token: input.providerSessionId,
          user_id: input.userId,
        }
      );
      const confidence =
        typeof data.confidence === "number" ? data.confidence : 0;
      const passed =
        data.passed === true ||
        data.outcome === "passed" ||
        (typeof data.confidence === "number" && confidence >= minScoreDefault);
      return {
        score: confidence,
        passed,
        meta: data.reason ? { reason: data.reason } : undefined,
      };
    },
  };
}

function joinUrl(base: string, path: string): string {
  if (base.endsWith("/") && path.startsWith("/")) {
    return base + path.slice(1);
  }
  if (!base.endsWith("/") && !path.startsWith("/")) {
    return base + "/" + path;
  }
  return base + path;
}
