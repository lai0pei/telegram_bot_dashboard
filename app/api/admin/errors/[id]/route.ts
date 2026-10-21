import { NextResponse } from "next/server";
import { errorResponse, withAdmin } from "@/lib/api-guard";
import { setErrorResolved } from "@/lib/error-log";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH `{ resolved: boolean }`: marks an error resolved (it reopens by itself if it happens again) or open. Master admin only. */
export const PATCH = withAdmin(async (req: Request, ctx: Ctx) => {
  try {
    const id = Number((await ctx.params).id);
    const body = await req.json().catch(() => null);
    if (!Number.isInteger(id) || typeof body?.resolved !== "boolean") {
      return NextResponse.json({ error: "Send `resolved` as true or false." }, { status: 400 });
    }
    if (!(await setErrorResolved(id, body.resolved))) {
      return NextResponse.json({ error: "Error not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
