/**
 * @file AWS Rekognition Face Liveness provider.
 *
 * Wraps the @aws-sdk/client-rekognition CreateFaceLivenessSession
 * and GetFaceLivenessSessionResults calls behind the LivenessProvider
 * contract.
 *
 * The SDK is loaded via dynamic import inside the provider methods,
 * so consumers who do not configure Rekognition pay nothing at
 * import time and only see a clear error if they call createSession
 * without having installed @aws-sdk/client-rekognition.
 */

import type {
  LivenessProvider,
  ProviderCreateSessionInput,
  ProviderCreateSessionResult,
  ProviderGetResultsInput,
  ProviderResults,
} from "../../../types/liveness";

export interface RekognitionProviderConfig {
  /** AWS region (e.g. "us-east-1"). */
  region: string;
  /**
   * Optional credentials. If omitted, the AWS SDK's default provider
   * chain is used (env vars, IMDS, shared config, etc.).
   */
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
  /**
   * S3 destination for audit-image upload, if the operator wants
   * per-session reference frames retained for compliance review.
   */
  auditImagesBucket?: string;
  /**
   * Default minimum acceptable Confidence (0–100). Rekognition's own
   * pass threshold is typically 80–95 depending on use case; we
   * default to 90 here, which matches AWS's published guidance for
   * general consumer use cases.
   */
  minScoreDefault?: number;
  /**
   * Optional adapter override for tests. When provided, this is used
   * instead of dynamically importing @aws-sdk/client-rekognition.
   */
  __sdk?: RekognitionSdkLike;
}

/**
 * The subset of the AWS SDK we depend on. Defined locally so we don't
 * import the type-only surface and force consumers to install the SDK
 * as a regular (non-optional) peer.
 */
export interface RekognitionSdkLike {
  createClient: (config: {
    region: string;
    credentials?: RekognitionProviderConfig["credentials"];
  }) => RekognitionClientLike;
}

export interface RekognitionClientLike {
  createFaceLivenessSession(input: {
    Settings?: { AuditImagesLimit?: number; OutputConfig?: { S3Bucket: string } };
  }): Promise<{ SessionId?: string }>;
  getFaceLivenessSessionResults(input: { SessionId: string }): Promise<{
    Status?: "CREATED" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "EXPIRED";
    Confidence?: number;
    ReferenceImage?: { S3Object?: { Name?: string }; Bytes?: Uint8Array };
  }>;
}

export function rekognitionProvider(
  config: RekognitionProviderConfig
): LivenessProvider {
  if (!config.region) {
    throw new Error("rekognitionProvider: region is required");
  }
  const minScoreDefault = config.minScoreDefault ?? 90;

  return {
    name: "rekognition",
    padLevel: "L1",
    minScoreDefault,

    async createSession(
      _input: ProviderCreateSessionInput
    ): Promise<ProviderCreateSessionResult> {
      const sdk = await loadSdk(config);
      const client = sdk.createClient({
        region: config.region,
        credentials: config.credentials,
      });
      const result = await client.createFaceLivenessSession({
        Settings: config.auditImagesBucket
          ? {
              AuditImagesLimit: 4,
              OutputConfig: { S3Bucket: config.auditImagesBucket },
            }
          : undefined,
      });
      if (!result.SessionId) {
        throw new Error("rekognition: missing SessionId in response");
      }
      return {
        sessionId: result.SessionId,
        clientBootstrap: {
          sessionId: result.SessionId,
          region: config.region,
        },
      };
    },

    async getResults(input: ProviderGetResultsInput): Promise<ProviderResults> {
      const sdk = await loadSdk(config);
      const client = sdk.createClient({
        region: config.region,
        credentials: config.credentials,
      });
      const result = await client.getFaceLivenessSessionResults({
        SessionId: input.providerSessionId,
      });

      const score = typeof result.Confidence === "number" ? result.Confidence : 0;
      const passed =
        result.Status === "SUCCEEDED" && score >= minScoreDefault;

      return {
        score,
        passed,
        referenceHash: result.ReferenceImage?.S3Object?.Name,
        meta: { status: result.Status },
      };
    },
  };
}

async function loadSdk(
  config: RekognitionProviderConfig
): Promise<RekognitionSdkLike> {
  if (config.__sdk) {
    return config.__sdk;
  }
  let mod: unknown;
  try {
    // Optional peer dependency — resolved at runtime only.
    // @ts-expect-error -- @aws-sdk/client-rekognition is not installed by default
    mod = await import("@aws-sdk/client-rekognition");
  } catch (err) {
    throw new Error(
      "rekognitionProvider requires @aws-sdk/client-rekognition. " +
        "Install it as a dependency in the app that configures this provider. " +
        `Underlying error: ${(err as Error)?.message ?? String(err)}`
    );
  }
  // Bridge the real SDK's class-based shape into our minimal interface.
  const sdkAny = mod as {
    RekognitionClient: new (cfg: unknown) => {
      send: (cmd: unknown) => Promise<unknown>;
    };
    CreateFaceLivenessSessionCommand: new (input: unknown) => unknown;
    GetFaceLivenessSessionResultsCommand: new (input: unknown) => unknown;
  };
  return {
    createClient(cfg) {
      const client = new sdkAny.RekognitionClient(cfg);
      return {
        async createFaceLivenessSession(input) {
          const cmd = new sdkAny.CreateFaceLivenessSessionCommand(input);
          return (await client.send(cmd)) as {
            SessionId?: string;
          };
        },
        async getFaceLivenessSessionResults(input) {
          const cmd = new sdkAny.GetFaceLivenessSessionResultsCommand(input);
          return (await client.send(cmd)) as Awaited<
            ReturnType<RekognitionClientLike["getFaceLivenessSessionResults"]>
          >;
        },
      };
    },
  };
}
