"use client";

import ThemeSwitcher from "./ThemeSwitcher";
import { ConversationStatistics } from "./ConversationStatistics";
import { ApiKeyInput } from "./ApiKeyInput";

interface AgentScenario {
  id: string;
  name: string;
}

const scenarios: AgentScenario[] = [
  { id: "simple-agent", name: "Simple Agent" },
  { id: "human-in-the-loop", name: "Human In the Loop" },
  { id: "summarization", name: "Summarization" },
  { id: "model-call-limits", name: "Model Call Limits" },
  { id: "tool-call-limits", name: "Tool Call Limits" },
  { id: "tool-retry", name: "Tool Retry" },
  { id: "model-fallback", name: "Model Fallback" },
  { id: "tool-emulator", name: "Tool Emulator" },
  { id: "todo-list", name: "Todo List" },
  { id: "context-editing", name: "Context Editing" },
  { id: "pii-redaction", name: "PII Redaction" },
  { id: "moderation", name: "Content Moderation" },
  { id: "mcp-knowledge", name: "MCP Knowledge Agent" },
];

interface SidebarProps {
  selectedScenario?: string;
  onScenarioSelect: (scenarioId: string) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
}

export default function Sidebar({
  selectedScenario,
  apiKey,
  onScenarioSelect,
  onApiKeyChange
}: SidebarProps) {
  return (
    <aside className="w-64 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-black h-screen flex flex-col overflow-hidden">
      {/* Scrollable tool selection section */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="p-6 pb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Agent Scenarios
          </h2>
        </div>
        <nav className="flex-1 overflow-y-auto px-6 space-y-2">
          {scenarios.map((scenario) => (
            <button
              key={scenario.id}
              onClick={() => onScenarioSelect(scenario.id)}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors cursor-pointer ${
                selectedScenario === scenario.id
                  ? "bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-medium"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900"
              }`}
            >
              {scenario.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Fixed bottom section */}
      <div className="shrink-0 flex flex-col">
        {/* Conversation Statistics */}
        <ConversationStatistics />

        {/* API Key Section */}
        <ApiKeyInput apiKey={apiKey} onApiKeyChange={onApiKeyChange} />

        {/* Theme Switcher */}
        <ThemeSwitcher />
      </div>
    </aside>
  );
}

