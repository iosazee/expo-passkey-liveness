import { detectClientModality } from "../modality";

describe("detectClientModality", () => {
  test("honours an explicit hint", async () => {
    expect(await detectClientModality({ hint: "iris" })).toBe("iris");
  });

  test("falls back to 'unknown' when expo-local-authentication is absent", async () => {
    expect(
      await detectClientModality({
        __resolver: async () => {
          throw new Error("no module");
        },
      })
    ).toBe("unknown");
  });

  test("maps supportedAuthenticationTypesAsync array to face when face is present", async () => {
    expect(
      await detectClientModality({
        __resolver: async () => ["1", "2"], // fingerprint + face
      })
    ).toBe("face");
  });

  test("returns fingerprint when only fingerprint is supported", async () => {
    expect(
      await detectClientModality({
        __resolver: async () => ["1"],
      })
    ).toBe("fingerprint");
  });

  test("returns 'unknown' for empty list", async () => {
    expect(
      await detectClientModality({
        __resolver: async () => [],
      })
    ).toBe("unknown");
  });
});
