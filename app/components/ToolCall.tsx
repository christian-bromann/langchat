import type { ToolCall, ToolMessageData } from "@/app/types";

export interface ToolCallState {
  toolCall: ToolCall;
  toolMessage?: ToolMessageData;
  aiMessageId?: string; // The AI message that triggered this tool call
  timestamp: number; // When the tool call was created
}

export interface ToolCallBubbleProps {
  toolCallState: ToolCallState;
}

export function ToolCallBubble({ toolCallState }: ToolCallBubbleProps) {
  return (
    <div className="flex justify-start mt-4">
      <div className="max-w-[80%] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                Tool Call
              </span>
              <span className="text-sm font-mono font-semibold text-gray-900 dark:text-gray-100">
                {toolCallState.toolCall.name}
              </span>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded p-3">
              <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
                {JSON.stringify(toolCallState.toolCall.args, null, 2)}
              </pre>
            </div>
          </div>

          {toolCallState.toolMessage && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                  Result
                </span>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  toolCallState.toolMessage.kwargs.status === "success"
                    ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                    : "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300"
                }`}>
                  {toolCallState.toolMessage.kwargs.status}
                </span>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900 rounded p-3">
                <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap">
                  {toolCallState.toolMessage.kwargs.content}
                </pre>
              </div>
            </div>
          )}

          {!toolCallState.toolMessage && (
            <div className="text-xs text-gray-500 dark:text-gray-400 italic">
              Waiting for result...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
