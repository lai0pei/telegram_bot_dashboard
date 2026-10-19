import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getClient, isLoggedIn } from "@/lib/mtproto";
import { Api } from "teleproto/tl";

export const GET = withAuth(async (_req, _ctx, userId) => {
  try {
    if (!isLoggedIn(userId)) {
      return NextResponse.json({ loggedIn: false });
    }
    const client = await getClient(userId);
    if (!client) return NextResponse.json({ loggedIn: false });

    const me = (await client.getMe()) as Api.User;
    return NextResponse.json({
      loggedIn: true,
      id: me.id.toString(),
      chatId: me.id.toString(),
      username: me.username ?? null,
      firstName: me.firstName ?? null,
      lastName: me.lastName ?? null,
      phone: me.phone ?? null,
      premium: me.premium ?? false,
    });
  } catch (err) {
    return errorResponse(err);
  }
});
