import { NextRequest } from "next/server";
import { basicAgent } from "@/app/agents/basic";

interface LangChainMessage {
  lc?: number;
  id?: string[];
  content?: string | Array<unknown>;
  [key: string]: unknown;
}

interface LangChainUpdate {
  agent?: {
    messages?: LangChainMessage[];
  };
  [key: string]: unknown;
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { message, apiKey } = body;

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
    const agentStream = await basicAgent({ message, apiKey });

    // Set up headers for SSE
    const headers = new Headers({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    // Create the SSE response
    return new Response(
      new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            for await (const update of agentStream) {
              // LangGraph streams yield [updateType, payload] arrays
              if (!Array.isArray(update) || update.length !== 2) {
                continue;
              }

              const [updateType, payload] = update;
              let eventType = "update";
              let eventData = payload;

              // Determine event type based on LangGraph update type
              if (updateType === "messages" && Array.isArray(payload)) {
                // Filter to only AI messages to avoid sending user messages back
                const aiMessages = payload.filter((msg: LangChainMessage) => {
                  return (
                    msg.lc === 1 &&
                    msg.id &&
                    msg.id[0] === "langchain_core" &&
                    msg.id[1] === "messages" &&
                    (msg.id[2] === "AIMessageChunk" || msg.id[2] === "AIMessage")
                  );
                });

                if (aiMessages.length > 0) {
                  eventType = "agent";
                  eventData = { messages: aiMessages };
                }
              } else if (updateType === "updates" && typeof payload === "object" && payload !== null) {
                // This is a consolidated update - check for agent
                const updates = payload as LangChainUpdate;
                if (updates.agent && updates.agent.messages) {
                  // Filter to only AI messages
                  const aiMessages = updates.agent.messages.filter((msg: LangChainMessage) => {
                    return (
                      msg.lc === 1 &&
                      msg.id &&
                      msg.id[0] === "langchain_core" &&
                      msg.id[1] === "messages" &&
                      (msg.id[2] === "AIMessageChunk" || msg.id[2] === "AIMessage")
                    );
                  });

                  if (aiMessages.length > 0) {
                    eventType = "agent";
                    eventData = { messages: aiMessages };
                  }
                }
              }

              // Send the event with proper SSE format
              controller.enqueue(encoder.encode(`event: ${eventType}\n`));
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`));
            }

            // Send completion event
            controller.enqueue(encoder.encode(`event: end\n`));
            controller.enqueue(encoder.encode(`data: {}\n\n`));
          } catch (error) {
            console.error("Error in agent stream:", error);
            // Send error event
            controller.enqueue(encoder.encode(`event: error\n`));
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  error: error instanceof Error ? error.message : "Unknown error occurred",
                })}\n\n`
              )
            );
          } finally {
            controller.close();
          }
        },
      }),
      { headers }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

