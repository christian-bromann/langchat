import { z } from "zod";
import { createAgent, HumanMessage, AIMessage, ToolMessage, tool, summarizationMiddleware } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";

import { checkpointer } from "@/app/utils";

// Mock file system for the coding agent
const mockFileSystem: Record<string, string> = {
  "src/utils.ts": `export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}`,
  "src/api.ts": `import { formatDate } from './utils';

export async function fetchUserData(userId: string) {
  const response = await fetch(\`/api/users/\${userId}\`);
  return response.json();
}`,
  "package.json": `{
  "name": "my-app",
  "version": "1.0.0",
  "dependencies": {
    "react": "^18.0.0",
    "typescript": "^5.0.0"
  }
}`,
  "README.md": `# My Application

This is a sample application demonstrating various features.

## Getting Started

1. Install dependencies: \`npm install\`
2. Run the app: \`npm start\``,
  "src/components/Button.tsx": `import React from 'react';

interface ButtonProps {
  label: string;
  onClick: () => void;
}

export function Button({ label, onClick }: ButtonProps) {
  return <button onClick={onClick}>{label}</button>;
}`,
};

// Create file reading tools for the coding agent
const readFileTool = tool(
  async (input) => {
    const filePath = input.file_path as string;
    const content = mockFileSystem[filePath];

    if (!content) {
      return {
        error: `File not found: ${filePath}`,
        file_path: filePath,
      };
    }

    return {
      file_path: filePath,
      content: content,
      lines: content.split('\n').length,
    };
  },
  {
    name: "read_file",
    description: "Read the contents of a file from the project. Use this to examine code files, configuration files, or any text files.",
    schema: z.object({
      file_path: z.string().describe("The path to the file to read, relative to the project root"),
    }),
  }
);

const listFilesTool = tool(
  async (input) => {
    const directory = input.directory as string || ".";
    const files = Object.keys(mockFileSystem).filter(path => {
      if (directory === ".") return true;
      return path.startsWith(directory);
    });

    return {
      directory: directory,
      files: files,
      count: files.length,
    };
  },
  {
    name: "list_files",
    description: "List files in a directory. Use this to explore the project structure.",
    schema: z.object({
      directory: z.string().optional().describe("The directory path to list files from. Defaults to root directory."),
    }),
  }
);

