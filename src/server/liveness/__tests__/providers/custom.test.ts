import { customProvider } from "../../providers/custom";
import type { LivenessProvider } from "../../../../types/liveness";

function makeImpl(overrides: Partial<LivenessProvider> = {}): LivenessProvider {
  return {
    name: "fake",
    minScoreDefault: 80,
    async createSession() {
      return { sessionId: "s", clientBootstrap: {} };
    },
    async getResults() {
      return { score: 90, passed: true };
    },
    ...overrides,
  };
}

describe("customProvider", () => {
  test("returns the impl unchanged when valid", () => {
    const impl = makeImpl();
    expect(customProvider(impl)).toBe(impl);
  });

  test("rejects a missing name", () => {
    expect(() => customProvider({ ...makeImpl(), name: "" })).toThrow(
      /name is required/
    );
  });

  test("rejects a non-numeric minScoreDefault", () => {
    expect(() =>
      customProvider({
        ...makeImpl(),
        minScoreDefault: undefined as unknown as number,
      })
    ).toThrow(/minScoreDefault is required/);
  });

  test("rejects an object missing createSession", () => {
    expect(() =>
      customProvider({
        name: "x",
        minScoreDefault: 80,
        getResults: async () => ({ score: 0, passed: false }),
      } as unknown as LivenessProvider)
    ).toThrow(/must implement LivenessProvider/);
  });
});
