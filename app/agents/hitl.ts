import { z } from "zod";
import { createAgent, HumanMessage, tool, humanInTheLoopMiddleware } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";
import { Command } from "@langchain/langgraph";
import type { HITLResponse } from "langchain";

import { checkpointer } from "@/app/utils";

const USERS = {
  "sarahchen": {
    name: "Sarah Chen",
    email: "sarah.chen@acme.com",
    type: "customer"
  },
  "mrodriguez": {
    name: "Michael Rodriguez",
    email: "m.rodriguez@techcorp.io",
    type: "customer"
  },
  "emilyj": {
    name: "Emily Johnson",
    email: "emily.j@partners.com",
    type: "premium_customer"
  },
};

export async function hitlAgent(options: {
  message: string;
  apiKey: string;
  threadId?: string;
  interruptResponse?: HITLResponse;
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
      return USERS[input.username as keyof typeof USERS];
    },
    {
      name: "get_user_email",
      description: "Get the email address of a user",
      schema: z.object({
        username: z.string(),
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
          send_email: (toolCall) => {
            const user = Object.values(USERS).find(
              (contact) => contact.email === toolCall.args.recipient);

            /**
             * Premium customers require human review before sending
             */
            if (!user || user.type === "premium_customer") {
              return {
                allowedDecisions: ["approve", "edit", "reject"],
              }
            }

            /**
             * Regular customers can be auto-approved
             */
            return false;
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

