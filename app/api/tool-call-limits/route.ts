import { NextRequest } from "next/server";
import { toolCallLimitsAgent } from "@/app/agents/tool-call-limits";
import { streamResponse } from "../utils";

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const {
      message,
      apiKey,
      threadId
    } = body;

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
    const agentStream = await toolCallLimitsAgent({
      message,
      apiKey,
      threadId,
    });

    return streamResponse(agentStream);
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