// Pre-populated conversation history with realistic tool calls and tool messages
function getInitialMessages(): Array<HumanMessage | AIMessage | ToolMessage> {
  // Tool call IDs for realistic conversation
  const toolCallId1 = "tool_call_001";
  const toolCallId2 = "tool_call_002";
  const toolCallId3 = "tool_call_003";
  const toolCallId4 = "tool_call_004";
  const toolCallId5 = "tool_call_005";
  const toolCallId6 = "tool_call_006";
  const toolCallId7 = "tool_call_007";
  const toolCallId8 = "tool_call_008";

  return [
    new HumanMessage("Hi! I need help refactoring my TypeScript project. Can you help me understand the codebase structure?"),
    new AIMessage({
      content: "I'd be happy to help you refactor your TypeScript project! Let me start by exploring the project structure to understand what we're working with.",
      tool_calls: [{
        id: toolCallId1,
        name: "list_files",
        args: { directory: "." },
      }],
    }),
    new ToolMessage({
      content: JSON.stringify({
        directory: ".",
        files: ["src/utils.ts", "src/api.ts", "package.json", "README.md", "src/components/Button.tsx"],
        count: 5,
      }),
      tool_call_id: toolCallId1,
    }),
    new AIMessage("Great! I can see you have a TypeScript project with utilities, API code, and React components. Let me examine the main utility file to understand the code structure."),
    new HumanMessage("Can you check the utils.ts file? I want to refactor some of those functions."),
    new AIMessage({
      content: "I'll read the utils.ts file to see what functions we're working with.",
      tool_calls: [{
        id: toolCallId2,
        name: "read_file",
        args: { file_path: "src/utils.ts" },
      }],
    }),
    new ToolMessage({
      content: JSON.stringify({
        file_path: "src/utils.ts",
        content: mockFileSystem["src/utils.ts"],
        lines: 7,
      }),
      tool_call_id: toolCallId2,
    }),
    new AIMessage("I see you have `formatDate` and `capitalize` functions in utils.ts. The `formatDate` function looks good, but `capitalize` could be improved to handle edge cases. What specific refactoring would you like to do?"),
    new HumanMessage("Let me also check the API file to see how these utilities are being used."),
    new AIMessage({
      content: "I'll read the API file to see how the utilities are being imported and used.",
      tool_calls: [{
        id: toolCallId3,
        name: "read_file",
        args: { file_path: "src/api.ts" },
      }],
    }),
    new ToolMessage({
      content: JSON.stringify({
        file_path: "src/api.ts",
        content: mockFileSystem["src/api.ts"],
        lines: 6,
      }),
      tool_call_id: toolCallId3,
    }),
    new AIMessage("I can see that `api.ts` imports `formatDate` from utils but doesn't use `capitalize`. The API file looks clean. Are you planning to use `capitalize` elsewhere, or should we remove it if it's unused?"),
    new HumanMessage("Actually, I want to add a new utility function for parsing dates. Can you check the package.json to see what dependencies we have?"),
    new AIMessage({
      content: "Let me check the package.json to see what dependencies are available.",
      tool_calls: [{
        id: toolCallId4,
        name: "read_file",
        args: { file_path: "package.json" },
      }],
    }),
    new ToolMessage({
      content: JSON.stringify({
        file_path: "package.json",
        content: mockFileSystem["package.json"],
        lines: 7,
      }),
      tool_call_id: toolCallId4,
    }),
    new AIMessage("I see you have React and TypeScript as dependencies. For date parsing, you can use native JavaScript Date methods, but if you need more advanced parsing, you might want to add a library like `date-fns` or `dayjs`. What format do you need to parse?"),
    new HumanMessage("Let me also check the Button component to see the overall code style."),
    new AIMessage({
      content: "I'll read the Button component to understand the coding style used in your project.",
      tool_calls: [{
        id: toolCallId5,
        name: "read_file",
        args: { file_path: "src/components/Button.tsx" },
      }],
    }),
    new ToolMessage({
      content: JSON.stringify({
        file_path: "src/components/Button.tsx",
        content: mockFileSystem["src/components/Button.tsx"],
        lines: 8,
      }),
      tool_call_id: toolCallId5,
    }),
    new AIMessage("The Button component follows good TypeScript practices with proper typing. It's a simple, clean component. I notice you're using React but not importing the Button component in api.ts. Is this intentional, or should we review the component structure?"),
    new HumanMessage("Can you check the README to see if there are any setup instructions I should be aware of?"),
    new AIMessage({
      content: "I'll read the README to check for any setup instructions or project requirements.",
      tool_calls: [{
        id: toolCallId6,
        name: "read_file",
        args: { file_path: "README.md" },
      }],
    }),
    new ToolMessage({
      content: JSON.stringify({
        file_path: "README.md",
        content: mockFileSystem["README.md"],
        lines: 7,
      }),
      tool_call_id: toolCallId6,
    }),
    new AIMessage("The README shows standard setup instructions. Now that I understand your project structure, what specific refactoring would you like to tackle? I can help improve the utility functions, add type safety, or optimize the code structure."),
    new HumanMessage("I'm thinking about splitting the utils file into separate modules. What do you think?"),
    new AIMessage("That's a great idea! Splitting utilities into separate modules can improve maintainability. For example, you could have `dateUtils.ts` for date-related functions and `stringUtils.ts` for string manipulation. This would make imports more specific and the code easier to navigate. Would you like me to help plan the refactoring?"),
    new HumanMessage("Yes, let's do that. Can you also check if there are any other files that might need refactoring?"),
    new AIMessage({
      content: "Let me check the components directory to see if there are other files that might benefit from refactoring.",
      tool_calls: [{
        id: toolCallId7,
        name: "list_files",
        args: { directory: "src/components" },
      }],
    }),
    new ToolMessage({
      content: JSON.stringify({
        directory: "src/components",
        files: ["src/components/Button.tsx"],
        count: 1,
    }),
      tool_call_id: toolCallId7,
    }),
    new AIMessage("I can see you only have one component currently. The Button component looks good, but we could add some improvements like better prop validation or accessibility features. However, the main refactoring focus should be on the utils file as you mentioned. Should we proceed with creating the separate utility modules?"),
    new HumanMessage("Actually, before we proceed, can you check if there are any TypeScript errors or issues in the current code?"),
    new AIMessage({
      content: "Let me re-examine the files to check for potential TypeScript issues or type safety concerns.",
      tool_calls: [{
        id: toolCallId8,
        name: "read_file",
        args: { file_path: "src/utils.ts" },
      }],
    }),
    new ToolMessage({
      content: JSON.stringify({
        file_path: "src/utils.ts",
        content: mockFileSystem["src/utils.ts"],
        lines: 7,
      }),
      tool_call_id: toolCallId8,
    }),
    new AIMessage("After reviewing the code, I found a few potential issues: 1) The `capitalize` function doesn't handle empty strings or null/undefined inputs, 2) The `formatDate` function could benefit from input validation, and 3) There's no JSDoc documentation. These are good candidates for improvement during the refactoring. Should we address these while splitting the utilities?"),
  ];
}

