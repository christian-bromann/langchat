import type { ToolCall, ToolMessageData } from "@/app/types";

export interface ToolCallState {
  toolCall: ToolCall;
  toolMessage?: ToolMessageData;
  aiMessageId?: string; // The AI message that triggered this tool call
  timestamp: number; // When the tool call was created
  errored?: boolean; // Whether this tool call failed due to an error
}

export interface ToolCallBubbleProps {
  toolCallState: ToolCallState;
}

export function ToolCallBubble({ toolCallState }: ToolCallBubbleProps) {
  const isErrored = toolCallState.errored || (toolCallState.toolMessage && toolCallState.toolMessage.kwargs.status === "error");
  const borderColor = isErrored 
    ? "border-red-400 dark:border-red-500" 
    : "border-gray-300 dark:border-gray-700";
  const bgColor = isErrored 
    ? "bg-red-50 dark:bg-red-900/20" 
    : "bg-white dark:bg-gray-800";

  return (
    <div className="flex justify-start mt-4">
      <div className={`max-w-[80%] rounded-lg border-2 ${borderColor} ${bgColor} p-4`}>
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                Tool Call
              </span>
              <span className="text-sm font-mono font-semibold text-gray-900 dark:text-gray-100">
                {toolCallState.toolCall.name}
              </span>
              {isErrored && (
                <span className="text-xs px-2 py-0.5 rounded bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300">
                  Errored
                </span>
              )}
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

          {!toolCallState.toolMessage && !isErrored && (
            <div className="text-xs text-gray-500 dark:text-gray-400 italic">
              Waiting for result...
            </div>
          )}

          {isErrored && !toolCallState.toolMessage && (
            <div className="text-xs text-red-600 dark:text-red-400 italic">
              Tool call failed due to an error
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
