import { createAgent, createMiddleware, HumanMessage, tool, AIMessage } from "langchain";
import { ChatAnthropic, tools as anthropicTools } from "@langchain/anthropic";
import { z } from "zod";

/**
 * Middleware to inject beta headers and tool configuration for programmatic tool calling
 */
function programmaticToolCallingMiddleware() {
  let container: {
    id: string;
    expires_at: string;
  } | undefined = undefined;

  return createMiddleware({
    name: "programmaticToolCallingMiddleware",
    // wrapModelCall: async (config, request) => {
    //   // Inject beta header for programmatic tool calling
    //   return request({
    //     ...config,
    //     modelSettings: {
    //       defaultHeaders: {
    //         "anthropic-beta": "advanced-tool-use-2025-11-20",
    //       },
    //     },
    //   });
    // },

    beforeModel: (state) => {
      console.log("beforeModel", state, container)
    },

    afterModel: (state) => {
      console.log("ehh", state)
      const lastMessage = state.messages.at(-1);
      if (AIMessage.isInstance(lastMessage) && lastMessage?.additional_kwargs?.container) {
        container = lastMessage?.additional_kwargs?.container as { id: string; expires_at: string };
      }
    },

    afterAgent: (state) => {
      console.log('--->', state);
    }
  });
}

/**
 * Mock database query tool that simulates SQL queries against a sales database
 * In a real implementation, this would connect to an actual database
 */
const queryDatabaseTool = tool(
  async ({ sql }: { sql: string }) => {
    // Mock data based on SQL query
    // Simulating different regions' sales data
    const mockData: Record<string, Array<{ region: string; revenue: number; orders: number }>> = {
      west: [
        { region: "West", revenue: 45000, orders: 120 },
        { region: "West", revenue: 38000, orders: 95 },
        { region: "West", revenue: 32000, orders: 87 }
      ],
      east: [
        { region: "East", revenue: 52000, orders: 135 },
        { region: "East", revenue: 41000, orders: 102 },
        { region: "East", revenue: 29000, orders: 78 }
      ],
      central: [
        { region: "Central", revenue: 38000, orders: 98 },
        { region: "Central", revenue: 35000, orders: 89 },
        { region: "Central", revenue: 27000, orders: 71 }
      ],
    };

    // Simple parsing to determine which region is being queried
    const sqlLower = sql.toLowerCase();
    let results: Array<{ region: string; revenue: number; orders: number }> = [];

    if (sqlLower.includes("west")) {
      results = mockData.west;
    } else if (sqlLower.includes("east")) {
      results = mockData.east;
    } else if (sqlLower.includes("central")) {
      results = mockData.central;
    } else if (sqlLower.includes("all") || sqlLower.includes("*")) {
      // Return all regions
      results = [...mockData.west, ...mockData.east, ...mockData.central];
    }

    return JSON.stringify(results);
  },
  {
    name: "query_database",
    description: "Execute a SQL query against the sales database. Returns a list of rows as JSON objects with fields: region (string), revenue (number), orders (number).",
    schema: z.object({
      sql: z.string().describe("SQL query to execute"),
    }),
    extras: {
      allowed_callers: ["code_execution_20250825"]
    }
  }
);

/**
 * Programmatic Tool Calling Agent - Showcases Anthropic's programmatic tool calling
 *
 * This agent demonstrates:
 * - Using code execution with custom tools that can be called programmatically
 * - Allowing Claude to write code that calls tools within a sandbox
 * - Processing tool results in code before returning to Claude's context
 * - Reducing latency and token usage for multi-tool workflows
 *
 * Key features:
 * - Tools are configured with "allowed_callers" to enable programmatic calling
 * - Code execution runs in a sandboxed container
 * - Tool results from programmatic calls don't bloat the context window
 * - Claude can filter, aggregate, and process data programmatically
 */
export async function programmaticToolCallingAgent(options: {
  message: string;
  apiKey: string;
  model?: string;
}) {
  const modelName = options.model ?? "claude-sonnet-4-5-20250929";

  // Create the Anthropic model instance with beta headers for programmatic tool calling
  const model = new ChatAnthropic({
    model: modelName,
    apiKey: options.apiKey,
    betas: ["advanced-tool-use-2025-11-20"],
    clientOptions: {
      defaultHeaders: {
        "anthropic-beta": "advanced-tool-use-2025-11-20"
      }
    }
    // Note: The beta header and code execution configuration would typically be set here
    // This is a simplified example - actual implementation may require additional setup
  });

  // Initialize the conversation with the user message
  const initialState = {
    messages: [new HumanMessage(options.message)],
  };

  // Configure tools for programmatic calling
  // In a full implementation, these would include:
  // 1. Code execution tool (type: "code_execution_20250825")
  // 2. Custom tools with "allowed_callers": ["code_execution_20250825"]
  const tools = [queryDatabaseTool, anthropicTools.codeExecution_20250825()];

  // Create agent with programmatic tool calling support
  const agent = createAgent({
    model,
    tools,
    middleware: [programmaticToolCallingMiddleware()],
    systemPrompt: `You are a helpful assistant with access to a sales database and code execution capabilities.

IMPORTANT: You have programmatic tool calling enabled. This means you should write Python code using the code_execution tool to call the query_database function programmatically.

The query_database tool accepts SQL queries and returns JSON results with the following schema:
- region: string (West, East, Central, etc.)
- revenue: number (in dollars)
- orders: number (count of orders)

When the user asks to query multiple regions or analyze data:
1. Use the code_execution tool to write Python code
2. Within that code, call query_database() as a function (it will be available in the execution environment)
3. Process and aggregate the results programmatically in your Python code
4. Print or return the final analysis

Example approach:
Instead of calling query_database 3 times separately, write code like:
\`\`\`python
# Query all regions programmatically
regions = ['West', 'East', 'Central']
results = {}
for region in regions:
    data = query_database(sql=f"SELECT * FROM sales WHERE region = '{region}'")
    results[region] = data

# Process and analyze
# ... your analysis code ...
\`\`\`

This approach:
- Reduces latency by avoiding multiple round trips
- Processes data in code before adding to context
- Allows for filtering, sorting, and aggregation programmatically`,
  });

  const stream = await agent.stream(initialState, {
    encoding: "text/event-stream",
    streamMode: ["values", "updates", "messages"],
    recursionLimit: 50,
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

