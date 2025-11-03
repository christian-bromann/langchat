import { z } from "zod";
import { createAgent, HumanMessage, tool, toolCallLimitMiddleware } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";

import { getCheckpointer } from "@/app/utils";

/**
 * Tool Call Limit agent - demonstrates limiting tool calls
 * This agent showcases:
 * - Global tool call limits (all tools)
 * - Specific tool call limits (e.g., search tool)
 * - Different exit behaviors when limits are reached
 */

// Sample data for search results
const SEARCH_RESULTS = {
  "typescript": ["TypeScript is a typed superset of JavaScript", "TypeScript adds static types to JavaScript"],
  "python": ["Python is a high-level programming language", "Python emphasizes code readability"],
  "javascript": ["JavaScript is a programming language", "JavaScript runs in browsers and Node.js"],
  "langchain": ["LangChain is a framework for building LLM applications", "LangChain provides tools for agents"],
};

// Sample database of user information
const USER_DATABASE = [
  { id: 1, name: "Alice", email: "alice@example.com", role: "admin" },
  { id: 2, name: "Bob", email: "bob@example.com", role: "user" },
  { id: 3, name: "Charlie", email: "charlie@example.com", role: "user" },
  { id: 4, name: "Diana", email: "diana@example.com", role: "moderator" },
  { id: 5, name: "Eve", email: "eve@example.com", role: "user" },
];

export async function toolCallLimitsAgent(options: {
  message: string;
  apiKey: string;
  globalThreadLimit?: number;
  globalRunLimit?: number;
  searchThreadLimit?: number;
  searchRunLimit?: number;
  exitBehavior?: "end" | "error";
  model?: string;
}) {
  const modelName = options.model ?? "claude-3-7-sonnet-latest";
  const globalThreadLimit = options.globalThreadLimit ?? 20;
  const globalRunLimit = options.globalRunLimit ?? 10;
  const searchThreadLimit = options.searchThreadLimit ?? 5;
  const searchRunLimit = options.searchRunLimit ?? 3;
  const exitBehavior = options.exitBehavior ?? "error";

  // Create the Anthropic model instance with user-provided API key
  const model = new ChatAnthropic({
    model: modelName,
    apiKey: options.apiKey,
  });

  // Search tool - expensive external API simulation
  const search = tool(
    async (input: { query: string }) => {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 100));
      const query = input.query.toLowerCase();
      const results: string[] = [];

      for (const [key, value] of Object.entries(SEARCH_RESULTS)) {
        if (query.includes(key)) {
          results.push(...value);
        }
      }

      if (results.length === 0) {
        return { query: input.query, results: ["No results found"], count: 0 };
      }

      return { query: input.query, results, count: results.length };
    },
    {
      name: "search",
      description: "Search for information about a topic. This is an expensive operation that calls an external API. Use sparingly.",
      schema: z.object({
        query: z.string().describe("The search query"),
      }),
    }
  );

  // Get user by ID - database query simulation
  const getUserById = tool(
    async (input: { userId: number }) => {
      await new Promise(resolve => setTimeout(resolve, 50));
      const user = USER_DATABASE.find(u => u.id === input.userId);
      if (!user) {
        return { error: `User with ID ${input.userId} not found` };
      }
      return user;
    },
    {
      name: "get_user_by_id",
      description: "Get user information by ID. This requires a database query.",
      schema: z.object({
        userId: z.number().describe("The ID of the user to retrieve (1-5)"),
      }),
    }
  );

  // Get users by role - database query simulation
  const getUsersByRole = tool(
    async (input: { role: string }) => {
      await new Promise(resolve => setTimeout(resolve, 50));
      const users = USER_DATABASE.filter(u => u.role === input.role);
      return { role: input.role, users, count: users.length };
    },
    {
      name: "get_users_by_role",
      description: "Get all users with a specific role. This requires a database query.",
      schema: z.object({
        role: z.enum(["admin", "user", "moderator"]).describe("The role to filter by"),
      }),
    }
  );

  // Calculate tool - simple computation
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
      description: "Perform a mathematical operation (add, subtract, multiply, divide).",
      schema: z.object({
        operation: z.enum(["add", "subtract", "multiply", "divide"]),
        a: z.number(),
        b: z.number(),
      }),
    }
  );

  // Create global limiter (applies to all tools)
  const globalLimiter = toolCallLimitMiddleware({
    threadLimit: globalThreadLimit,
    runLimit: globalRunLimit,
    exitBehavior,
  });

  // Create specific limiter for search tool (prevents excessive API calls)
  const searchLimiter = toolCallLimitMiddleware({
    toolName: "search",
    threadLimit: searchThreadLimit,
    runLimit: searchRunLimit,
    exitBehavior,
  });

  // Get checkpointer instance
  const checkpointer = await getCheckpointer();

  // Create agent with both limiters
  const agent = createAgent({
    model,
    tools: [search, getUserById, getUsersByRole, calculate],
    middleware: [globalLimiter, searchLimiter],
    checkpointer,
    systemPrompt: `You are a helpful assistant with access to various tools:

- search: Search for information (expensive API call - use sparingly)
- get_user_by_id: Get a single user by ID
- get_users_by_role: Get all users with a specific role
- calculate: Perform mathematical operations`,
  });

  // Initialize the conversation
  const initialState = {
    messages: [new HumanMessage(options.message)],
  };

  return agent.stream(initialState, {
    streamMode: ["values", "updates", "messages"],
    recursionLimit: 50, // High recursion limit to allow many calls before hitting the middleware limit
  });
}

