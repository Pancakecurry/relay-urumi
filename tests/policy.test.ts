import { describe, expect, it } from "vitest";
import { toolDecision } from "../packages/auth/src/policy.js";

describe("workspace execution policy", () => {
  it("keeps an unconfigured existing workspace usable", () => {
    expect(toolDecision("allow", [])).toBe(true);
  });
  it("withholds new tools in an opt-in workspace until an allow matches", () => {
    expect(toolDecision("deny", [])).toBe(false);
    expect(toolDecision("deny", ["allow"])).toBe(true);
  });
  it("never lets an exception grant above an explicit denial", () => {
    expect(toolDecision("deny", ["deny", "allow"])).toBe(false);
    expect(toolDecision("allow", ["allow", "deny"])).toBe(false);
  });
});
