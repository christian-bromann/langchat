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
- **Cloudflare MCP Agent** - Integration with Anthropic's built-in MCP toolset and Cloudflare's managed MCP servers

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

For the Cloudflare MCP Agent, you can optionally provide a **Cloudflare API token** for authenticated access to Cloudflare's MCP servers.

For the Content Moderation Agent, you have to provide additionally an `OPENAI_API_KEY` environment variable with your OpenAI API key.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
