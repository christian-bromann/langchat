"use client";

interface ErrorBubbleProps {
  error: string;
  aiMessageId?: string;
}

export function ErrorBubble({ error }: ErrorBubbleProps) {
  return (
    <div className="flex justify-start mt-4">
      <div className="max-w-[80%] rounded-lg border-2 border-red-400 dark:border-red-500 bg-red-50 dark:bg-red-900/20 p-4">
        <div className="space-y-2">
          {/* Header */}
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-xs font-semibold text-red-700 dark:text-red-300 uppercase">
              Error
            </span>
          </div>

          {/* Error Message */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-800 dark:text-red-200 whitespace-pre-wrap">
              {error}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

