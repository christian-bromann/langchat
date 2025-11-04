import Image from "next/image";

const SCENARIO_PROMPTS = {
  "simple-agent": [
    "Who is the customer with the ID 1234567890?"
  ],
  "human-in-the-loop": [
    "Send an email to the user \"sarahchen\" asking them about their recent order.",
  ],
  "summarization": [
    "Let's continue with the refactoring. Can you help me create the dateUtils.ts file?"
  ],
  "model-call-limits": [
    "Get all items from ID 1 to 5, check which ones have prime-numbered IDs, calculate the sum of their values, and tell me which category has the most items."
  ],
  "tool-call-limits": [
    "Search for information about TypeScript and Python, then get all users with role 'user' and calculate the sum of their IDs."
  ],
} as const;

interface WelcomeScreenProps {
  selectedScenario?: string;
  apiKey: string;
  handleSend: (prompt: string) => void
}

export function WelcomeScreen({ selectedScenario, apiKey, handleSend }: WelcomeScreenProps) {
  const examplePrompts = selectedScenario
    ? SCENARIO_PROMPTS[selectedScenario as keyof typeof SCENARIO_PROMPTS]
    : undefined;

  return (<>
    <div className="flex flex-col items-center text-center">
      <Image
        src="/langchain.png"
        alt="LangChain Logo"
        width={120}
        height={120}
        className="mb-6"
        priority
      />
      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        Welcome to LangChat
      </h3>
      <p className="text-gray-600 dark:text-gray-400 max-w-md">
        Select an agent scenario from the sidebar to get started. This is a sandbox for
        showcasing different use cases of LangChain&apos;s <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-900 rounded">createAgent</code>.
      </p>
    </div>
    {examplePrompts && examplePrompts.map((prompt) => (
      <ExamplePrompt key={prompt} prompt={prompt} apiKey={apiKey} handleSend={handleSend} />
    ))}
  </>)
}

function ExamplePrompt({ prompt, apiKey, handleSend }: { prompt: string, apiKey: string, handleSend: (prompt: string) => void }) {
  return (
    <div className="mt-8 max-w-md mx-auto w-full relative">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 text-center">
        Try this example prompt:
      </p>
      <div className="relative group">
        <button
          onClick={() => {
            if (!apiKey.trim()) return;
            handleSend(prompt);
          }}
          disabled={!apiKey.trim()}
          title={!apiKey.trim() ? "Please enter your Anthropic API key in the sidebar to use this prompt" : undefined}
          className="text-left px-4 py-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-600 transition-colors w-full cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-50 dark:disabled:hover:bg-gray-800/50"
        >
          <span className="flex items-start gap-2">
            <span className="text-gray-400 dark:text-gray-500">💡</span>
            <span>{prompt}</span>
          </span>
        </button>
        {!apiKey.trim() && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs rounded-lg shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
            Please enter your Anthropic API key in the sidebar
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-100"></div>
          </div>
        )}
      </div>
    </div>
  )
}
