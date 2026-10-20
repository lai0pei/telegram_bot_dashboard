import { NextResponse } from "next/server";
import { errorResponse, withAdmin } from "@/lib/api-guard";
import { getAdminUsersOverview } from "@/lib/admin-users";

/** GET: every dashboard user with their linked accounts and usage counts, plus totals. Master admin only; read-only. */
export const GET = withAdmin(async () => {
  try {
    return NextResponse.json(await getAdminUsersOverview());
  } catch (err) {
    return errorResponse(err);
  }
});
