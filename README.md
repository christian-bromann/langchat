# LangChat

A sandbox for showcasing different use cases of LangChain's `createAgent` with various agent scenarios and capabilities.

## Overview

This is a [Next.js](https://nextjs.org) application that demonstrates various LangChain agent patterns and capabilities, including tool use, human-in-the-loop, context management, and more.

## Agent Scenarios

The application includes the following agent scenarios:

- **Simple Agent** - Basic agent with tool calling capabilities
- **Human In the Loop** - Agents that request human approval before executing actions
- **Summarization** - Context summarization for managing long conversations
- **Model Call Limits** - Controlling the number of model calls
- **Tool Call Limits** - Limiting tool execution attempts
- **Tool Retry** - Automatic retry logic for failed tool calls
- **Model Fallback** - Fallback to alternative models on failure
- **Tool Emulator** - Emulating tool behavior for testing
- **Todo List** - Task management agent
- **Context Editing** - Dynamic context manipulation
- **PII Redaction** - Automatic redaction of personally identifiable information
- **Content Moderation** - Content filtering and moderation
- **MCP Knowledge Agent** - Integration with Anthropic's built-in MCP toolset and Cloudflare's managed MCP servers

### MCP Knowledge Agent

The **MCP Knowledge Agent** showcases Anthropic's built-in tools for connecting to Model Context Protocol (MCP) servers. This agent demonstrates:

- **Dynamic Tool Discovery** - Uses `toolSearchRegex_20251119` to find relevant tools across all MCP servers
- **Deferred Loading** - Efficiently manages hundreds of tools by loading them on-demand
- **Multiple MCP Server Integration** - Connects to 15 Cloudflare managed MCP servers:
  - Documentation server - Cloudflare documentation search
  - Workers Bindings - Storage, AI, and compute primitives
  - Workers Builds - Build management and insights
  - Observability - Logs and analytics
  - Radar - Internet traffic insights and URL scanning
  - Container - Sandbox development environments
  - Browser Rendering - Web page fetching and screenshots
  - Logpush - Log job health monitoring
  - AI Gateway - Prompt and response analysis
  - AI Search - Document search
  - Audit Logs - Audit log queries and reports
  - DNS Analytics - DNS performance optimization
  - Digital Experience Monitoring - Application insights
  - Cloudflare One CASB - Security misconfiguration detection
  - GraphQL - Analytics via Cloudflare's GraphQL API

**Example queries:**

- "What are the latest Internet trends according to Cloudflare Radar?"
- "Help me debug my Worker's logs"
- "Fetch and analyze this webpage using Browser Rendering"
- "Search Cloudflare's documentation for Workers KV usage"

**Note:** This agent requires the Anthropic built-in tools (`tools.mcpToolset_20251120` and `tools.toolSearchRegex_20251119`) which will be available in a future release of `@langchain/anthropic`. The current implementation shows a preview of how it will work.

## Getting Started

First, install dependencies:

```bash
pnpm install
```

Then, run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### API Keys

You'll need an **Anthropic API key** to use the application. Enter it in the sidebar when prompted.

For the MCP Knowledge Agent, you can optionally provide a **Cloudflare API token** for authenticated access to Cloudflare's MCP servers.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
