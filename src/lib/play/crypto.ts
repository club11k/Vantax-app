// Cifrado simétrico AES-256-GCM para datos sensibles de Vantax Play (la
// contraseña investor de las cuentas MT5 y la contraseña de la cuenta de
// Myfxbook del jugador). Es el mismo esquema que usaba
// club11k/vantax-play-backend (src/services/crypto.js), portado a
// TypeScript con el módulo `crypto` nativo de Node — no hace falta ninguna
// dependencia nueva.
//
// La clave vive en la variable de entorno ENCRYPTION_KEY (32 bytes en
// base64, ej. generada con `openssl rand -base64 32`) y nunca se guarda
// junto a los datos cifrados.
//
// Formato guardado: "<iv_base64>:<authTag_base64>:<ciphertext_base64>"

import crypto from "node:crypto";

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("Falta ENCRYPTION_KEY en las variables de entorno (generá una con: openssl rand -base64 32)");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY debe decodificar a 32 bytes (usá: openssl rand -base64 32)");
  }
  return key;
}

export function encrypt(plainText: string | null | undefined): string | null {
  if (plainText == null || plainText === "") return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decrypt(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Formato de dato cifrado inválido");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}
