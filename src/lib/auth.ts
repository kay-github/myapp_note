import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { APP_CONFIG } from "@/lib/config";

const ADMIN_COOKIE = "qs_admin";

function sign(value: string): string {
  return createHmac("sha256", APP_CONFIG.sessionSecret).update(value).digest("hex");
}

function buildToken(payload: string): string {
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string): string | null {
  const splitIndex = token.lastIndexOf(".");
  if (splitIndex < 1) {
    return null;
  }

  const payload = token.slice(0, splitIndex);
  const signature = token.slice(splitIndex + 1);
  const expected = sign(payload);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }

  return payload;
}

function expiresAt(): number {
  const oneDayMs = 24 * 60 * 60 * 1000;
  return Date.now() + APP_CONFIG.sessionDays * oneDayMs;
}

export function spaceCookieName(slug: string): string {
  return `qs_space_${slug}`;
}

// 会话 cookie 绑定当前密码哈希的指纹：管理员改密后所有旧会话立即失效
function passwordFingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

export async function setSpaceSession(slug: string, passwordHash: string): Promise<void> {
  const store = await cookies();
  const payload = `${slug}:${expiresAt()}:${passwordFingerprint(passwordHash)}`;
  store.set(spaceCookieName(slug), buildToken(payload), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: APP_CONFIG.sessionDays * 24 * 60 * 60,
  });
}

export async function clearSpaceSession(slug: string): Promise<void> {
  const store = await cookies();
  store.delete(spaceCookieName(slug));
}

export async function canWriteWithSpaceCookie(slug: string, passwordHash: string | null): Promise<boolean> {
  if (!passwordHash) {
    return false;
  }

  const store = await cookies();
  const token = store.get(spaceCookieName(slug))?.value;
  if (!token) {
    return false;
  }

  const payload = verifyToken(token);
  if (!payload) {
    return false;
  }

  const [tokenSlug, expireText, fingerprint] = payload.split(":");
  const expire = Number(expireText);
  if (tokenSlug !== slug || Number.isNaN(expire) || expire < Date.now()) {
    return false;
  }

  // 指纹不匹配说明密码已被修改（或旧格式 cookie），要求重新验证
  if (fingerprint !== passwordFingerprint(passwordHash)) {
    return false;
  }

  return true;
}

export async function setAdminSession(): Promise<void> {
  const store = await cookies();
  const payload = `admin:${expiresAt()}`;
  store.set(ADMIN_COOKIE, buildToken(payload), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: APP_CONFIG.sessionDays * 24 * 60 * 60,
  });
}

export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

export async function isAdminAuthed(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) {
    return false;
  }

  const payload = verifyToken(token);
  if (!payload) {
    return false;
  }

  const [name, expireText] = payload.split(":");
  const expire = Number(expireText);
  return name === "admin" && !Number.isNaN(expire) && expire > Date.now();
}
