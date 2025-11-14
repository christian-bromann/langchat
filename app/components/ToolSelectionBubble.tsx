import { useState } from "react";

export interface ToolSelectionEvent {
  availableTools: string[];
  selectedTools: string[];
  timestamp: number;
  afterMessageIndex?: number; // Index after which this tool selection should appear
}

/**
 * ToolSelectionBubble component
 * Displays which tools were selected by the LLM Tool Selector middleware
 */
export const ToolSelectionBubble = ({ selection }: { selection: ToolSelectionEvent }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const filteredOutTools = selection.availableTools.filter(
    (tool) => !selection.selectedTools.includes(tool)
  );

  return (
    <div className="flex justify-start mt-4">
      <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 max-w-[80%]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <svg
                className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                />
              </svg>
              <span className="text-sm font-semibold text-purple-900 dark:text-purple-100">
                LLM Tool Selector
              </span>
              <span className="text-xs text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/50 px-2 py-0.5 rounded">
                {selection.selectedTools.length} of {selection.availableTools.length} tools selected
              </span>
            </div>

            <div className="space-y-2">
              <div>
                <div className="text-xs font-medium text-purple-800 dark:text-purple-200 mb-1">
                  Selected Tools ({selection.selectedTools.length}):
                </div>
                <div className="flex flex-wrap gap-1">
                  {selection.selectedTools.map((tool) => (
                    <span
                      key={tool}
                      className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-200 dark:bg-purple-800 text-purple-900 dark:text-purple-100"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>

              {filteredOutTools.length > 0 && (
                <>
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 font-medium"
                  >
                    {isExpanded ? "Hide" : "Show"} filtered out tools ({filteredOutTools.length})
                  </button>
                  {isExpanded && (
                    <div className="text-xs text-purple-700 dark:text-purple-300 bg-white dark:bg-gray-900/50 rounded p-3 border border-purple-200 dark:border-purple-800">
                      <div className="font-medium mb-2">Filtered Out Tools:</div>
                      <div className="flex flex-wrap gap-1">
                        {filteredOutTools.map((tool) => (
                          <span
                            key={tool}
                            className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 line-through opacity-60"
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