export async function summarizationAgent(options: {
  message: string;
  apiKey: string;
  threadId?: string;
  model?: string;
}) {
  // Create the main Anthropic model instance
  const model = new ChatAnthropic({
    model: "claude-sonnet-4-5",
    apiKey: options.apiKey,
  });

  // Use a cheaper model for summarization
  const summaryModel = new ChatAnthropic({
    model: "claude-haiku-4-5",
    apiKey: options.apiKey,
  });

  // Create agent with SummarizationMiddleware
  const agent = createAgent({
    model,
    tools: [readFileTool, listFilesTool],
    middleware: [
      summarizationMiddleware({
        model: summaryModel,
        /**
         * trigger summarization when the conversation history is
         */
        trigger: [
          { fraction: 0.8 }, // 80% of the model's context size
          { tokens: 2000 },  // or 2000 tokens
        ],
        /**
         * Keep last 1000 tokens after summary
         */
        keep: { tokens: 1000 },
        summaryPrefix: "## Previous conversation summary:",
      }),
    ],
    checkpointer,
    systemPrompt: "You are a helpful coding assistant that helps developers refactor and improve their TypeScript/JavaScript projects. You can read files and explore project structures to understand codebases. Provide thoughtful, detailed code reviews and refactoring suggestions.",
  });

  const config = { configurable: { thread_id: options.threadId } };

  // Check if this is a new thread by trying to get existing checkpoint state
  let isNewThread = false;
  if (!options.threadId) {
    // If no threadId was provided, this is definitely a new thread
    isNewThread = true;
  } else {
    // Check if thread exists by trying to get checkpoint state
    try {
      const checkpoint = await checkpointer.get(config);
      // If checkpoint is null or undefined, it's a new thread
      isNewThread = !checkpoint;
    } catch {
      // If getting checkpoint fails, assume it's a new thread
      isNewThread = true;
    }
  }

  // Initialize the conversation with pre-populated history for new threads
  // This ensures we have enough conversation history to trigger summarization
  // when the user sends their first message
  const initialState = {
    messages: isNewThread
      ? [...getInitialMessages(), new HumanMessage(options.message)]
      : [new HumanMessage(options.message)],
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

