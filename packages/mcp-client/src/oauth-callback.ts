import { createHash, timingSafeEqual } from "node:crypto";
// Native external-client integration helper. The official SDK validates issuer
// during finishAuth; the client owns callback state and redirect correlation.
export function oauthCallback(url: URL, redirect: URL, expectedState: string) {
  const q = url.searchParams,
    validState =
      q.getAll("state").length === 1 &&
      timingSafeEqual(
        createHash("sha256")
          .update(q.get("state") ?? "")
          .digest(),
        createHash("sha256").update(expectedState).digest(),
      );
  if (
    url.origin !== redirect.origin ||
    url.pathname !== redirect.pathname ||
    url.username ||
    url.password ||
    url.hash ||
    !expectedState ||
    !validState ||
    q.getAll("code").length > 1 ||
    q.getAll("iss").length !== 1 ||
    q.getAll("error").length > 1 ||
    Boolean(q.get("code")) === Boolean(q.get("error"))
  )
    throw new Error("OAUTH_CALLBACK_REJECTED");
  return q;
}
