import { z } from "zod";
import { createAgent, HumanMessage, tool, humanInTheLoopMiddleware } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";
import { Command } from "@langchain/langgraph";

import { checkpointer } from "@/app/utils";

const ADDRESS_BOOK = {
  "1234567890": {
    name: "John Doe",
    email: "john.doe@example.com",
    phone: "+1 234-567-8900",
  },
  "1234567891": {
    name: "Jane Doe",
    email: "jane.doe@example.com",
    phone: "+1 234-567-8901",
  },
  "1234567892": {
    name: "Jim Doe",
    email: "jim.doe@example.com",
    phone: "+1 234-567-8902",
  },
};

export async function hitlAgent(options: {
  message: string;
  apiKey: string;
  threadId?: string;
  interruptResponse?: {
    decisions: Array<{
      type: "approve" | "reject" | "edit";
      editedAction?: { name: string; args: Record<string, unknown> };
      message?: string;
    }>;
  };
  model?: string;
}) {
  const modelName = options.model ?? "claude-3-7-sonnet-latest";

  // Create the Anthropic model instance with user-provided API key
  const model = new ChatAnthropic({
    model: modelName,
    apiKey: options.apiKey,
  });

  // Create email tools
  const getUserEmail = tool(
    async (input) => {
      return ADDRESS_BOOK[input.user_id as keyof typeof ADDRESS_BOOK];
    },
    {
      name: "get_user_email",
      description: "Get the email address of a user",
      schema: z.object({
        user_id: z.string(),
      }),
    }
  );

  const sendEmailTool = tool(
    async (input) => {
      // In a real implementation, this would send the email
      // For now, we just return a success message
      return {
        success: true,
        message: `Email sent successfully to ${input.recipient}`,
        email: input,
      };
    },
    {
      name: "send_email",
      description: "Send an email to someone. This requires human approval before executing.",
      schema: z.object({
        recipient: z.string(),
        subject: z.string(),
        body: z.string(),
      }),
    }
  );

  // Create agent with HITL middleware
  const agent = createAgent({
    model,
    tools: [getUserEmail, sendEmailTool],
    middleware: [
      humanInTheLoopMiddleware({
        interruptOn: {
          // Require approval for sending emails
          send_email: {
            allowedDecisions: ["approve", "edit", "reject"],
          },
          // Auto-approve writing emails (drafting)
          write_email: false,
        },
      }),
    ],
    checkpointer,
  });

  // Get or create thread ID
  const threadId = options.threadId || `thread-${Date.now()}`;
  const config = { configurable: { thread_id: threadId } };
  const initialState = options.interruptResponse ? new Command({
    resume: {
      decisions: options.interruptResponse.decisions,
    },
  }) : {
    messages: [new HumanMessage(options.message)],
  };

  // Stream with thread ID for state persistence
  return agent.stream(initialState, {
    ...config,
    streamMode: ["values", "updates", "messages"],
    recursionLimit: 10,
  });
}

