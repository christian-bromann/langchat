/* eslint-disable @typescript-eslint/no-explicit-any */
import type { IterableReadableStream } from "@langchain/core/utils/stream";
import type { EventType } from "@/app/types";

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

export function streamResponse (agentStream: IterableReadableStream<any>, customHeaders?: Record<string, string>) {
  // Set up headers for SSE
  const headers = new Headers({
    ...{
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
    ...customHeaders,
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
            let eventType: EventType = "update";
            let eventData = payload;

            // Check for interrupts (human-in-the-loop pauses)
            // Interrupts come in "values" updates with __interrupt__ field
            // Format: {"__interrupt__": [{"id": "...", "value": {"actionRequests": [...], "reviewConfigs": [...]}}]}
            if (updateType === "interrupt") {
              eventType = "interrupt";
              // payload is an array of interrupt objects
              if (Array.isArray(payload) && payload.length > 0) {
                const interruptValue = payload[0];
                if (interruptValue?.value?.actionRequests) {
                  eventData = {
                    action_requests: interruptValue.value.actionRequests.map((ar: { name: string; args: Record<string, unknown> }) => ({
                      name: ar.name,
                      args: ar.args,
                    })),
                    review_configs: interruptValue.value.reviewConfigs || [],
                  };
                } else {
                  eventData = interruptValue;
                }
              } else {
                eventData = payload;
              }
            } else if (updateType === "values" && typeof payload === "object" && payload !== null) {
              const values = payload as { __interrupt__?: unknown; [key: string]: unknown };

              // Check for interrupt marker in values
              if (values.__interrupt__) {
                eventType = "interrupt";
                const interruptArray = values.__interrupt__ as Array<{
                  id?: string;
                  value?: {
                    actionRequests?: Array<{ name: string; args: Record<string, unknown>; description?: string }>;
                    reviewConfigs?: Array<{ actionName: string; allowedDecisions?: string[] }>;
                  };
                }>;

                // Extract action requests from interrupt
                if (interruptArray && interruptArray.length > 0 && interruptArray[0]?.value?.actionRequests) {
                  eventData = {
                    action_requests: interruptArray[0].value.actionRequests.map((ar) => ({
                      name: ar.name,
                      args: ar.args,
                      description: ar.description,
                    })),
                    review_configs: interruptArray[0].value.reviewConfigs || [],
                  };
                } else {
                  eventData = values.__interrupt__;
                }
              }
            } else if (updateType === "updates" && typeof payload === "object" && payload !== null) {
              const updates = payload as LangChainUpdate;

              // Check for interrupt marker in updates
              if (updates.__interrupt__) {
                eventType = "interrupt";
                const interruptArray = updates.__interrupt__ as Array<{
                  id?: string;
                  value?: {
                    actionRequests?: Array<{ name: string; args: Record<string, unknown>; description?: string }>;
                    reviewConfigs?: Array<{ actionName: string; allowedDecisions?: string[] }>;
                  };
                }>;

                // Extract action requests from interrupt
                if (interruptArray && interruptArray.length > 0 && interruptArray[0]?.value?.actionRequests) {
                  eventData = {
                    action_requests: interruptArray[0].value.actionRequests.map((ar) => ({
                      name: ar.name,
                      args: ar.args,
                      description: ar.description,
                    })),
                    review_configs: interruptArray[0].value.reviewConfigs || [],
                  };
                } else {
                  eventData = updates.__interrupt__;
                }
              } else if (updates.agent && updates.agent.messages) {
                // Filter to only AI messages
                const filteredAiMessages = updates.agent.messages.filter((msg: LangChainMessage) => {
                  return (
                    msg.lc === 1 &&
                    msg.id &&
                    msg.id[0] === "langchain_core" &&
                    msg.id[1] === "messages" &&
                    (msg.id[2] === "AIMessageChunk" || msg.id[2] === "AIMessage")
                  );
                });

                if (filteredAiMessages.length > 0) {
                  eventType = "agent";
                  eventData = { messages: filteredAiMessages };
                }
              }
            } else if (updateType === "messages" && Array.isArray(payload)) {
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
}
