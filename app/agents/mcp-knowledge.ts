import { createAgent, createMiddleware, HumanMessage } from "langchain";
import { ChatAnthropic, tools } from "@langchain/anthropic";

/**
 * Middleware to inject MCP servers configuration into model calls
 */
function mcpServersMiddleware(mcpServers: Record<string, unknown>[]) {
  return createMiddleware({
    name: "mcpServersMiddleware",
    wrapModelCall: async (config, request) => {
      // Inject mcp_servers into the model call options
      return request({
        ...config,
        modelSettings: {
          mcp_servers: mcpServers,
        },
      })
    },
  });
}

/**
 * Cloudflare MCP Servers configuration
 */
const CLOUDFLARE_MCP_SERVERS = [
  {
    type: "url",
    url: "https://docs.mcp.cloudflare.com/mcp",
    name: "cloudflare-docs",
    description: "Get up to date reference information on Cloudflare"
  },
  {
    type: "url",
    url: "https://bindings.mcp.cloudflare.com/mcp",
    name: "cloudflare-bindings",
    description: "Build Workers applications with storage, AI, and compute primitives"
  },
  {
    type: "url",
    url: "https://builds.mcp.cloudflare.com/mcp",
    name: "cloudflare-builds",
    description: "Get insights and manage your Cloudflare Workers Builds"
  },
  {
    type: "url",
    url: "https://observability.mcp.cloudflare.com/mcp",
    name: "cloudflare-observability",
    description: "Debug and get insight into your application's logs and analytics"
  },
  {
    type: "url",
    url: "https://radar.mcp.cloudflare.com/mcp",
    name: "cloudflare-radar",
    description: "Get global Internet traffic insights, trends, URL scans, and other utilities"
  },
  {
    type: "url",
    url: "https://containers.mcp.cloudflare.com/mcp",
    name: "cloudflare-container",
    description: "Spin up a sandbox development environment"
  },
  {
    type: "url",
    url: "https://browser.mcp.cloudflare.com/mcp",
    name: "cloudflare-browser",
    description: "Fetch web pages, convert them to markdown and take screenshots"
  },
  {
    type: "url",
    url: "https://logs.mcp.cloudflare.com/mcp",
    name: "cloudflare-logpush",
    description: "Get quick summaries for Logpush job health"
  },
  {
    type: "url",
    url: "https://ai-gateway.mcp.cloudflare.com/mcp",
    name: "cloudflare-ai-gateway",
    description: "Search your logs, get details about the prompts and responses"
  },
  {
    type: "url",
    url: "https://autorag.mcp.cloudflare.com/mcp",
    name: "cloudflare-ai-search",
    description: "List and search documents on your AI Searchs"
  },
  {
    type: "url",
    url: "https://auditlogs.mcp.cloudflare.com/mcp",
    name: "cloudflare-audit-logs",
    description: "Query audit logs and generate reports for review"
  },
  {
    type: "url",
    url: "https://dns-analytics.mcp.cloudflare.com/mcp",
    name: "cloudflare-dns-analytics",
    description: "Optimize DNS performance and debug issues based on current set up"
  },
  {
    type: "url",
    url: "https://dex.mcp.cloudflare.com/mcp",
    name: "cloudflare-dex",
    description: "Get quick insight on critical applications for your organization"
  },
  {
    type: "url",
    url: "https://casb.mcp.cloudflare.com/mcp",
    name: "cloudflare-casb",
    description: "Quickly identify any security misconfigurations for SaaS applications to safeguard users & data"
  },
  {
    type: "url",
    url: "https://graphql.mcp.cloudflare.com/mcp",
    name: "cloudflare-graphql",
    description: "Get analytics data using Cloudflare's GraphQL API"
  }
] as const;

/**
 * MCP Knowledge Agent - Showcases Anthropic's built-in MCP toolset with Cloudflare servers
 *
 * This agent demonstrates:
 * - Using Anthropic's mcpToolset_20251120 to connect to multiple MCP servers
 * - Using toolSearchRegex_20251119 for dynamic tool discovery
 * - Deferred loading for efficient tool management with hundreds of tools
 * - Integration with Cloudflare's managed MCP servers
 */
export async function mcpKnowledgeAgent(options: {
  message: string;
  apiKey: string;
  model?: string;
  cloudflareApiToken?: string;
}) {
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

  // Configure MCP servers with optional authentication
  const mcpServers = CLOUDFLARE_MCP_SERVERS.map(server => ({
    type: server.type,
    url: server.url,
    name: server.name,
    // Add authorization token if provided by user
    ...(options.cloudflareApiToken ? { authorization_token: options.cloudflareApiToken } : {})
  }));

  // Create MCP toolsets for each server with deferred loading
  // This allows Claude to dynamically discover and load tools on-demand
  const mcpToolsets = CLOUDFLARE_MCP_SERVERS.map(server =>
    tools.mcpToolset_20251120({
      serverName: server.name,
      // Enable deferred loading to work with tool search
      // defaultConfig: { deferLoading: true }
    })
  );

  // Add tool search capability (using regex variant)
  // This allows Claude to search through all available tools and load them as needed
  // const toolSearch = tools.toolSearchRegex_20251119();

  // Combine all tools
  // const allTools = [toolSearch, ...mcpToolsets];

  // Create agent with MCP servers configuration
  const agent = createAgent({
    model,
    tools: mcpToolsets,
    middleware: [mcpServersMiddleware(mcpServers)],
    systemPrompt: `You are a helpful assistant with access to Cloudflare's suite of MCP servers.

You have access to the following Cloudflare services:
${CLOUDFLARE_MCP_SERVERS.map(s => `- ${s.name}: ${s.description}`).join('\n')}

When a user asks a question:
1. Use the tool search capability to find relevant tools across all MCP servers
2. Dynamically load and use the appropriate tools to answer the question
3. Provide comprehensive, accurate information based on the tool results
4. Cite your sources when using information from specific MCP servers

If authentication is required for certain operations and not provided, politely inform the user that they may need to provide a Cloudflare API token for full functionality.`,
  });

  const stream = await agent.stream(initialState, {
    encoding: "text/event-stream",
    streamMode: ["values", "updates", "messages"],
    recursionLimit: 50, // Higher limit due to tool search + tool execution steps
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

