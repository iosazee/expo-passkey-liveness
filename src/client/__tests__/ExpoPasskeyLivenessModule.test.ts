import {
  __resetExpoPasskeyLivenessModule,
  __setExpoPasskeyLivenessModule,
  getExpoPasskeyLivenessModule,
} from "../../ExpoPasskeyLivenessModule";

afterEach(() => __resetExpoPasskeyLivenessModule());

describe("ExpoPasskeyLivenessModule loader", () => {
  test("returns null when the native module is not registered", () => {
    // expo-modules-core's requireNativeModule throws on Node, so the
    // loader should swallow that and cache null.
    expect(getExpoPasskeyLivenessModule()).toBeNull();
    // Second call hits the cache.
    expect(getExpoPasskeyLivenessModule()).toBeNull();
  });

  test("respects an explicitly set test double", () => {
    const fake = {
      isLivenessSupported: () => true,
      runLivenessCheck: jest.fn(async () => "{}"),
      cancel: jest.fn(async () => undefined),
    };
    __setExpoPasskeyLivenessModule(fake);
    expect(getExpoPasskeyLivenessModule()).toBe(fake);
  });
});
