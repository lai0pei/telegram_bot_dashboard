import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { logout } from "@/lib/mtproto";

export const POST = withAuth(async () => {
  try {
    await logout();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
