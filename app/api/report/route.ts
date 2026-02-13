import { NextResponse } from "next/server";
import { reportRequestSchema } from "@/lib/schemas";
import { runTwoPhaseReport } from "@/lib/openai";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { decrementCredit, getUserAccess } from "@/lib/subscription";

export async function POST(request: Request) {
  try {
    const body = reportRequestSchema.parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await getUserAccess(data.user.id);
    if (!access.active) {
      return NextResponse.json({ error: "Subscription inactive" }, { status: 403 });
    }
    if (access.credits <= 0) {
      return NextResponse.json({ error: "No credits remaining" }, { status: 402 });
    }

    const report = await runTwoPhaseReport(body.premise, body.styleId);
    await decrementCredit(data.user.id);

    return NextResponse.json({ report });
  } catch (error) {
    console.error("report_error", error);
    const message = error instanceof Error ? error.message : "Failed to generate report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
