"use client";

import ThemeSwitcher from "./ThemeSwitcher";

interface AgentScenario {
  id: string;
  name: string;
}

const scenarios: AgentScenario[] = [
  { id: "simple-agent", name: "Simple Agent" },
  // { id: "human-in-the-loop", name: "Human In the Loop" },
  // { id: "summarization", name: "Summarization" },
  // { id: "model-call-limits", name: "Model Call Limits" },
];

interface SidebarProps {
  selectedScenario: string | null;
  onScenarioSelect: (scenarioId: string) => void;
}

export default function Sidebar({ selectedScenario, onScenarioSelect }: SidebarProps) {
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
      <ThemeSwitcher />
    </aside>
  );
}

