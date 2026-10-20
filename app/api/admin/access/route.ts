import { NextResponse } from "next/server";
import { withAdmin, errorResponse } from "@/lib/api-guard";
import { adminActionErrorResponse, updateAccessSettings, type AccessPatch } from "@/lib/admin-actions";
import { getAccessSettings } from "@/lib/app-settings";
import { validateTelegramIdList } from "@/lib/validation";

/** GET: who may sign up and which Telegram accounts may be linked, with where each value comes from. Master admin only. */
export const GET = withAdmin(async () => {
  try {
    return NextResponse.json(await getAccessSettings());
  } catch (err) {
    return errorResponse(err);
  }
});

/**
 * PUT `{ registrationOpen?: boolean | null, allowlist?: { restrict: boolean, ids: string[] } | null }`.
 * A missing key is left alone; `null` removes the stored value so the environment's applies again. Audited.
 */
export const PUT = withAdmin(async (req: Request, _ctx, adminUserId: string) => {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Send a JSON object." }, { status: 400 });

    const patch: AccessPatch = {};
    if ("registrationOpen" in body) {
      if (body.registrationOpen !== null && typeof body.registrationOpen !== "boolean") {
        return NextResponse.json({ error: "`registrationOpen` must be true, false or null." }, { status: 400 });
      }
      patch.registrationOpen = body.registrationOpen;
    }
    if ("allowlist" in body) {
      const list = body.allowlist;
      if (list !== null) {
        if (typeof list !== "object" || typeof list.restrict !== "boolean") {
          return NextResponse.json({ error: "`allowlist` needs `restrict` (true/false) and `ids`." }, { status: 400 });
        }
        const invalid = validateTelegramIdList(list.ids);
        if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
        patch.allowlist = { restrict: list.restrict, ids: [...new Set((list.ids as string[]).map((id) => id.trim()))] };
      } else {
        patch.allowlist = null;
      }
    }
    await updateAccessSettings(adminUserId, patch);
    return NextResponse.json(await getAccessSettings());
  } catch (err) {
    return adminActionErrorResponse(err);
  }
});
