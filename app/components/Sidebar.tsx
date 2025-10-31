"use client";

import { useState } from "react";
import ThemeSwitcher from "./ThemeSwitcher";

interface AgentScenario {
  id: string;
  name: string;
}

const scenarios: AgentScenario[] = [
  { id: "simple-agent", name: "Simple Agent" },
  { id: "human-in-the-loop", name: "Human In the Loop" },
  // { id: "summarization", name: "Summarization" },
  // { id: "model-call-limits", name: "Model Call Limits" },
];

interface SidebarProps {
  selectedScenario: string | null;
  onScenarioSelect: (scenarioId: string) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
}

export default function Sidebar({ selectedScenario, onScenarioSelect, apiKey, onApiKeyChange }: SidebarProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <aside className="w-64 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-black h-screen flex flex-col">
      <div className="p-6 flex-1">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Agent Scenarios
        </h2>
        <nav className="space-y-2">
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

      {/* API Key Section */}
      <div className="px-6 pb-4 border-t border-gray-200 dark:border-gray-800">
        <div className="relative pt-4">
          <label htmlFor="api-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Anthropic API Key
            <button
              type="button"
              className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              aria-label="API key information"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-3 h-3"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
                />
              </svg>
            </button>

            {/* Tooltip */}
            {showTooltip && (
              <div className="absolute bottom-full left-0 mb-2 w-64 p-3 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg z-10">
                <p className="font-semibold mb-1">Security Notice</p>
                <p className="mb-2">
                  Please use a throwaway API key and revoke it after using this app. Even though logs are not monitored, the raw key may still be collected in server logs.
                </p>
                <p className="text-gray-400">
                  Your API key is stored locally in your browser and never persisted on the server.
                </p>
              </div>
            )}
          </label>
          <input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="sk-ant-..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-100 text-sm"
          />
        </div>
      </div>

      <ThemeSwitcher />
    </aside>
  );
}

