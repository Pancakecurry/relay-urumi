import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import * as z from "zod/v4";
const keyringSchema = z
  .strictObject({
    active: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    keys: z.record(
      z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
      z.string().regex(/^[a-f0-9]{64}$/),
    ),
  })
  .refine((v) => Object.hasOwn(v.keys, v.active));
const envelopeSchema = z.strictObject({
  version: z.literal(1),
  keyId: z.string().max(64),
  iv: z.string().regex(/^[a-f0-9]{24}$/),
  tag: z.string().regex(/^[a-f0-9]{32}$/),
  ciphertext: z
    .string()
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
    .max(65536),
});
export type Keyring = z.infer<typeof keyringSchema>;
export type Envelope = z.infer<typeof envelopeSchema>;
export function keyring(value: unknown) {
  return keyringSchema.parse(value);
}
function aad(team: string, ref: string, keyId: string) {
  return Buffer.from(
    JSON.stringify(["relay-upstream-credential", 1, keyId, team, ref]),
  );
}
export function seal(
  value: unknown,
  team: string,
  ref: string,
  ring: Keyring,
): Envelope {
  const r = keyring(ring);
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(r.keys[r.active]!, "hex"),
    iv,
  );
  cipher.setAAD(aad(team, ref, r.active));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    version: 1,
    keyId: r.active,
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    ciphertext: ciphertext.toString("base64"),
  };
}
export function unseal(
  value: unknown,
  team: string,
  ref: string,
  ring: Keyring,
): unknown {
  const e = envelopeSchema.parse(value),
    r = keyring(ring);
  const key = r.keys[e.keyId];
  if (!key) throw new Error("CREDENTIAL_KEY_UNAVAILABLE");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    Buffer.from(e.iv, "hex"),
  );
  decipher.setAAD(aad(team, ref, e.keyId));
  decipher.setAuthTag(Buffer.from(e.tag, "hex"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(e.ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plain.toString("utf8")) as unknown;
}
