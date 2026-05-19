import {
  DEFAULT_EXPLAINER_STRINGS,
  resolveExplainerStrings,
} from "../ui/defaultStrings";

describe("resolveExplainerStrings", () => {
  test("returns defaults when no overrides are provided", () => {
    const copy = resolveExplainerStrings("fingerprint", undefined);
    expect(copy).toEqual(DEFAULT_EXPLAINER_STRINGS.fingerprint);
  });

  test("merges per-modality overrides over defaults", () => {
    const copy = resolveExplainerStrings("fingerprint", {
      fingerprint: { title: "Custom title" },
    });
    expect(copy.title).toBe("Custom title");
    expect(copy.body).toBe(DEFAULT_EXPLAINER_STRINGS.fingerprint.body);
  });

  test("falls back to unknown defaults when no modality entry exists", () => {
    const copy = resolveExplainerStrings("other", undefined);
    expect(copy.title).toBe(DEFAULT_EXPLAINER_STRINGS.other.title);
  });
});
