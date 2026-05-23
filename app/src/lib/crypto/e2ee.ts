"use client";

import sodium from "libsodium-wrappers";

let ready: Promise<typeof sodium> | null = null;

export async function getSodium() {
  if (!ready) {
    ready = sodium.ready.then(() => sodium);
  }
  return ready;
}

export interface MasterKeyBundle {
  masterKey: Uint8Array;
  saltB64: string;
  paramsB64: string;
}

export async function deriveMasterKey(
  password: string,
  saltB64?: string,
): Promise<MasterKeyBundle> {
  const s = await getSodium();
  const salt = saltB64
    ? s.from_base64(saltB64, s.base64_variants.ORIGINAL)
    : s.randombytes_buf(s.crypto_pwhash_SALTBYTES);
  const masterKey = s.crypto_pwhash(
    32,
    password,
    salt,
    s.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    s.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    s.crypto_pwhash_ALG_ARGON2ID13,
  );
  return {
    masterKey,
    saltB64: s.to_base64(salt, s.base64_variants.ORIGINAL),
    paramsB64: JSON.stringify({ alg: "argon2id", ops: "interactive", mem: "interactive" }),
  };
}

export interface EncryptedBlob {
  ct: string; // base64
  nonce: string; // base64
}

export async function encryptString(plain: string, key: Uint8Array): Promise<EncryptedBlob> {
  const s = await getSodium();
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const ct = s.crypto_secretbox_easy(s.from_string(plain), nonce, key);
  return {
    ct: s.to_base64(ct, s.base64_variants.ORIGINAL),
    nonce: s.to_base64(nonce, s.base64_variants.ORIGINAL),
  };
}

export async function decryptString(blob: EncryptedBlob, key: Uint8Array): Promise<string> {
  const s = await getSodium();
  const ct = s.from_base64(blob.ct, s.base64_variants.ORIGINAL);
  const nonce = s.from_base64(blob.nonce, s.base64_variants.ORIGINAL);
  const plain = s.crypto_secretbox_open_easy(ct, nonce, key);
  return s.to_string(plain);
}

export async function generateKeyPair() {
  const s = await getSodium();
  const kp = s.crypto_box_keypair();
  return {
    publicKey: s.to_base64(kp.publicKey, s.base64_variants.ORIGINAL),
    secretKey: s.to_base64(kp.privateKey, s.base64_variants.ORIGINAL),
  };
}

export async function fingerprintKey(b64: string): Promise<string> {
  const s = await getSodium();
  const bytes = s.from_base64(b64, s.base64_variants.ORIGINAL);
  const hash = s.crypto_generichash(8, bytes, null);
  return Array.from(hash as Uint8Array, (b: number) => b.toString(16).padStart(2, "0")).join(":");
}
