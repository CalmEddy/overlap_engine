import { NextResponse } from "next/server";
import { reportRequestSchema } from "@/lib/schemas";
import { runTwoPhaseReport } from "@/lib/openai";

export async function POST(request: Request) {
  try {
    const body = reportRequestSchema.parse(await request.json());
    
    // Auth and credit checks temporarily disabled for development
    // In production, these should be re-enabled

    const report = await runTwoPhaseReport(body.premise, body.styleId);

    return NextResponse.json({ report });
  } catch (error) {
    console.error("report_error", error);
    
    // Provide more detailed error messages
    let message = "Failed to generate report";
    if (error instanceof Error) {
      message = error.message;
      // Log full error for debugging
      console.error("Full error details:", {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
    
    return NextResponse.json({ 
      error: message,
      // Include error type in development
      ...(process.env.NODE_ENV === "development" && error instanceof Error ? {
        details: error.stack
      } : {})
    }, { status: 500 });
  }
}
