import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { submitLoginCode } from "@/lib/mtproto";

export const POST = withAuth(async (req: Request) => {
  try {
    const { code } = await req.json();
    if (typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ error: "Code is required." }, { status: 400 });
    }
    const result = await submitLoginCode(code.trim());
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, 400);
  }
});
