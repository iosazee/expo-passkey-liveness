import {
  rekognitionProvider,
  type RekognitionSdkLike,
} from "../../providers/rekognition";

function fakeSdk(opts: {
  createSessionId?: string | undefined;
  results?: Partial<{
    Status: "CREATED" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "EXPIRED";
    Confidence: number;
    ReferenceImage: { S3Object?: { Name?: string } };
  }>;
}): RekognitionSdkLike {
  return {
    createClient() {
      return {
        async createFaceLivenessSession() {
          return { SessionId: opts.createSessionId };
        },
        async getFaceLivenessSessionResults() {
          return {
            Status: opts.results?.Status ?? "SUCCEEDED",
            Confidence: opts.results?.Confidence,
            ReferenceImage: opts.results?.ReferenceImage,
          };
        },
      };
    },
  };
}

describe("rekognitionProvider", () => {
  test("requires a region", () => {
    expect(() =>
      rekognitionProvider({ region: "" } as unknown as { region: string })
    ).toThrow(/region is required/);
  });

  test("createSession returns the SessionId and bootstrap data", async () => {
    const provider = rekognitionProvider({
      region: "us-east-1",
      __sdk: fakeSdk({ createSessionId: "sess-1" }),
    });

    const result = await provider.createSession({
      userId: "u",
      challenge: "registration",
      rpId: "example.com",
    });

    expect(result.sessionId).toBe("sess-1");
    expect(result.clientBootstrap).toEqual({
      sessionId: "sess-1",
      region: "us-east-1",
    });
  });

  test("createSession throws when SDK returns no SessionId", async () => {
    const provider = rekognitionProvider({
      region: "us-east-1",
      __sdk: fakeSdk({ createSessionId: undefined }),
    });

    await expect(
      provider.createSession({ userId: "u", challenge: "registration", rpId: "example.com" })
    ).rejects.toThrow(/missing SessionId/);
  });

  test("getResults maps SUCCEEDED with Confidence>=minScore to passed", async () => {
    const provider = rekognitionProvider({
      region: "us-east-1",
      minScoreDefault: 80,
      __sdk: fakeSdk({ results: { Status: "SUCCEEDED", Confidence: 91.2 } }),
    });

    const result = await provider.getResults({
      providerSessionId: "sess-1",
      userId: "u",
      challenge: "registration",
    });

    expect(result.score).toBe(91.2);
    expect(result.passed).toBe(true);
    expect(result.meta).toEqual({ status: "SUCCEEDED" });
  });

  test("getResults marks FAILED status as not passed regardless of confidence", async () => {
    const provider = rekognitionProvider({
      region: "us-east-1",
      __sdk: fakeSdk({ results: { Status: "FAILED", Confidence: 99 } }),
    });

    const result = await provider.getResults({
      providerSessionId: "sess-1",
      userId: "u",
      challenge: "registration",
    });

    expect(result.passed).toBe(false);
  });

  test("getResults marks SUCCEEDED below threshold as not passed", async () => {
    const provider = rekognitionProvider({
      region: "us-east-1",
      minScoreDefault: 95,
      __sdk: fakeSdk({ results: { Status: "SUCCEEDED", Confidence: 80 } }),
    });

    const result = await provider.getResults({
      providerSessionId: "sess-1",
      userId: "u",
      challenge: "registration",
    });

    expect(result.passed).toBe(false);
  });

  test("getResults surfaces reference image S3 name when present", async () => {
    const provider = rekognitionProvider({
      region: "us-east-1",
      __sdk: fakeSdk({
        results: {
          Status: "SUCCEEDED",
          Confidence: 92,
          ReferenceImage: { S3Object: { Name: "refs/abc.jpg" } },
        },
      }),
    });

    const result = await provider.getResults({
      providerSessionId: "sess-1",
      userId: "u",
      challenge: "registration",
    });

    expect(result.referenceHash).toBe("refs/abc.jpg");
  });

  test("padLevel and name are stable identifiers", () => {
    const provider = rekognitionProvider({
      region: "us-east-1",
      __sdk: fakeSdk({}),
    });
    expect(provider.name).toBe("rekognition");
    expect(provider.padLevel).toBe("L1");
    expect(provider.minScoreDefault).toBe(90);
  });
});
