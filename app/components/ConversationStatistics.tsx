"use client";

import { useState } from "react";
import { useStatistics } from "@/app/contexts/StatisticsContext";

export function ConversationStatistics() {
  const [showToolCallsTooltip, setShowToolCallsTooltip] = useState(false);
  const { statistics } = useStatistics();

  // Calculate total tool calls
  const totalToolCalls = Array.from(statistics.toolCalls.values()).reduce((sum, count) => sum + count, 0);

  // Format tool calls for tooltip
  const toolCallsList = Array.from(statistics.toolCalls.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name}: ${count}`)
    .join("\n");

  return (
    <div className="mt-auto p-6 border-t border-gray-200 dark:border-gray-800">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
        Conversation Statistics
      </h3>
      <div className="space-y-3">
        {/* Tool Calls */}
        <div className="relative">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Tool Calls</span>
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {totalToolCalls}
              </span>
              {totalToolCalls > 0 && (
                <button
                  type="button"
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  onMouseEnter={() => setShowToolCallsTooltip(true)}
                  onMouseLeave={() => setShowToolCallsTooltip(false)}
                  aria-label="Tool calls details"
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
              )}
            </div>
          </div>
          {showToolCallsTooltip && totalToolCalls > 0 && (
            <div className="absolute bottom-full left-0 mb-2 w-64 p-3 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg z-10 pointer-events-none">
              <p className="font-semibold mb-2">Tool Calls Breakdown</p>
              <pre className="whitespace-pre-wrap font-mono text-xs">
                {toolCallsList || "No tool calls yet"}
              </pre>
            </div>
          )}
        </div>

        {/* Model Calls */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Model Calls</span>
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {statistics.modelCalls}
          </span>
        </div>

        {/* Tokens */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Tokens</span>
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {statistics.tokens.total.toLocaleString()}
          </span>
        </div>
        {statistics.tokens.total > 0 && (
          <div className="pl-4 text-xs text-gray-500 dark:text-gray-500">
            <div className="flex justify-between">
              <span>Input:</span>
              <span>{statistics.tokens.input.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Output:</span>
              <span>{statistics.tokens.output.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

