import { createAgent, HumanMessage, openAIModerationMiddleware } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";

/**
 * Basic agent with no tools, no middleware - just uses a model
 */
export async function moderationAgent(options: { message: string; apiKey: string }) {
  // Create the Anthropic model instance with user-provided API key
  const model = new ChatAnthropic({
    model: "claude-sonnet-4-5",
    apiKey: options.apiKey,
  });

  // Initialize the conversation with just the user message
  const initialState = {
    messages: [new HumanMessage(options.message)],
  };

  const agent = createAgent({
    model,
    middleware: [openAIModerationMiddleware({
      model: new ChatOpenAI({
        model: "gpt-4o-mini",
        apiKey: process.env.OPENAI_API_KEY,
      }),
      checkInput: true,
      checkOutput: true,
      checkToolResults: false,
      exitBehavior: "error",
      violationMessage: "Content flagged as inappropriate.",
    })],
    systemPrompt: "You are a helpful assistant.",
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

