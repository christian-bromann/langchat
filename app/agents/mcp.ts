import path from "node:path";
import { fileURLToPath } from "node:url";

import { createAgent, HumanMessage, skillsMiddleware, mcpMiddleware } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";

import { checkpointer } from "@/app/utils";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * MCP Middleware Agent - demonstrates using multiple MCP servers efficiently
 *
 * Scenario: Multi-Server MCP Agent
 * This agent demonstrates how to use the MCP middleware to interact with multiple
 * MCP servers without bloating the context window. Instead of loading all tool
 * definitions into context, the agent can explore a virtual file system and
 * load only the tools it needs.
 *
 * This demonstrates:
 * - Efficient use of multiple MCP servers
 * - Virtual file system for tool discovery
 * - On-demand tool loading to reduce context window size
 * - Code execution interface for MCP tools
 *
 * MCP Servers used:
 * - filesystem: File operations (read, write, list directories)
 * - sqlite: SQLite database operations (query, create tables)
 * - memory: In-memory key-value store operations
 */
export async function mcpAgent(options: {
  message: string;
  apiKey: string;
  model?: string;
  threadId?: string;
}) {
  // Create the Anthropic model instance
  const model = new ChatAnthropic({
    model: "claude-sonnet-4-5",
    apiKey: options.apiKey,
    verbose: true,
  });

  // Configure MCP servers
  // Using easy-to-use servers that don't require Docker or complex setup
  // These servers run via npx and don't require any additional setup
  const mcpConfig = {
    mcpServers: {
      // Filesystem server - file operations (read, write, list directories)
      // Note: The directory will be created automatically if it doesn't exist
      filesystem: {
        transport: "stdio",
        command: "npx",
        args: [
          "-y",
          "@modelcontextprotocol/server-filesystem",
          path.resolve(__dirname, "..", "..", "filesystem"),
        ],
      },
      // SQLite server - database operations (query, create tables, insert data)
      // The database file will be created automatically if it doesn't exist
      sqlite: {
        transport: "stdio",
        command: "npx",
        args: [
          "-y",
          "mcp-server-sqlite-npx",
          "/tmp/mcp-db.sqlite", // SQLite database file path
        ],
      },
      // Memory server - in-memory key-value store (store and retrieve data)
      // No persistent storage, data is lost when the server restarts
      memory: {
        transport: "stdio",
        command: "npx",
        args: [
          "-y",
          "@modelcontextprotocol/server-memory",
        ],
      },
    },
  };

  // Create agent with MCP middleware
  const agent = createAgent({
    model,
    middleware: [
      mcpMiddleware({
        mcpConfig,
      }),
      skillsMiddleware()
    ],
    checkpointer,
    systemPrompt: `You are a helpful assistant.`,
  });

  // Get or create thread ID
  const config = {
    configurable: { thread_id: options.threadId }
  };

  // Initialize the conversation
  const initialState = {
    messages: [new HumanMessage(options.message)],
  };

  // Stream with thread ID for state persistence
  const stream = await agent.stream(initialState, {
    encoding: "text/event-stream",
    ...config,
    streamMode: ["values", "updates", "messages"],
    recursionLimit: 50,
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

