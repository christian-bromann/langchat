"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ChatInterfaceProps {
  selectedScenario: string | null;
}

export default function ChatInterface({ selectedScenario }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
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

  const handleSend = async () => {
    if (!inputValue.trim() || !selectedScenario || isLoading) {
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const messageToSend = inputValue;
    setInputValue("");
    setIsLoading(true);

    // Create assistant message placeholder
    const assistantId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      // Determine API endpoint - use basic for now
      const apiEndpoint = "/api/basic";

      // Send request to API
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: messageToSend }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}: ${errorText}`);
      }

      // Handle SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let buffer = "";
      let hasReceivedData = false;

      // Reset refs for this stream
      accumulatedContentRef.current = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        hasReceivedData = true;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEventType = "update";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);

              if (currentEventType === "error") {
                const errorMessage = data.error || "Unknown error occurred";
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantId
                      ? { ...msg, content: `Error: ${errorMessage}` }
                      : msg
                  )
                );
                break;
              }

              // Handle different event formats
              // Format 1: data: [{...}] - array of messages (incremental chunks)
              // Format 2: data: {"messages": [...]} - object with messages array (final summary)
              let messagesToProcess: unknown[] = [];

              if (Array.isArray(data)) {
                // Direct array format - these are incremental chunks
                messagesToProcess = data;
              } else if (data.messages && Array.isArray(data.messages)) {
                // Object format with messages array
                // Skip if this is the final summary message (has full content)
                // Only process if it's incremental chunks
                const firstMsg = data.messages[0];
                if (firstMsg && firstMsg.kwargs && firstMsg.kwargs.content) {
                  const content = firstMsg.kwargs.content;
                  // If content is very long (likely final summary), skip it
                  // We've already processed incremental chunks
                  if (typeof content === "string" && content.length > 100) {
                    continue;
                  }
                }
                messagesToProcess = data.messages;
              }

              // Filter out user messages and only process AI messages
              const aiMessages = messagesToProcess.filter((msg: unknown) => {
                const m = msg as { id?: string[]; lc?: number; [key: string]: unknown };
                return (
                  m.lc === 1 &&
                  m.id &&
                  m.id[0] === "langchain_core" &&
                  m.id[1] === "messages" &&
                  (m.id[2] === "AIMessageChunk" || m.id[2] === "AIMessage")
                );
              });


              if (aiMessages.length > 0) {
                // Process each AI message chunk
                for (const msg of aiMessages) {
                  // Extract content from the message
                  let newContent = "";

                  if ((msg as { content?: unknown }).content !== undefined) {
                    const msgContent = (msg as { content: unknown }).content;
                    if (typeof msgContent === "string") {
                      newContent = msgContent;
                    } else if (Array.isArray(msgContent)) {
                      newContent = msgContent
                        .map((item: unknown) => {
                          if (typeof item === "string") return item;
                          if (item && typeof item === "object") {
                            if ("text" in item && typeof (item as { text: unknown }).text === "string") {
                              return String((item as { text: string }).text);
                            }
                            if ("content" in item) {
                              return String((item as { content: unknown }).content);
                            }
                          }
                          return "";
                        })
                        .join("");
                    }
                  } else if ((msg as { kwargs?: { content?: unknown } }).kwargs?.content) {
                    const kwargsContent = (msg as { kwargs: { content: unknown } }).kwargs.content;
                    if (typeof kwargsContent === "string") {
                      newContent = kwargsContent;
                    } else if (Array.isArray(kwargsContent)) {
                      newContent = kwargsContent
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

                  // Process incremental content chunks
                  // Each chunk contains only the new content, not accumulated content
                  if (newContent !== undefined && newContent !== null && newContent.length > 0) {
                    // Append the incremental chunk to accumulated content
                    accumulatedContentRef.current += newContent;
                    // Immediately update UI with the accumulated content (real-time streaming)
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantId
                          ? { ...msg, content: accumulatedContentRef.current }
                          : msg
                      )
                    );
                  }
                }
              }

              if (currentEventType === "end") {
                // Ensure all content is displayed when stream ends
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantId
                      ? { ...msg, content: accumulatedContentRef.current }
                      : msg
                  )
                );
                break;
              }
            } catch {
              // Silently ignore JSON parse errors for incomplete data
            }
          }
        }
      }

      // Ensure all content is displayed when stream ends
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: accumulatedContentRef.current }
            : msg
        )
      );

      if (!hasReceivedData) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: "No response received from the agent." }
              : msg
          )
        );
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content: `Error: ${error instanceof Error ? error.message : "Failed to get response"}`,
              }
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
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Image
              src="/langchain.png"
              alt="LangChain Logo"
              width={120}
              height={120}
              className="mb-6"
              priority
            />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Welcome to LangChat
            </h3>
            <p className="text-gray-600 dark:text-gray-400 max-w-md">
              Select an agent scenario from the sidebar to get started. This is a sandbox for
              showcasing different use cases of LangChain&apos;s <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-900 rounded">createAgent</code>.
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    message.role === "user"
                      ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
                      : "bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  }`}
                >
                  <p className="whitespace-pre-wrap">
                    {message.content}
                    {message.role === "assistant" && isLoading && message.content === "" && (
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
        <div className="max-w-3xl mx-auto px-6 py-4">
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
              onClick={handleSend}
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

