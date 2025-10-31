import { createAgent, HumanMessage, tool, humanInTheLoopMiddleware } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";
import { Command } from "@langchain/langgraph";
import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";

/**
 * Human-in-the-Loop agent with email tools that require approval
 */
// Shared checkpointer instance using Redis
let checkpointer: RedisSaver | null = null;

async function getCheckpointer() {
  if (!checkpointer) {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      throw new Error("REDIS_URL is not set as an environment variable");
    }

    checkpointer = await RedisSaver.fromUrl(redisUrl, {
      defaultTTL: 60, // TTL in minutes
      refreshOnRead: true,
    });
  }
  return checkpointer;
}

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
  const writeEmailTool = tool(
    async (input: unknown) => {
      const { recipient, subject, body } = input as {
        recipient: string;
        subject: string;
        body: string;
      };
      return {
        success: true,
        draft: {
          recipient,
          subject,
          body,
        },
      };
    },
    {
      name: "write_email",
      description: "Draft an email to someone. Use this to compose the email content.",
      schema: {
        type: "object",
        properties: {
          recipient: {
            type: "string",
            description: "The email address of the recipient",
          },
          subject: {
            type: "string",
            description: "The subject line of the email",
          },
          body: {
            type: "string",
            description: "The body content of the email",
          },
        },
        required: ["recipient", "subject", "body"],
      },
    }
  );

  const sendEmailTool = tool(
    async (input: unknown) => {
      const { recipient, subject, body } = input as {
        recipient: string;
        subject: string;
        body: string;
      };
      // In a real implementation, this would send the email
      // For now, we just return a success message
      return {
        success: true,
        message: `Email sent successfully to ${recipient}`,
        email: {
          recipient,
          subject,
          body,
        },
      };
    },
    {
      name: "send_email",
      description: "Send an email to someone. This requires human approval before executing.",
      schema: {
        type: "object",
        properties: {
          recipient: {
            type: "string",
            description: "The email address of the recipient",
          },
          subject: {
            type: "string",
            description: "The subject line of the email",
          },
          body: {
            type: "string",
            description: "The body content of the email",
          },
        },
        required: ["recipient", "subject", "body"],
      },
    }
  );

  // Get checkpointer instance
  const checkpointerInstance = await getCheckpointer();

  // Create agent with HITL middleware
  const agent = createAgent({
    model,
    tools: [writeEmailTool, sendEmailTool],
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
    checkpointer: checkpointerInstance,
  });

  // Get or create thread ID
  const threadId = options.threadId || `thread-${Date.now()}`;
  const config = { configurable: { thread_id: threadId } };

  // If this is a response to an interrupt, use Command to resume
  if (options.interruptResponse) {
    // Resume from interrupt using Command
    return agent.stream(
      new Command({
        resume: {
          decisions: options.interruptResponse.decisions,
        },
      }),
      {
        ...config,
        streamMode: ["values", "updates", "messages"],
      }
    );
  }

  // Initialize the conversation
  const initialState = {
    messages: [new HumanMessage(options.message)],
  };

  // Stream with thread ID for state persistence
  return agent.stream(initialState, {
    ...config,
    streamMode: ["values", "updates", "messages"],
    recursionLimit: 10,
  });
}

