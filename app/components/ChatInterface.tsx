"use client";

import { useState, useEffect, useRef, useCallback } from "react";

import type { HITLRequest } from "langchain";
import { HumanMessage, BaseMessage, AIMessage } from "@langchain/core/messages";

import { WelcomeScreen } from "./Welcome";
import { EVENT_TYPES } from "@/app/constants";
import type { EventType, UpdateData, AgentEventData, AIMessageChunk, ToolCall, AgentStateEventData, ModelRequestEventData, ToolsEventData, ToolMessageData } from "@/app/types";
import { ToolCallBubble, type ToolCallState } from "./ToolCall";
import { InterruptBubble } from "./InterruptBubble";
import { SummarizationBubble, type SummarizationEvent, parseSummarizationEvent } from "./SummarizationBubble";
import { ErrorBubble } from "./ErrorBubble";
import { useStatistics } from "@/app/contexts/StatisticsContext";

interface ChatInterfaceProps {
  selectedScenario?: string;
  apiKey: string;
}

function isAIMessageChunk(chunk: unknown): boolean {
  return Boolean(
    chunk &&
    typeof chunk === "object" &&
    "lc" in chunk &&
    "kwargs" in chunk &&
    "id" in chunk &&
    Array.isArray(chunk.id) &&
    chunk.id[2] === "AIMessageChunk"
  )
}

function isToolMessage(chunk: unknown): boolean {
  return Boolean(
    chunk &&
    typeof chunk === "object" &&
    "lc" in chunk &&
    "kwargs" in chunk &&
    "id" in chunk &&
    Array.isArray(chunk.id) &&
    chunk.id[2] === "ToolMessage"
  )
}

