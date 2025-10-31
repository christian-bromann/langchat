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
              } else {
                // Check data structure to determine event type
                eventType = determineEventTypeFromPayload(payload);
                eventData = payload;
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
              } else {
                // Check data structure to determine event type
                eventType = determineEventTypeFromPayload(payload);
                eventData = payload;
              }
            } else if (updateType === "messages" && Array.isArray(payload)) {
              // Check if it's a chunk update (array of [AIMessageChunk, LangGraphMetadata])
              if (payload.length === 2 && payload[0]?.lc === 1 && payload[1]?.langgraph_node) {
                eventType = "model_request";
                eventData = { model_request: { messages: [payload[0]], _privateState: {} as any } };
              } else {
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
            } else {
              // For other update types, check data structure
              if (typeof payload === "object" && payload !== null) {
                eventType = determineEventTypeFromPayload(payload);
                eventData = payload;
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

/**
 * Determines the event type based on the payload structure
 */
function determineEventTypeFromPayload(payload: unknown): EventType {
  if (typeof payload !== "object" || payload === null) {
    return "update";
  }

  const data = payload as Record<string, unknown>;
  const keys = Object.keys(data);

  // Check for agent_state: has "messages" key (and optionally "_privateState")
  if (keys.includes("messages") && Array.isArray(data.messages)) {
    return "agent_state";
  }

  // Check for model_request: single "model_request" key
  if (keys.length === 1 && keys[0] === "model_request" && data.model_request) {
    return "model_request";
  }

  // Check for tools: single "tools" key
  if (keys.length === 1 && keys[0] === "tools" && data.tools) {
    return "tools";
  }

  // Check for chunk update: array of [AIMessageChunk, LangGraphMetadata]
  if (Array.isArray(payload) && payload.length === 2) {
    const first = payload[0] as unknown;
    const second = payload[1] as unknown;
    if (
      typeof first === "object" &&
      first !== null &&
      "lc" in first &&
      typeof second === "object" &&
      second !== null &&
      "langgraph_node" in second
    ) {
      return "model_request";
    }
  }

  return "update";
}
