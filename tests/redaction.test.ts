import { describe, it, expect } from "vitest";
import { sanitize, schemaSafe } from "../apps/gateway/src/catalog.js";
describe("malicious upstream data", () => {
  it("redacts raw, quoted, URL and base64 credential echoes in nested data and keys", () => {
    const token = 'synthetic/credential:"one"?private=two',
      header = "Bearer " + token;
    const raw = {
      content: [
        {
          type: "text",
          text: [
            header,
            token,
            encodeURIComponent(header),
            Buffer.from(token).toString("base64"),
            Buffer.from(header).toString("base64url"),
          ].join(" "),
        },
      ],
      nested: { [token]: { value: token } },
    };
    const clean = sanitize(raw, { Authorization: header });
    expect(JSON.stringify(clean)).not.toContain("credential");
    expect(clean.content[0]!.text).toMatch(/redacted/);
    expect(Object.keys(clean.nested)).toContain("[redacted]");
    expect(raw.content[0]!.text).toContain(token);
  });
  it("rejects prototype-related schema keys instead of compiling them", () => {
    for (const key of ["__proto__", "constructor", "prototype"])
      expect(() =>
        schemaSafe(
          JSON.parse(
            JSON.stringify({
              type: "object",
              properties: { [key]: { type: "string" } },
            }),
          ),
        ),
      ).toThrow("SCHEMA_UNSUPPORTED");
  });
});
