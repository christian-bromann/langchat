import { z } from "zod";
import { createAgent, HumanMessage, tool } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";

const customers = {
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
}

/**
 * Basic agent with no tools, no middleware - just uses a model
 */
export async function basicAgent(options: { message: string; apiKey: string; model?: string }) {
  const modelName = options.model ?? "claude-sonnet-4-5";

  // Create the Anthropic model instance with user-provided API key
  const model = new ChatAnthropic({
    model: modelName,
    apiKey: options.apiKey,
  });

  // Initialize the conversation with just the user message
  const initialState = {
    messages: [new HumanMessage(options.message)],
  };

  const getCustomerInformationTool = tool(
    async (input: { customerId: string }) => {
      return customers[input.customerId as keyof typeof customers];
    },
    {
      name: "get_customer_information",
      description: "Get information about a customer",
      schema: z.object({
        customerId: z.string(),
      }),
    }
  );

  const agent = createAgent({
    model,
    tools: [getCustomerInformationTool],
    systemPrompt: "You are a helpful assistant that can get information about customers.",
  });

  const stream = await agent.stream(initialState, {
    encoding: "text/event-stream",
    streamMode: ["values", "updates", "messages"],
    recursionLimit: 10,
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

