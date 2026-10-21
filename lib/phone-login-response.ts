import { NextResponse } from "next/server";
import { getLoginIdCookie, setLoginIdCookie } from "./auth";
import { loginStatusResponse } from "./login-response";
import { resendPhoneCode, startPhoneLogin, submitPhoneCode } from "./mtproto";
import { normalizePhoneNumber, validateLoginCode, validatePhoneNumber } from "./validation";

type Mode = "link" | "signin";

const NO_LOGIN = () => NextResponse.json({ error: "No login in progress. Start again." }, { status: 400 });

/**
 * Handler bodies for the phone-login routes, shared by app/api/login/phone/*
 * (sign-in, no dashboard user yet) and app/api/auth/phone/* (link, with the
 * caller's `ownerUserId`) the same way lib/login-response.ts is shared by the
 * QR routes. Auth and rate limits stay in the route files.
 */
export async function startPhoneResponse(body: unknown, mode: Mode, ownerUserId?: string): Promise<Response> {
  const raw = (body as { phone?: unknown } | null)?.phone;
  if (typeof raw !== "string") return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
  const invalid = validatePhoneNumber(raw);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const { loginId, isCodeViaApp } = await startPhoneLogin(mode, normalizePhoneNumber(raw), ownerUserId);
  await setLoginIdCookie(loginId);
  return NextResponse.json({ ok: true, isCodeViaApp });
}

export async function submitCodeResponse(body: unknown, mode: Mode, ownerUserId?: string): Promise<Response> {
  const code = (body as { code?: unknown } | null)?.code;
  if (typeof code !== "string") return NextResponse.json({ error: "Code is required." }, { status: 400 });
  const invalid = validateLoginCode(code);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const loginId = await getLoginIdCookie();
  if (!loginId) return NO_LOGIN();

  return loginStatusResponse(await submitPhoneCode(loginId, code.trim(), mode, ownerUserId));
}

export async function resendCodeResponse(mode: Mode, ownerUserId?: string): Promise<Response> {
  const loginId = await getLoginIdCookie();
  if (!loginId) return NO_LOGIN();
  const { isCodeViaApp } = await resendPhoneCode(loginId, mode, ownerUserId);
  return NextResponse.json({ ok: true, isCodeViaApp });
}
