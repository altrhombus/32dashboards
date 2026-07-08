import argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "session";
const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12h

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function signSessionToken(secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key);
}

export async function verifySessionToken(secret: string, token: string): Promise<boolean> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    return payload.role === "admin";
  } catch {
    return false;
  }
}

export const SESSION_COOKIE_MAX_AGE_MS = SESSION_TTL_SECONDS * 1000;
