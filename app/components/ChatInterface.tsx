"use client";

import { useState, useEffect, useRef } from "react";

import { HumanMessage, BaseMessage, AIMessage } from "@langchain/core/messages";

import { WelcomeScreen } from "./Welcome";
import { EVENT_TYPES } from "@/app/constants";
import type { EventType, UpdateData, InterruptEventData, AgentEventData, AIMessageChunk, ChunkUpdateData } from "@/app/types";

interface ChatInterfaceProps {
  selectedScenario?: string;
  apiKey: string;
}

function isAIMessageOrAIMessageChunk(msg: unknown): boolean {
  const m = msg as { id?: string[]; lc?: number; [key: string]: unknown };
  return !!(
    m.lc === 1 &&
    m.id &&
    m.id[0] === "langchain_core" &&
    m.id[1] === "messages" &&
    (m.id[2] === "AIMessageChunk" || m.id[2] === "AIMessage")
  );
}

export default function ChatInterface({ selectedScenario, apiKey }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<BaseMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const accumulatedContentRef = useRef<string>("");

  // Auto-resize textarea and sync button height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "52px";
      const scrollHeight = textareaRef.current.scrollHeight;
      const newHeight = Math.min(scrollHeight, 200);
      textareaRef.current.style.height = `${newHeight}px`;

      // Sync button height to match textarea's actual height
      if (buttonRef.current) {
        const height = textareaRef.current.offsetHeight;
        buttonRef.current.style.height = `${height}px`;
      }
    }
  }, [inputValue]);

  const handleSend = async (messageOverride?: string) => {
    const messageToSend = messageOverride || inputValue;

    if (!messageToSend.trim() || !selectedScenario || isLoading) {
      return;
    }

    if (!apiKey.trim()) {
      setMessages((prev) => [
        ...prev,
        new AIMessage("⚠️ Please enter your Anthropic API key in the sidebar to use this app."),
      ]);
      return;
    }

    const userMessage = new HumanMessage(messageToSend);

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    // Create assistant message placeholder
    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, new AIMessage({
      id: assistantId,
      content: "",
    })]);

    try {
      // Determine API endpoint - use basic for now
      const apiEndpoint = "/api/basic";

      // Send request to API
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: messageToSend, apiKey }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}: ${errorText}`);
      }

      let hasReceivedData = false;

      // Reset refs for this stream
      accumulatedContentRef.current = "";

      // Helper function to process update data
      const processUpdateData = (data: UpdateData) => {
        // Extract messages from the update data
        const messagesToProcess = extractMessagesFromUpdateData(data);

        if (messagesToProcess.length > 0) {
          // Check if this is a final summary message (contains full accumulated content)
          const firstMsg = messagesToProcess[0];
          const content = extractContentFromMessage(firstMsg);

          // Skip if this content matches or starts with what we've already accumulated
          // This indicates it's a final summary, not an incremental chunk
          if (content && accumulatedContentRef.current.length > 0) {
            const accumulated = accumulatedContentRef.current;
            if (
              content === accumulated ||
              (content.length >= accumulated.length && content.startsWith(accumulated))
            ) {
              return;
            }
          }

          // Process each AI message chunk
          for (const msg of messagesToProcess) {
            const newContent = extractContentFromMessage(msg);

            // Process incremental content chunks
            // Each chunk contains only the new content, not accumulated content
            if (newContent !== undefined && newContent !== null && newContent.length > 0) {
              // Append the incremental chunk to accumulated content
              accumulatedContentRef.current += newContent;
              // Immediately update UI with the accumulated content (real-time streaming)
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId
                    ? new AIMessage({ ...msg, content: accumulatedContentRef.current })
                    : msg
                )
              );
            }
          }
        }
      };

      readStream(response, {
        update: (data: UpdateData) => {
          hasReceivedData = true;
          processUpdateData(data);
        },
        interrupt: () => {
          // Handle interrupt events if needed
        },
        agent: () => {
          // Handle agent events if needed
        },
        end: () => {
          // Ensure all content is displayed when stream ends
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? new AIMessage({ ...msg, content: accumulatedContentRef.current })
                : msg
            )
          );
        },
        error: (error: Error) => {
          const errorMessage = error.message || "Unknown error occurred";
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? new AIMessage({ ...msg, content: `Error: ${errorMessage}` })
                : msg
            )
          );
        },
      });

      // Ensure all content is displayed when stream ends
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? new AIMessage({ ...msg, content: accumulatedContentRef.current })
            : msg
        )
      );

      if (!hasReceivedData) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? new AIMessage({ ...msg, content: "No response received from the agent." })
              : msg
          )
        );
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? new AIMessage({
                ...msg,
                content: `Error: ${error instanceof Error ? error.message : "Failed to get response"}`,
              })
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <WelcomeScreen selectedScenario={selectedScenario} apiKey={apiKey} handleSend={handleSend} />
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((message) => (
              <div
                key={message.id || Date.now()}
                className={`flex ${
                  HumanMessage.isInstance(message) ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    HumanMessage.isInstance(message)
                      ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
                      : "bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  }`}
                >
                  <p className="whitespace-pre-wrap">
                    {message.content as string}
                    {AIMessage.isInstance(message) && isLoading && message.content === "" && (
                      <span className="inline-block w-2 h-4 bg-gray-400 dark:bg-gray-600 ml-1 animate-pulse" />
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-black">
        <div className="max-w-3xl mx-auto px-6 py-[14px]">
          {/* Input Box */}
          <div className="flex items-start gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={selectedScenario ? "Type your message..." : "Select a scenario first..."}
                rows={1}
                className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-100 resize-none overflow-hidden"
                style={{
                  minHeight: "52px",
                  maxHeight: "200px",
                }}
              />
            </div>
            <button
              ref={buttonRef}
              onClick={() => handleSend()}
              disabled={!inputValue.trim() || !selectedScenario || isLoading}
              className="px-6 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center shrink-0 cursor-pointer"
              style={{
                height: "52px",
              }}
            >
              {isLoading ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface StreamEventCallbacks {
  update: (data: UpdateData) => void;
  interrupt: (data: InterruptEventData) => void;
  agent: (data: AgentEventData) => void;
  end: () => void;
  error: (error: Error) => void;
}

/**
 * Reads a stream from the API and calls the callback function for each event.
 * @param response - The response from the API
 * @param callback - The callback function to handle the event
 * @returns void
 * @throws Error if the response body is not found or the event type is unknown
 * @throws Error if the event type is unknown
 * @throws Error if the data is not valid JSON
 */
async function readStream (response: Response, callbacks: StreamEventCallbacks) {
  // Handle SSE stream
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error("No response body");
  }

  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    let currentEventType: EventType = "update";
    for (const line of lines) {
      if (!line) {
        continue;
      }

      if (line.startsWith("event: ")) {
        currentEventType = line.slice(7).trim() as EventType;

        if (!EVENT_TYPES.includes(currentEventType)) {
          throw new Error(`Unknown event type: ${currentEventType}`);
        }
        continue
      }

      if (line.startsWith("data: ")) {
        const dataStr = line.slice(6);
        try {
          const data = JSON.parse(dataStr);

          // Handle different event types with appropriate callbacks
          if (currentEventType === "end") {
            callbacks.end();
          } else if (currentEventType === "error") {
            // Convert error data to Error object
            const errorMessage = typeof data === "string" ? data : data?.error || "Unknown error occurred";
            callbacks.error(new Error(errorMessage));
          } else {
            if (!(currentEventType in callbacks)) {
              throw new Error(`Unknown event type: ${currentEventType}`);
            }

            // For update, interrupt, and agent events, pass the data
            callbacks[currentEventType](data);
          }
        } catch (error) {
          console.error("Error parsing stream data:", error);
          // If parsing fails, treat it as an error event
          callbacks.error(error instanceof Error ? error : new Error("Failed to parse stream data"));
        }

        continue;
      }

      console.error("Unknown line in stream:", line);
    }
  }
}

// Helper function to extract messages from different update data formats
const extractMessagesFromUpdateData = (data: UpdateData): AIMessageChunk[] => {
  // Check if it's a ChunkUpdateData (array format)
  if (Array.isArray(data)) {
    // ChunkUpdateData is [AIMessageChunk, LangGraphMetadata]
    const chunkData = data as ChunkUpdateData;
    return [chunkData[0]];
  }

  // Check if it's MessagesUpdateData
  if ("messages" in data && Array.isArray(data.messages)) {
    return data.messages.filter(isAIMessageOrAIMessageChunk) as AIMessageChunk[];
  }

  // Check if it's ModelRequestUpdateData
  if ("model_request" in data && data.model_request?.messages) {
    return data.model_request.messages;
  }

  // Check if it's FullUpdateData
  if ("messages" in data && "_privateState" in data && Array.isArray(data.messages)) {
    return data.messages.filter(isAIMessageOrAIMessageChunk) as AIMessageChunk[];
  }

  return [];
};

// Helper function to extract content from AIMessageChunk
const extractContentFromMessage = (msg: AIMessageChunk): string => {
  let content = "";

  // Try to get content from kwargs.content first
  if (msg.kwargs?.content !== undefined) {
    const kwargsContent = msg.kwargs.content;
    if (typeof kwargsContent === "string") {
      content = kwargsContent;
    } else if (Array.isArray(kwargsContent)) {
      content = (kwargsContent as unknown[])
        .map((item: unknown) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && "text" in item) {
            return String((item as { text: string }).text);
          }
          return "";
        })
        .join("");
    }
  }

  return content;
};
