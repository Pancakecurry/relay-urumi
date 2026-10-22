import { describe, it, expect } from "vitest";
import { keyring, seal, unseal } from "../packages/auth/src/sealed.js";
const r = keyring({ active: "v1", keys: { v1: "11".repeat(32) } });
describe("authenticated credential envelopes", () => {
  it("uses independent nonces, authenticates scope and rejects tampering", () => {
    const value = { Authorization: "Bearer synthetic-unit-only" },
      a = seal(value, "team-a", "ref-a", r),
      b = seal(value, "team-a", "ref-a", r);
    expect(a.iv).not.toBe(b.iv);
    expect(JSON.stringify(a)).not.toContain(value.Authorization);
    expect(unseal(a, "team-a", "ref-a", r)).toEqual(value);
    for (const [team, ref] of [
      ["team-b", "ref-a"],
      ["team-a", "ref-b"],
    ])
      expect(() => unseal(a, team!, ref!, r)).toThrow();
    expect(() =>
      unseal({ ...a, tag: "00".repeat(16) }, "team-a", "ref-a", r),
    ).toThrow();
  });
  it("supports explicit overlap then refuses a retired key", () => {
    const a = seal({ secret: "old" }, "t", "r", r),
      overlap = keyring({
        active: "v2",
        keys: { ...r.keys, v2: "22".repeat(32) },
      });
    expect(unseal(a, "t", "r", overlap)).toEqual({ secret: "old" });
    const b = seal(unseal(a, "t", "r", overlap), "t", "r", overlap),
      retired = keyring({ active: "v2", keys: { v2: "22".repeat(32) } });
    expect(unseal(b, "t", "r", retired)).toEqual({ secret: "old" });
    expect(() => unseal(a, "t", "r", retired)).toThrow(
      "CREDENTIAL_KEY_UNAVAILABLE",
    );
  });
});
