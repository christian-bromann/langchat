import { z } from "zod";
import { createAgent, HumanMessage, tool, modelCallLimitMiddleware } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";

import { checkpointer } from "@/app/utils";

/**
 * Model Call Limit agent - demonstrates limiting model calls
 * This agent has multiple tools that encourage many tool calls
 */

// Sample data that requires multiple tool calls to process
const ITEMS = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  name: `Item ${i + 1}`,
  value: (i + 1) * 10,
  category: i % 3 === 0 ? "A" : i % 3 === 1 ? "B" : "C",
}));

export async function modelCallLimitsAgent(options: {
  message: string;
  apiKey: string;
  threadLimit?: number;
  runLimit?: number;
  exitBehavior?: "throw" | "end";
  model?: string;
  threadId?: string;
}) {
  const modelName = options.model ?? "claude-3-7-sonnet-latest";
  const threadLimit = options.threadLimit ?? 30;
  const runLimit = options.runLimit ?? 20;
  const exitBehavior = options.exitBehavior ?? "throw" as const;

  // Create the Anthropic model instance with user-provided API key
  const model = new ChatAnthropic({
    model: modelName,
    apiKey: options.apiKey,
  });

  // Tool to get a single item by ID (forces multiple calls to get all items)
  const getItemById = tool(
    async (input: { itemId: number }) => {
      const item = ITEMS.find((i) => i.id === input.itemId);
      if (!item) {
        return { error: `Item with ID ${input.itemId} not found` };
      }
      return item;
    },
    {
      name: "get_item_by_id",
      description: "Get a single item by its ID. You must call this tool multiple times to get multiple items.",
      schema: z.object({
        itemId: z.number().describe("The ID of the item to retrieve (1-20)"),
      }),
    }
  );

  // Tool to check if a number is prime (requires multiple calls for checking range)
  const checkIfPrime = tool(
    async (input: { number: number }) => {
      const num = input.number;
      if (num < 2) return { number: num, isPrime: false };
      for (let i = 2; i * i <= num; i++) {
        if (num % i === 0) {
          return { number: num, isPrime: false };
        }
      }
      return { number: num, isPrime: true };
    },
    {
      name: "check_if_prime",
      description: "Check if a number is prime. You must call this for each number you want to check.",
      schema: z.object({
        number: z.number().describe("The number to check if it's prime"),
      }),
    }
  );

  // Tool to calculate a simple math operation (requires multiple calls for complex calculations)
  const calculate = tool(
    async (input: { operation: string; a: number; b: number }) => {
      const { operation, a, b } = input;
      let result: number;
      switch (operation) {
        case "add":
          result = a + b;
          break;
        case "subtract":
          result = a - b;
          break;
        case "multiply":
          result = a * b;
          break;
        case "divide":
          result = b !== 0 ? a / b : NaN;
          break;
        default:
          return { error: `Unknown operation: ${operation}` };
      }
      return { operation, a, b, result };
    },
    {
      name: "calculate",
      description: "Perform a single mathematical operation (add, subtract, multiply, divide). For complex calculations, you must call this multiple times with intermediate results.",
      schema: z.object({
        operation: z.enum(["add", "subtract", "multiply", "divide"]),
        a: z.number(),
        b: z.number(),
      }),
    }
  );

  // Tool to get items by category (still requires multiple calls if checking multiple categories)
  const getItemsByCategory = tool(
    async (input: { category: string }) => {
      const items = ITEMS.filter((i) => i.category === input.category);
      return { category: input.category, items, count: items.length };
    },
    {
      name: "get_items_by_category",
      description: "Get all items in a specific category (A, B, or C). You must call this separately for each category.",
      schema: z.object({
        category: z.enum(["A", "B", "C"]).describe("The category to filter by"),
      }),
    }
  );

  // Tool to find the maximum value (requires multiple calls if comparing many values)
  const findMax = tool(
    async (input: { values: number[] }) => {
      if (input.values.length === 0) {
        return { error: "Cannot find max of empty array" };
      }
      const max = Math.max(...input.values);
      return { values: input.values, max };
    },
    {
      name: "find_max",
      description: "Find the maximum value in an array. For large datasets, you might need to call this multiple times with subsets.",
      schema: z.object({
        values: z.array(z.number()).describe("Array of numbers to find the maximum of"),
      }),
    }
  );

  // Create agent with ModelCallLimitMiddleware
  const agent = createAgent({
    model,
    tools: [getItemById, checkIfPrime, calculate, getItemsByCategory, findMax],
    middleware: [
      modelCallLimitMiddleware({
        threadLimit: threadLimit,
        runLimit: runLimit,
        exitBehavior,
      }),
    ],
    checkpointer,
    systemPrompt: `You are a helpful assistant that can perform various operations on data.
You have access to tools that allow you to:
- Get individual items by ID
- Check if numbers are prime
- Perform calculations
- Filter items by category
- Find maximum values

When asked to process multiple items or perform complex calculations, you will need to make multiple tool calls.
Be thorough and complete all the requested operations.`,
  });

  // Initialize the conversation
  const initialState = {
    messages: [new HumanMessage(options.message)],
  };

  const threadId = options.threadId || `thread-${Date.now()}`;
  return agent.stream(initialState, {
    streamMode: ["values", "updates", "messages"],
    recursionLimit: 50, // High recursion limit to allow many calls before hitting the middleware limit
    configurable: { thread_id: threadId },
  });
}

