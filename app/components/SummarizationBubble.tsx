import { useState } from "react";
import { UpdateData } from "../types";

export interface SummarizationEvent {
  id: string;
  timestamp: number;
  summary: string;
  afterMessageIndex: number; // Index after which this summarization should appear
}

/**
 * SummarizationBubble component
 * @param summary - The summarization event
 * @returns The SummarizationBubble component
 */
export const SummarizationBubble = ({ summary }: { summary: SummarizationEvent }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="flex justify-center my-4">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 max-w-2xl w-full">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <svg
                className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                Summarization Middleware Activated
              </span>
              <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded">
                Previous conversation summarized
              </span>
            </div>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium mb-2"
            >
              {isExpanded ? "Hide summary" : "Show summary"}
            </button>
            {isExpanded && (
              <div className="text-sm text-blue-800 dark:text-blue-200 bg-white dark:bg-gray-900/50 rounded p-3 border border-blue-200 dark:border-blue-800 mt-2">
                <pre className="whitespace-pre-wrap font-mono text-xs overflow-x-auto">
                  {summary.summary}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export function parseSummarizationEvent(data: UpdateData, currentMessageCount: number, onSummarization: (summary: SummarizationEvent) => void): void {
  if (data && typeof data === "object" && "SummarizationMiddleware.before_model" in data) {
    const summarizationData = (data as unknown as Record<string, unknown>)["SummarizationMiddleware.before_model"];
    if (!summarizationData || typeof summarizationData !== "object" || !("messages" in summarizationData)) {
      return;
    }

    const messages = (summarizationData as { messages: unknown[] }).messages;
    if (!Array.isArray(messages)) {
      return;
    }

    // Find the message with the summary (LangGraph native format)
    for (const msg of messages) {
      if (!msg || typeof msg !== "object") {
        continue;
      }

      const msgAny = msg as Record<string, unknown>;
      if (!("type" in msgAny) || !("content" in msgAny)) {
        continue;
      }

      let content: string | undefined;

      // Handle string content
      if (typeof msgAny.content === "string") {
        content = msgAny.content;
      }
      // Handle array content (extract text from content blocks)
      else if (Array.isArray(msgAny.content)) {
        const textParts: string[] = [];
        for (const item of msgAny.content) {
          if (!item) {
            continue;
          }

          if (typeof item === "object") {
            // Handle text content blocks: {type: "text", text: "..."}
            if ("type" in item && item.type === "text" && "text" in item && typeof item.text === "string") {
              textParts.push(item.text);
            }
          } else if (typeof item === "string") {
            // Handle direct string content in array
            textParts.push(item);
          }
        }
        if (textParts.length > 0) {
          content = textParts.join("");
        }
      }

      if (!content || !content.includes("## Previous conversation summary:")) {
        continue;
      }

      // Extract summary content
      const summary = content.replace("## Previous conversation summary:\n", "").trim();
      onSummarization({
        id: `summarization-${Date.now()}`,
        timestamp: Date.now(),
        summary: summary,
        afterMessageIndex: Math.max(0, currentMessageCount - 1), // After the last message
      });
      break;
    }
  }
}
