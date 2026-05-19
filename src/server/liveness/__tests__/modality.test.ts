import {
  detectModalityFromMetadata,
  normalizeBiometricType,
} from "../modality";

describe("detectModalityFromMetadata", () => {
  test.each([
    ["faceID", "face"],
    ["FaceID", "face"],
    ["face_id", "face"],
    ["face", "face"],
    ["2", "face"],
    ["fingerprint", "fingerprint"],
    ["Fingerprint", "fingerprint"],
    ["touchID", "fingerprint"],
    ["touch_id", "fingerprint"],
    ["1", "fingerprint"],
    ["iris", "iris"],
    ["3", "iris"],
    ["something-else", "other"],
  ])("classifies biometricType=%j as %s", (value, expected) => {
    const json = JSON.stringify({ biometricType: value });
    expect(detectModalityFromMetadata(json)).toBe(expected);
  });

  test("returns 'unknown' for null/empty/garbage input", () => {
    expect(detectModalityFromMetadata(null)).toBe("unknown");
    expect(detectModalityFromMetadata(undefined)).toBe("unknown");
    expect(detectModalityFromMetadata("")).toBe("unknown");
    expect(detectModalityFromMetadata("not-json")).toBe("unknown");
    expect(detectModalityFromMetadata("123")).toBe("unknown"); // valid JSON, not an object
    expect(detectModalityFromMetadata("null")).toBe("unknown");
  });

  test("returns 'unknown' when the metadata blob has no biometric hint", () => {
    expect(
      detectModalityFromMetadata(JSON.stringify({ deviceModel: "iPhone 15 Pro" }))
    ).toBe("unknown");
  });

  test("reads biometricType from verificationSettings if not at the root", () => {
    expect(
      detectModalityFromMetadata(
        JSON.stringify({ verificationSettings: { biometricType: "faceID" } })
      )
    ).toBe("face");
  });

  test("falls back to the older 'biometric' field name", () => {
    expect(
      detectModalityFromMetadata(JSON.stringify({ biometric: "fingerprint" }))
    ).toBe("fingerprint");
  });

  test("prefers face when an array of supported types is supplied", () => {
    expect(
      detectModalityFromMetadata(
        JSON.stringify({ biometricType: ["fingerprint", "faceID"] })
      )
    ).toBe("face");
  });

  test("prefers fingerprint over iris when no face is present", () => {
    expect(
      detectModalityFromMetadata(
        JSON.stringify({ biometricType: ["iris", "fingerprint"] })
      )
    ).toBe("fingerprint");
  });
});

describe("normalizeBiometricType (client-facing alias)", () => {
  test("handles direct values", () => {
    expect(normalizeBiometricType("faceID")).toBe("face");
    expect(normalizeBiometricType(undefined)).toBe("unknown");
  });
});
