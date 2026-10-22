import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import { oauthCallback } from "../packages/mcp-client/src/oauth-callback.js";
describe("native OAuth callback correlation", () => {
  it("accepts one exactly correlated callback without exposing credentials in errors", () => {
    const redirect = new URL("http://127.0.0.1:49494/oauth/callback"),
      url = new URL(redirect),
      state = randomUUID();
    url.search = new URLSearchParams({
      state,
      code: "synthetic-code",
      iss: "https://relay.localhost:18443/api/auth",
    }).toString();
    expect(oauthCallback(url, redirect, state).get("code")).toBe(
      "synthetic-code",
    );
    for (const change of [
      "state=wrong&code=secret&iss=issuer",
      `state=${state}&state=duplicate&code=secret&iss=issuer`,
      `state=${state}&code=secret&code=duplicate&iss=issuer`,
      `state=${state}&code=secret&error=denied&iss=issuer`,
    ]) {
      const bad = new URL(redirect);
      bad.search = change;
      expect(() => oauthCallback(bad, redirect, state)).toThrow(
        /^OAUTH_CALLBACK_REJECTED$/,
      );
    }
  });
  it("rejects an unregistered path or origin before code redemption", () => {
    const redirect = new URL("http://127.0.0.1:49494/oauth/callback");
    for (const target of [
      "http://127.0.0.1:49495/oauth/callback",
      "http://localhost:49494/oauth/callback",
      "http://127.0.0.1:49494/elsewhere",
    ]) {
      const url = new URL(target);
      url.search = "state=s&code=c&iss=i";
      expect(() => oauthCallback(url, redirect, "s")).toThrow(
        "OAUTH_CALLBACK_REJECTED",
      );
    }
  });
});
