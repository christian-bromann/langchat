import { z } from "zod";
import { createAgent, HumanMessage, tool, modelFallbackMiddleware } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";

import { checkpointer } from "@/app/utils";

/**
 * Creates a mocked fetch function that simulates random network request errors
 * This demonstrates the model fallback middleware by causing the primary model to fail
 */
function createMockedFetch(threadId: string, failureRate: number): typeof fetch {
  return async (input, init?) => {
    const shouldFail = Math.random() < failureRate;

    if (shouldFail) {
      // Simulate network delay before failure
      await new Promise(resolve => setTimeout(resolve, 100));

      // Return error responses instead of throwing
      // This simulates real API error responses
      const errorScenarios = [
        {
          status: 429,
          statusText: "Too Many Requests",
          message: "Rate limit exceeded. Please try again later.",
        },
        {
          status: 503,
          statusText: "Service Unavailable",
          message: "Service temporarily unavailable. Please try again later.",
        },
        {
          status: 500,
          statusText: "Internal Server Error",
          message: "Connection timeout. Please try again later.",
        },
      ];

      const errorScenario = errorScenarios[Math.floor(Math.random() * errorScenarios.length)];

      // Return an error Response object
      return new Response(
        JSON.stringify({
          error: {
            type: "error",
            message: errorScenario.message,
          },
        }),
        {
          status: errorScenario.status,
          statusText: errorScenario.statusText,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Otherwise, use the real fetch
    return fetch(input, init);
  };
}

/**
 * Simulated product database
 */
const PRODUCTS = {
  "laptop": {
    name: "Premium Laptop Pro",
    price: 1299.99,
    stock: 45,
    category: "Electronics",
    description: "High-performance laptop with 16GB RAM and 512GB SSD",
  },
  "phone": {
    name: "SmartPhone X",
    price: 899.99,
    stock: 120,
    category: "Electronics",
    description: "Latest smartphone with advanced camera and AI features",
  },
  "headphones": {
    name: "Wireless Headphones Pro",
    price: 249.99,
    stock: 78,
    category: "Audio",
    description: "Noise-cancelling wireless headphones with 30-hour battery",
  },
  "tablet": {
    name: "Tablet Plus",
    price: 599.99,
    stock: 32,
    category: "Electronics",
    description: "10-inch tablet with stylus support and long battery life",
  },
};

/**
 * Model Fallback Middleware Agent - demonstrates automatic model fallback on errors
 *
 * Scenario: E-commerce product assistant that uses model fallback middleware.
 * The model fallback middleware automatically retries failed model calls with
 * alternative models in sequence, ensuring reliability even when primary models
 * experience issues like rate limiting, temporary unavailability, or errors.
 *
 * In production, failures would occur naturally from API errors. The middleware
 * handles these failures transparently by switching to fallback models.
 *
 * This demonstrates:
 * - Automatic fallback to alternative models on failure
 * - Seamless switching between different models
 * - Resilience to model-specific errors
 * - Real-world reliability patterns for production systems
 */
export async function modelFallbackAgent(options: {
  message: string;
  apiKey: string;
  threadId?: string;
}) {
  const modelOptions = {
    apiKey: options.apiKey,
    maxRetries: 0,
  }

  // Primary model - this is what will be used first
  // Uses mocked fetch to simulate network failures, demonstrating fallback behavior
  const primaryModel = new ChatAnthropic({
    model: "claude-sonnet-4-5",
    clientOptions: { fetch: createMockedFetch(options.threadId!, 0.9) },
    ...modelOptions,
  });

  const secondaryModel = new ChatAnthropic({
    model: "claude-opus-4-1",
    clientOptions: { fetch: createMockedFetch(options.threadId!, 0.5) },
    ...modelOptions,
  });

  const tertiaryModel = new ChatAnthropic({
    model: "claude-sonnet-4-0",
    clientOptions: { fetch: createMockedFetch(options.threadId!, 0.05) },
    ...modelOptions,
  });

  // Product search tool
  const searchProducts = tool(
    async (input: { query: string }) => {
      const queryLower = input.query.toLowerCase();
      const results = Object.entries(PRODUCTS)
        .filter(([key, product]) =>
          product.name.toLowerCase().includes(queryLower) ||
          product.category.toLowerCase().includes(queryLower) ||
          key.includes(queryLower)
        )
        .map(([key, product]) => ({
          id: key,
          ...product,
        }));

      return {
        query: input.query,
        results,
        count: results.length,
      };
    },
    {
      name: "search_products",
      description: "Search for products by name, category, or keyword. Returns matching products with details.",
      schema: z.object({
        query: z.string().describe("The search query to find products"),
      }),
    }
  );

  // Create agent with model fallback middleware
  // Configured to fallback to alternative models if primary fails
  const agent = createAgent({
    model: primaryModel,
    tools: [searchProducts],
    middleware: [
      modelFallbackMiddleware(
        secondaryModel,
        tertiaryModel,
      ),
    ],
    checkpointer,
    systemPrompt: "You are a helpful e-commerce assistant. Help users find products, compare options, and answer questions about inventory and pricing. Be friendly and concise.",
  });

  const stream = await agent.stream({
    messages: [new HumanMessage(options.message)],
  }, {
    encoding: "text/event-stream",
    streamMode: ["values", "updates", "messages"],
    recursionLimit: 50,
    configurable: { thread_id: options.threadId },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

