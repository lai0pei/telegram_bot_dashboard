import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getChatById, regenerateInviteLink } from "@/lib/chats";

/** POST: revokes the primary invite link and issues a new one. */
export const POST = withAuth(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }, userId: string) => {
    try {
      const { id } = await ctx.params;
      const chat = await getChatById(Number(id), userId);
      if (!chat) return NextResponse.json({ error: "Chat not found." }, { status: 404 });

      const inviteLink = await regenerateInviteLink(userId, chat);
      return NextResponse.json({ ok: true, inviteLink });
    } catch (err) {
      return errorResponse(err, 400);
    }
  }
);
