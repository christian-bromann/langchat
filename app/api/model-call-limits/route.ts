import { NextRequest } from "next/server";
import { modelCallLimitsAgent } from "@/app/agents/model-call-limits";

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { message, apiKey, threadLimit, runLimit, exitBehavior, threadId } = body;

    if (!message) {
      return new Response(
        JSON.stringify({ error: "Missing message" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing API key" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get the agent stream
    return modelCallLimitsAgent({
      message,
      apiKey,
      threadLimit,
      runLimit,
      exitBehavior,
      threadId,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

