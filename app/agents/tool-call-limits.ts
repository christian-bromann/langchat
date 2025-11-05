import { z } from "zod";
import { createAgent, HumanMessage, tool, toolCallLimitMiddleware } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";

import { checkpointer } from "@/app/utils";

/**
 * SMS Sending Agent - demonstrates tool call limits with credit-based resource management
 *
 * Scenario: User has 2 SMS credits remaining. Each SMS costs 1 credit.
 * The agent can use compose_message freely, but send_sms is limited to 2 calls per thread.
 *
 * This demonstrates:
 * - Resource-aware agents (SMS credits)
 * - Tool call limit middleware preventing cost overruns
 * - Behavior adaptation when limits are reached
 * - Better UX through intelligent limit handling
 */
const PHONE_BOOK: Record<string, string> = {
  "mom": "(212) 555-1234",
  "sister": "(310) 555-7890",
  "alice": "(312) 555-4567",
  "dad": "(305) 555-2345",
  "uncle": "(206) 555-6789",
};

export async function toolCallLimitsAgent(options: {
  message: string;
  apiKey: string;
  smsThreadLimit?: number;
  smsRunLimit?: number;
  exitBehavior?: "end" | "error";
  model?: string;
  threadId?: string;
}) {
  const modelName = options.model ?? "claude-3-7-sonnet-latest";
  const smsThreadLimit = options.smsThreadLimit ?? 2;
  const smsRunLimit = options.smsRunLimit ?? 2;
  const exitBehavior = options.exitBehavior ?? "error";

  // Create the Anthropic model instance with user-provided API key
  const model = new ChatAnthropic({
    model: modelName,
    apiKey: options.apiKey,
  });

  const threadId = options.threadId || `thread-${Date.now()}`;

  // Send SMS tool - costs 1 credit per call
  const sendSms = tool(
    async (input: { recipient: string; message: string }) => {
      // Simulate SMS sending delay
      await new Promise(resolve => setTimeout(resolve, 100));

      const recipientKey = input.recipient.toLowerCase();
      const phoneNumber = PHONE_BOOK[recipientKey] || "Unknown";

      return {
        success: true,
        recipient: input.recipient,
        phoneNumber,
        message: input.message,
        status: "sent",
      };
    },
    {
      name: "send_sms",
      description: "Actually sends an SMS message to a recipient. Each call costs 1 credit. The user has a prepaid SMS balance with limited credits remaining.",
      schema: z.object({
        recipient: z.string().describe("The name or identifier of the recipient (e.g., 'mom', 'sister', 'Alice')"),
        message: z.string().describe("The message text to send"),
      }),
    }
  );

  // Create agent with SMS limiter
  const agent = createAgent({
    model,
    tools: [sendSms],
    middleware: [toolCallLimitMiddleware({
      toolName: "send_sms",
      threadLimit: smsThreadLimit,
      runLimit: smsRunLimit,
      exitBehavior,
    })],
    checkpointer,
  });

  // Initialize the conversation
  const initialState = {
    messages: [new HumanMessage(options.message)],
  };

  const stream = await agent.stream(initialState, {
    // @ts-expect-error - not yet updated
    encoding: "text/event-stream",
    streamMode: ["values", "updates", "messages"],
    recursionLimit: 50, // High recursion limit to allow many calls before hitting the middleware limit
    configurable: { thread_id: threadId },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

