// Better Auth1.7.7 completes native revocation/family invalidation, then may
// return400 for an already-invalid token because its APIError.name check does
// not match the emitted error. RFC7009 requires successful no-op revocation.
// Only exact native invalid-token outcomes are normalized, after the provider
// has validated the client and performed its own state changes.
export async function revocationResponse(
  response: Response,
): Promise<Response> {
  if (response.status !== 400) return response;
  let data: unknown;
  try {
    data = await response.clone().json();
  } catch {
    return response;
  }
  if (!data || typeof data !== "object") return response;
  const error = data as { error?: unknown; error_description?: unknown };
  if (
    error.error !== "invalid_request" ||
    typeof error.error_description !== "string" ||
    ![
      "refresh token revoked",
      "token not found",
      "Invalid access token",
      "opaque access token not found",
    ].includes(error.error_description)
  )
    return response;
  const headers = new Headers(response.headers);
  headers.delete("content-type");
  headers.delete("content-length");
  return new Response(null, { status: 200, headers });
}
