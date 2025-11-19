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
  const modelName = options.model ?? "claude-sonnet-4-5";

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
    middleware: [humanInTheLoopMiddleware({
      interruptOn: {
        send_email: true
      }
    })],
    checkpointer: checkpointer,
  });

  // Get or create thread ID
  const config = { configurable: { thread_id: options.threadId } };
  const initialState = options.interruptResponse ? new Command({
    resume: {
      decisions: options.interruptResponse.decisions,
    },
  }) : {
    messages: [new HumanMessage(options.message)],
  };

  // Stream with thread ID for state persistence
  const stream = await agent.stream(initialState, {
    encoding: "text/event-stream",
    ...config,
    streamMode: ["values", "updates", "messages"],
    recursionLimit: 10,
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

