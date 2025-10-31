import { createAgent, HumanMessage } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";

/**
 * Basic agent with no tools, no middleware - just uses a model
 */
export async function basicAgent(options: { message: string; model?: string }) {
  const modelName = options.model ?? "claude-3-7-sonnet-latest";

  // Create the Anthropic model instance
  const model = new ChatAnthropic({
    model: modelName,
  });

  // Initialize the conversation with just the user message
  const initialState = {
    messages: [new HumanMessage(options.message)],
  };

  const agent = createAgent({
    model,
    // No tools, no middleware - just the model
  });

  return agent.stream(initialState, {
    streamMode: ["values", "updates", "messages"],
    recursionLimit: 10,
  });
}

