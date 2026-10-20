import { NextResponse } from "next/server";
import { errorResponse, withAdmin } from "@/lib/api-guard";
import { listAdminActions } from "@/lib/admin-actions";

/** GET: the most recent admin actions (sign-outs, suspensions, deletions), newest first. Master admin only. */
export const GET = withAdmin(async () => {
  try {
    return NextResponse.json({ actions: await listAdminActions() });
  } catch (err) {
    return errorResponse(err);
  }
});
