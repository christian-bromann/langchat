import { NextRequest } from "next/server";
import type { HITLResponse } from "langchain";

import { hitlAgent } from "@/app/agents/hitl";
import { streamResponse } from "../utils";

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { message, apiKey, threadId, interruptResponse } = body;

    // Message is only required if not resuming from an interrupt
    if (!interruptResponse && !message) {
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

    const agentStream = await hitlAgent({
      message,
      apiKey,
      threadId,
      interruptResponse: parseInterruptResponse(interruptResponse),
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

/**
 * Parses the interrupt response into a format expected by Command
 * @param interruptResponse - The interrupt response to parse
 * @returns The parsed interrupt response
 */
function parseInterruptResponse(interruptResponse?: string): HITLResponse | undefined {
  if (!interruptResponse) {
    return undefined
  };

  let interruptResponseObj: HITLResponse | undefined;
  try {
    const parsed = typeof interruptResponse === "string"
      ? JSON.parse(interruptResponse)
      : interruptResponse;

    // Convert to the format expected by Command
    // If it's a simple format, convert to decisions array
    if (parsed.action) {
      const decisions = [{
        type: parsed.action,
        ...(parsed.action === "edit" && parsed.args ? {
          editedAction: {
            name: parsed.tool || "send_email",
            args: parsed.args,
          },
        } : {}),
        ...(parsed.action === "reject" && parsed.message ? {
          message: parsed.message,
        } : {}),
      }];
      interruptResponseObj = { decisions };
    } else if (parsed.decisions) {
      // Already in the correct format
      interruptResponseObj = { decisions: parsed.decisions };
    }

    return interruptResponseObj;
  } catch {
    // If parsing fails, ignore
  }
}
