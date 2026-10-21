import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getBotById } from "@/lib/bots";
import { RULE_MEDIA_KINDS, type RuleMediaKind } from "@/lib/rule-content";
import { createRuleMedia, RuleMediaLimitError, validateRuleUpload } from "@/lib/rule-media";

/**
 * POST multipart { file, kind }: stores a file for use in this bot's rules and returns the reference to put in the rule
 * (`{ mediaId, kind, name }`). Nothing is sent to Telegram here; that happens the first time a rule uses it.
 * A file nobody ends up referencing is removed the next time any of this bot's rules is saved or deleted.
 */
export const POST = withAuth(async (req: Request, ctx: { params: Promise<{ id: string }> }, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    const kind = form?.get("kind");
    if (!(file instanceof File)) return NextResponse.json({ error: "A file is required." }, { status: 400 });
    if (typeof kind !== "string" || !RULE_MEDIA_KINDS.includes(kind as RuleMediaKind)) {
      return NextResponse.json({ error: "Choose what kind of attachment this is." }, { status: 400 });
    }
    const error = validateRuleUpload(kind as RuleMediaKind, file);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const row = await createRuleMedia(bot.id, kind as RuleMediaKind, { name: file.name, type: file.type, data: Buffer.from(await file.arrayBuffer()) });
    return NextResponse.json({ media: { mediaId: row.id, kind: row.kind, name: row.name } });
  } catch (err) {
    if (err instanceof RuleMediaLimitError) return NextResponse.json({ error: err.message }, { status: 422 });
    return errorResponse(err);
  }
});