export default function ChatInterface({ selectedScenario, apiKey }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<BaseMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [toolCalls, setToolCalls] = useState<Map<string, ToolCallState>>(new Map());
  const [interruptData, setInterruptData] = useState<HITLRequest | null>(null);
  const [currentThreadId, setCurrentThreadId] = useState<string | undefined>(undefined);
  const [summarizations, setSummarizations] = useState<SummarizationEvent[]>([]);
  const [errors, setErrors] = useState<Map<string, string>>(new Map()); // Map of AI message ID to error message
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const accumulatedContentRef = useRef<string>("");
  const messageCountRef = useRef<number>(0);
  const processedTokenMessagesRef = useRef<Set<string>>(new Set());
  const processedToolCallIdsRef = useRef<Set<string>>(new Set());
  const { recordToolCall, recordModelCall, recordTokens, resetStatistics } = useStatistics();

  // Reset state when scenario changes
  useEffect(() => {
    setMessages([]);
    setToolCalls(new Map());
    setInterruptData(null);
    setCurrentThreadId(undefined);
    setInputValue("");
    setSummarizations([]);
    setErrors(new Map());
    messageCountRef.current = 0;
    accumulatedContentRef.current = "";
    processedTokenMessagesRef.current = new Set();
    processedToolCallIdsRef.current = new Set();
    resetStatistics();
  }, [selectedScenario, resetStatistics]);

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

  const updateToolCallArgs = useCallback((modelRequest: ModelRequestEventData) => {
    const tc = modelRequest.model_request.messages
      .find((msg) => msg.kwargs.tool_calls)?.kwargs.tool_calls || [] as ToolCall[];

    setToolCalls((prevToolCalls) => {
      const newMap = new Map<string, ToolCallState>();
      for (const [id, toolCall] of prevToolCalls) {
        const updatedToolCall = tc.find((tc) => tc.id === id);
        newMap.set(id, updatedToolCall ? {
          ...toolCall,
          toolCall: updatedToolCall
        } : toolCall);
      }
      return newMap;
    });
  }, []);

  const handleSend = async (messageOverride?: string, interruptResponse?: { decisions: Array<{ type: "approve" | "reject" | "edit"; editedAction?: { name: string; args: Record<string, unknown> }; message?: string }> } ) => {
    const messageToSend = messageOverride || inputValue;

    // Allow sending if we have a message OR if we're resuming from an interrupt
    if ((!messageToSend.trim() && !interruptResponse) || !selectedScenario || isLoading) {
      return;
    }

    if (!apiKey.trim()) {
      setMessages((prev) => [
        ...prev,
        new AIMessage("⚠️ Please enter your Anthropic API key in the sidebar to use this app."),
      ]);
      return;
    }

    // Only add user message if not resuming from interrupt
    if (!interruptResponse && messageToSend.trim()) {
      const userMessage = new HumanMessage(messageToSend);
      setMessages((prev) => {
        const newMessages = [...prev, userMessage];
        messageCountRef.current = newMessages.length;
        return newMessages;
      });
      setInputValue("");
    }

    // Track current AI message ID - will be updated when we detect a new message
    let currentAssistantId = (Date.now() + 1).toString();
    const accumulatedContentByMessageRef = new Map<string, string>();

    try {
      // Determine API endpoint based on selected scenario
      let apiEndpoint = "/api/basic";
      if (selectedScenario === "human-in-the-loop") {
        apiEndpoint = "/api/hitl";
      } else if (selectedScenario === "summarization") {
        apiEndpoint = "/api/summarization";
      } else if (selectedScenario === "model-call-limits") {
        apiEndpoint = "/api/model-call-limits";
      } else if (selectedScenario === "tool-call-limits") {
        apiEndpoint = "/api/tool-call-limits";
      }

      // Generate or use existing thread ID
      const threadId = currentThreadId || `thread-${Date.now()}`;
      if (!currentThreadId) {
        setCurrentThreadId(threadId);
      }

      // Send request to API
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: messageToSend,
          apiKey,
          threadId,
          interruptResponse: interruptResponse ? JSON.stringify(interruptResponse) : undefined,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}: ${errorText}`);
      }

      // Reset refs for this stream
      accumulatedContentRef.current = "";

      // Reset current assistant ID
      accumulatedContentByMessageRef.clear();

      // Helper function to update tool call state with tool message result
      const updateToolCallWithMessage = (toolMsg: ToolMessageData) => {
        const toolCallId = toolMsg.kwargs?.tool_call_id as string | undefined;
        if (!toolCallId) {
          return;
        }

        setToolCalls((prev) => {
          const newMap = new Map(prev);
          const existing = newMap.get(toolCallId);
          if (existing) {
            newMap.set(toolCallId, { ...existing, toolMessage: toolMsg });
          } else {
            // If we haven't seen the tool call yet, create a placeholder
            newMap.set(toolCallId, {
              toolCall: {
                id: toolCallId,
                name: toolMsg.kwargs?.name as string || "unknown",
                args: {},
                type: "tool_call"
              },
              toolMessage: toolMsg,
              aiMessageId: currentAssistantId,
              timestamp: Date.now()
            });
          }
          return newMap;
        });
      };

      // Helper function to process update events (streaming AIMessageChunk data or ToolMessage data)
      const processUpdate = (data: UpdateData) => {
        /**
         * Parse the summarization event from the update data
         */
        parseSummarizationEvent(data, messageCountRef.current, (summary) => {
          setSummarizations((prev) => [
            ...prev,
            summary,
          ]);
        });

        // Check if this is an array update (either [AIMessageChunk, LangGraphMetadata] or [ToolMessage, LangGraphMetadata])
        if (!Array.isArray(data) || data.length !== 2) {
          return;
        }

        // Handle ToolMessage updates
        if (isToolMessage(data[0])) {
          const toolMsg = data[0] as unknown as ToolMessageData;
          updateToolCallWithMessage(toolMsg);
          return;
        }

        // Handle AIMessageChunk updates
        if (!isAIMessageChunk(data[0])) {
          return;
        }

        const msg = data[0] as AIMessageChunk;
        const msgId = msg.kwargs?.id as string | undefined;
        const messageId = msgId || currentAssistantId;

        // Check if this is a new AI message (different ID)
        if (msgId && msgId !== currentAssistantId) {
          currentAssistantId = msgId;

          // Create a new AI message bubble if it doesn't exist
          setMessages((prev) => {
            const exists = prev.some(m => m.id === msgId);
            if (!exists) {
              const newMessages = [...prev, new AIMessage({
                id: msgId,
                content: "",
              })];
              messageCountRef.current = newMessages.length;
              return newMessages;
            }
            return prev;
          });

          // Initialize accumulated content for this message
          if (!accumulatedContentByMessageRef.has(msgId)) {
            accumulatedContentByMessageRef.set(msgId, "");
          }
        }

        // Extract text content from the chunk
        const chunkText = extractIncrementalTextFromChunk(msg);

        if (chunkText !== null && chunkText !== "") {
          const currentAccumulated = accumulatedContentByMessageRef.get(messageId) || "";

          // Determine if this is incremental (append) or full replacement
          let updatedContent: string;
          // If no accumulated content yet, always treat as incremental (first chunk)
          if (!currentAccumulated) {
            updatedContent = chunkText;
          } else if (chunkText.startsWith(currentAccumulated) && chunkText.length > currentAccumulated.length) {
            // Full replacement: chunk contains accumulated + new text
            updatedContent = chunkText;
          } else if (chunkText === currentAccumulated) {
            // Duplicate chunk, skip
            return;
          } else {
            // Incremental chunk: append new text to accumulated
            updatedContent = currentAccumulated + chunkText;
          }

          // Only update if content actually changed
          if (updatedContent !== currentAccumulated) {
            accumulatedContentByMessageRef.set(messageId, updatedContent);

            // Immediately update UI with the accumulated content (real-time streaming)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === messageId
                  ? new AIMessage({ ...m, content: updatedContent })
                  : m
              )
            );
          }
        }

        // Extract tool calls from the message
        const toolCallsFromMsg = extractToolCallsFromMessage(msg);
        const associatedMessageId = msgId || currentAssistantId;
        for (const toolCall of toolCallsFromMsg) {
          setToolCalls((prev) => {
            const newMap = new Map(prev);
            if (!newMap.has(toolCall.id)) {
              newMap.set(toolCall.id, {
                toolCall,
                aiMessageId: associatedMessageId,
                timestamp: Date.now()
              });
            }
            return newMap;
          });
        }
      };

      setIsLoading(true);
      readStream(response, {
        update: (data: UpdateData) => {
          // Process update events which contain streaming AIMessageChunk data
          processUpdate(data);
        },
        tools: (data: ToolsEventData) => {
          const toolMessages = data.tools?.messages || [];
          for (const toolMsg of toolMessages) {
            updateToolCallWithMessage(toolMsg);
          }
        },
        model_request: (data: ModelRequestEventData) => {
          updateToolCallArgs(data);
          recordModelCall();

          // Track token usage and tool calls from model_request events (these contain final, accurate counts)
          const messages = data.model_request?.messages || [];

          for (const message of messages) {
            // Track tokens
            if (message.kwargs?.usage_metadata) {
              const usage = message.kwargs.usage_metadata;
              const input = usage.input_tokens || 0;
              const output = usage.output_tokens || 0;
              const total = usage.total_tokens || input + output;

              // Only track if we have valid token counts (input_tokens > 0 indicates final count)
              if (input > 0 && total > 0) {
                const messageId = message.kwargs?.id as string | undefined;
                if (messageId && !processedTokenMessagesRef.current.has(messageId)) {
                  recordTokens(input, output, total);
                  processedTokenMessagesRef.current.add(messageId);
                }
              }
            }

            // Track tool calls (only once per unique tool call ID across the conversation)
            if (message.kwargs?.tool_calls && Array.isArray(message.kwargs.tool_calls)) {
              for (const toolCall of message.kwargs.tool_calls) {
                if (toolCall && typeof toolCall === "object" && "id" in toolCall && "name" in toolCall) {
                  const toolCallId = toolCall.id as string;
                  if (!processedToolCallIdsRef.current.has(toolCallId)) {
                    recordToolCall(toolCall.name as string);
                    processedToolCallIdsRef.current.add(toolCallId);
                  }
                }
              }
            }
          }
        },
        interrupt: (data: HITLRequest) => {
          // Handle interrupt event - show bubble for user approval
          if (data && Array.isArray(data.actionRequests) && data.actionRequests.length > 0) {
            setInterruptData(data);
          }
        },
        end: () => {
          setIsLoading(false);
          // Ensure all content is displayed when stream ends
          setMessages((prev) =>
            prev.map((msg) => {
              const msgAccumulated = accumulatedContentByMessageRef.get(msg.id || "") || "";
              if (msgAccumulated && msgAccumulated !== msg.content) {
                return new AIMessage({ ...msg, content: msgAccumulated });
              }
              return msg;
            })
          );
        },
        error: (error: Error) => {
          setIsLoading(false);
          const errorMessage = error.message || "Unknown error occurred";

          // Store error associated with the current AI message
          if (currentAssistantId) {
            setErrors((prev) => {
              const newMap = new Map(prev);
              newMap.set(currentAssistantId, errorMessage);
              return newMap;
            });
          }

          // Mark all pending tool calls (those without toolMessage) as errored
          setToolCalls((prev) => {
            const newMap = new Map<string, ToolCallState>();
            for (const [id, toolCall] of prev) {
              // If this tool call is associated with the current assistant message and has no toolMessage yet, mark it as errored
              if (toolCall.aiMessageId === currentAssistantId && !toolCall.toolMessage) {
                newMap.set(id, { ...toolCall, errored: true });
              } else {
                newMap.set(id, toolCall);
              }
            }
            return newMap;
          });
        },
      });

      // Ensure all content is displayed when stream ends
      setMessages((prev) =>
        prev.map((msg) => {
          const msgAccumulated = accumulatedContentByMessageRef.get(msg.id || "") || "";
          if (msgAccumulated && msgAccumulated !== msg.content) {
            return new AIMessage({ ...msg, content: msgAccumulated });
          }
          return msg;
        })
      );
    } catch (error) {
      console.error("Error sending message:", error);
      setIsLoading(false);
      const errorMessage = error instanceof Error ? error.message : "Failed to get response";

      // If we have a current assistant ID, store the error and mark pending tool calls as errored
      if (currentAssistantId) {
        setErrors((prev) => {
          const newMap = new Map(prev);
          newMap.set(currentAssistantId, errorMessage);
          return newMap;
        });

        // Mark all pending tool calls as errored
        setToolCalls((prev) => {
          const newMap = new Map<string, ToolCallState>();
          for (const [id, toolCall] of prev) {
            if (toolCall.aiMessageId === currentAssistantId && !toolCall.toolMessage) {
              newMap.set(id, { ...toolCall, errored: true });
            } else {
              newMap.set(id, toolCall);
            }
          }
          return newMap;
        });
      } else {
        // If there's no assistant message yet, create one with the error
        // This handles cases where the error occurs before any response
        const errorMsg = new AIMessage({
          content: `Error: ${errorMessage}`,
        });
        setMessages((prev) => [...prev, errorMsg]);
        setErrors((prev) => {
          const newMap = new Map(prev);
          if (errorMsg.id) {
            newMap.set(errorMsg.id, errorMessage);
          }
          return newMap;
        });
      }
    }
  };

  const handleInterruptApprove = async () => {
    if (!interruptData) return;

    const interruptResponse = {
      decisions: [{
        type: "approve" as const,
      }],
    };

    setInterruptData(null);
    await handleSend("", interruptResponse);
  };

  const handleInterruptReject = async (message?: string) => {
    if (!interruptData) return;

    const interruptResponse = {
      decisions: [{
        type: "reject" as const,
        ...(message ? { message } : {}),
      }],
    };

    setInterruptData(null);
    await handleSend("", interruptResponse);
  };

  const handleInterruptEdit = async (editedArgs: Record<string, unknown>) => {
    if (!interruptData) return;

    const actionRequest = interruptData.actionRequests[0];
    const interruptResponse = {
      decisions: [{
        type: "edit" as const,
        editedAction: {
          name: actionRequest.name,
          args: editedArgs,
        },
      }],
    };

    setInterruptData(null);
    await handleSend("", interruptResponse);
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
            {/* Render messages and summarizations interleaved */}
            {(() => {
              // Create a combined array of messages and summarizations
              const items: Array<{ type: 'message' | 'summarization'; data: BaseMessage | SummarizationEvent; index: number }> = [];

              // Add all messages
              messages.forEach((msg, index) => {
                items.push({ type: 'message', data: msg, index });
              });

              // Add summarizations at their correct positions
              summarizations.forEach((summ) => {
                // Insert summarization after the specified message index
                items.push({
                  type: 'summarization',
                  data: summ,
                  index: summ.afterMessageIndex + 0.5 // Use 0.5 to place between messages
                });
              });

              // Sort by index (messages have integer indices, summarizations have index + 0.5)
              items.sort((a, b) => a.index - b.index);

              return items.map((item) => {
                if (item.type === 'summarization') {
                  return <SummarizationBubble key={item.data.id} summary={item.data as SummarizationEvent} />;
                }

                const message = item.data as BaseMessage;
                const messageIndex = Math.floor(item.index);

                // Get tool calls associated with this AI message
                const associatedToolCalls = AIMessage.isInstance(message) && message.id
                  ? Array.from(toolCalls.values())
                      .filter((tc) => tc.aiMessageId === message.id)
                      .sort((a, b) => a.timestamp - b.timestamp)
                  : [];

                const errorMessage = message.id ? errors.get(message.id) : undefined;

                return (
                  <div key={message.id || messageIndex}>
                    {/* Message */}
                    {message.content !== "" && <div
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
                          {messageIndex === messages.length - 1 && isLoading && (
                            <span className="inline-block w-2 h-4 bg-gray-400 dark:bg-gray-600 ml-1 animate-pulse" />
                          )}
                        </p>
                      </div>
                    </div>}
                    {/* Tool calls associated with this message */}
                    {associatedToolCalls.map((toolCallState) => (
                      <ToolCallBubble key={toolCallState.toolCall.id} toolCallState={toolCallState} />
                    ))}
                    {/* Error bubble associated with this message */}
                    {errorMessage && AIMessage.isInstance(message) && (
                      <ErrorBubble error={errorMessage} aiMessageId={message.id} />
                    )}
                  </div>
                );
              });
            })()}
            {/* Interrupt Bubble - shown below messages when interrupt occurs */}
            {interruptData && (
              <InterruptBubble
                interruptData={interruptData}
                onApprove={handleInterruptApprove}
                onReject={handleInterruptReject}
                onEdit={handleInterruptEdit}
              />
            )}
            {!interruptData && isLoading && (
              <div className="flex justify-center items-center gap-1.5 py-2">
                <span className="inline-block w-2 h-2 bg-gray-400 dark:bg-gray-600 rounded-full animate-dot-wave" style={{ animationDelay: '0ms' }} />
                <span className="inline-block w-2 h-2 bg-gray-400 dark:bg-gray-600 rounded-full animate-dot-wave" style={{ animationDelay: '200ms' }} />
                <span className="inline-block w-2 h-2 bg-gray-400 dark:bg-gray-600 rounded-full animate-dot-wave" style={{ animationDelay: '400ms' }} />
              </div>
            )}
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
  update?: (data: UpdateData) => void;
  interrupt?: (data: HITLRequest) => void;
  agent?: (data: AgentEventData) => void;
  agent_state?: (data: AgentStateEventData) => void;
  model_request?: (data: ModelRequestEventData) => void;
  tools?: (data: ToolsEventData) => void;
  end?: () => void;
  error?: (error: Error) => void;
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
            callbacks.end?.();
          } else if (currentEventType === "error") {
            // Convert error data to Error object
            const errorMessage = typeof data === "string" ? data : data?.error || "Unknown error occurred";
            callbacks.error?.(new Error(errorMessage));
          } else if (currentEventType === "agent_state") {
            callbacks.agent_state?.(data as AgentStateEventData);
          } else if (currentEventType === "model_request") {
            callbacks.model_request?.(data as ModelRequestEventData);
          } else if (currentEventType === "tools") {
            callbacks.tools?.(data as ToolsEventData);
          } else if (currentEventType === "interrupt") {
            callbacks.interrupt?.(data as HITLRequest);
          } else {
            if (!(currentEventType in callbacks)) {
              throw new Error(`Unknown event type: ${currentEventType}`);
            }

            callbacks[currentEventType]?.(data);
          }
        } catch (error) {
          console.error("Error parsing stream data:", error);
          // If parsing fails, treat it as an error event
          callbacks.error?.(error instanceof Error ? error : new Error("Failed to parse stream data"));
        }

        continue;
      }

      console.error("Unknown line in stream:", line);
    }
  }
}

// Helper function to extract incremental text from AIMessageChunk content array
// This extracts only the new text from content items of type "text"
const extractIncrementalTextFromChunk = (msg: AIMessageChunk): string | null => {
  if (!msg.kwargs?.content) {
    return null;
  }

  const content = msg.kwargs.content;

  // If content is a string, return it
  if (typeof content === "string") {
    return content;
  }

  // If content is an array, extract text from text-type items
  if (Array.isArray(content)) {
    let text = "";
    for (const item of content as unknown[]) {
      if (item && typeof item === "object") {
        // Handle text content items: {"index": 0, "type": "text", "text": "I can"}
        if ("type" in item && item.type === "text" && "text" in item) {
          text += String((item as { text: string }).text);
        }
        // Handle input_json_delta items (tool call arguments) - skip these for text display
        // These are: {"index": 1, "type": "input_json_delta", "input": "..."}
      }
    }
    return text || null;
  }

  return null;
};

// Helper function to extract tool calls from AIMessageChunk
const extractToolCallsFromMessage = (msg: AIMessageChunk): ToolCall[] => {
  if (msg.kwargs?.tool_calls && Array.isArray(msg.kwargs.tool_calls)) {
    return msg.kwargs.tool_calls.filter((tc): tc is ToolCall =>
      tc && typeof tc === "object" && "name" in tc && "args" in tc && "id" in tc
    );
  }
  return [];
};
