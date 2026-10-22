import { describe, it, expect } from "vitest";
import { revocationResponse } from "../packages/auth/src/oauth-revocation.js";
describe("native revocation HTTP compatibility", () => {
  it("normalizes only provider-confirmed invalid-token no-ops without altering token state", async () => {
    for (const error_description of [
      "refresh token revoked",
      "token not found",
      "Invalid access token",
      "opaque access token not found",
    ]) {
      const response = await revocationResponse(
        Response.json(
          { error: "invalid_request", error_description },
          {
            status: 400,
            headers: { "cache-control": "no-store", "content-length": "128" },
          },
        ),
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.has("content-length")).toBe(false);
    }
  });
  it("preserves wrong-client, malformed, unsupported and server failures", async () => {
    for (const [status, body] of [
      [401, { error: "invalid_client", error_description: "token not found" }],
      [
        400,
        {
          error: "unsupported_token_type",
          error_description: "token not found",
        },
      ],
      [
        400,
        {
          error: "invalid_request",
          error_description: "missing a required token for introspection",
        },
      ],
      [400, { error: "invalid_grant", error_description: "token not found" }],
      [500, { error: "invalid_request", error_description: "token not found" }],
    ] as const) {
      const response = Response.json(body, { status });
      expect(await revocationResponse(response)).toBe(response);
    }
    const malformed = new Response("not-json", { status: 400 });
    expect(await revocationResponse(malformed)).toBe(malformed);
  });
});
