// lib/server/reqid.ts
// Minimal, collision-resistant request id (URL-safe, 16 chars)

export function genRequestId(size = 16): string {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-";
  const bytes = new Uint8Array(size);
  // @ts-ignore - crypto exists in Node and browsers
  (globalThis.crypto || require("crypto").webcrypto).getRandomValues(bytes);
  let id = "";
  for (let i = 0; i < size; i++) id += alphabet[bytes[i] % alphabet.length];
  return id;
}