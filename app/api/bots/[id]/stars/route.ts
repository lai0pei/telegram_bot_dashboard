import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApi, type StarTransaction } from "@/lib/botapi";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { getBotById, withLiveBotToken } from "@/lib/bots";

const PAGE = 100;
// getStarTransactions pages from the oldest transaction, so reaching the newest means walking every page. Bounded so
// a bot with a huge history can't turn one request into dozens of API calls.
const MAX_PAGES = 10;
const SHOWN = 100;

/** GET: the bot's Stars balance plus its most recent transactions, newest first. */
export const GET = withAuth(async (_req: Request, ctx: { params: Promise<{ id: string }> }, telegramAccountId: string) => {
  try {
    const bot = getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

    const { result } = await withLiveBotToken(bot, telegramAccountId, async (token) => {
      const balance = await botApi.getMyStarBalance(token);
      const all: StarTransaction[] = [];
      let truncated = false;
      for (let page = 0; ; page++) {
        const { transactions } = await botApi.getStarTransactions(token, page * PAGE, PAGE);
        all.push(...transactions);
        if (transactions.length < PAGE) break;
        if (page + 1 >= MAX_PAGES) {
          truncated = true;
          break;
        }
      }
      return { balance, all, truncated };
    });

    return NextResponse.json({
      balance: result.balance.amount,
      transactions: result.all.slice(-SHOWN).reverse(),
      // When the walk was cut short the list ends at transaction 1000, not at the newest one.
      truncated: result.truncated,
    });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});
