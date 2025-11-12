"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

import type { HITLRequest } from "langchain";
import { HumanMessage, BaseMessage, AIMessage } from "@langchain/core/messages";

import { WelcomeScreen } from "./Welcome";
import { EVENT_TYPES } from "@/app/constants";
import type { EventType, UpdateData, AgentEventData, ToolCall, AgentStateEventData, ModelRequestEventData, ToolsEventData, ToolMessageData } from "@/app/types";
import { ToolCallBubble, type ToolCallState } from "./ToolCall";
import { InterruptBubble } from "./InterruptBubble";
import { SummarizationBubble, type SummarizationEvent, parseSummarizationEvent } from "./SummarizationBubble";
import { ErrorBubble } from "./ErrorBubble";
import { useStatistics, countTokensApproximately } from "@/app/contexts/StatisticsContext";

interface ChatInterfaceProps {
  selectedScenario?: string;
  apiKey: string;
}

function isAIMessageChunk(chunk: unknown): boolean {
  if (!chunk || typeof chunk !== "object") return false;

  const chunkAny = chunk as Record<string, unknown>;

  // Check for LangGraph native format (type: "ai")
  if (chunkAny.type === "ai") return true;

  // Check for old format (lc and id array)
  return Boolean(
    "lc" in chunkAny &&
    "kwargs" in chunkAny &&
    "id" in chunkAny &&
    Array.isArray(chunkAny.id) &&
    chunkAny.id[2] === "AIMessageChunk"
  );
}

function isToolMessage(chunk: unknown): boolean {
  if (!chunk || typeof chunk !== "object") return false;

  const chunkAny = chunk as Record<string, unknown>;

  // Check for LangGraph native format (type: "tool")
  if (chunkAny.type === "tool") return true;

  // Check for old format (lc and id array)
  return Boolean(
    "lc" in chunkAny &&
    "kwargs" in chunkAny &&
    "id" in chunkAny &&
    Array.isArray(chunkAny.id) &&
    chunkAny.id[2] === "ToolMessage"
  );
}

// API endpoint mapping - extracted to avoid repeated if-else chain
const API_ENDPOINTS: Record<string, string> = {
  "human-in-the-loop": "/api/hitl",
  "summarization": "/api/summarization",
  "model-call-limits": "/api/model-call-limits",
  "tool-call-limits": "/api/tool-call-limits",
  "todo-list": "/api/todo-list",
  "context-editing": "/api/context-editing",
  "mcp": "/api/mcp",
} as const;

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
  const summarizationContentRef = useRef<string>(""); // Track accumulating summarization content
  const currentSummarizationIdRef = useRef<string | null>(null); // Track current summarization ID
  const { recordToolCall, recordModelCall, recordTokens, recordContextWindowSize, resetStatistics } = useStatistics();

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
    summarizationContentRef.current = "";
    currentSummarizationIdRef.current = null;
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
    // Handle both LangGraph native format (tool_calls directly on message) and our transformed format (kwargs.tool_calls)
    const messages = modelRequest.model_request.messages;
    let tc: ToolCall[] = [];

    for (const msg of messages) {
      // Check for LangGraph native format (tool_calls directly on message)
      const msgAny = msg as unknown as Record<string, unknown>;
      if ('tool_calls' in msgAny && Array.isArray(msgAny.tool_calls) && msgAny.tool_calls.length > 0) {
        tc = msgAny.tool_calls as ToolCall[];
        break;
      }
      // Check for our transformed format (kwargs.tool_calls)
      if (msg.kwargs?.tool_calls && Array.isArray(msg.kwargs.tool_calls) && msg.kwargs.tool_calls.length > 0) {
        tc = msg.kwargs.tool_calls as ToolCall[];
        break;
      }
    }

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

  const handleSend = useCallback(async (messageOverride?: string, interruptResponse?: { decisions: Array<{ type: "approve" | "reject" | "edit"; editedAction?: { name: string; args: Record<string, unknown> }; message?: string }> } ) => {
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
      const apiEndpoint = selectedScenario ? (API_ENDPOINTS[selectedScenario] || "/api/basic") : "/api/basic";

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
      const updateToolCallWithMessage = (toolMsg: ToolMessageData | Record<string, unknown>) => {
        // Handle both LangGraph native format (tool_call_id directly) and old format (kwargs.tool_call_id)
        const toolMsgAny = toolMsg as Record<string, unknown>;
        const toolCallId = (toolMsgAny.tool_call_id as string | undefined) ||
          ((toolMsgAny.kwargs as Record<string, unknown>)?.tool_call_id as string | undefined);

        if (!toolCallId) {
          return;
        }

        setToolCalls((prev) => {
          const newMap = new Map(prev);
          const existing = newMap.get(toolCallId);

          // Extract name from both formats
          const name = (toolMsgAny.name as string | undefined) ||
            ((toolMsgAny.kwargs as Record<string, unknown>)?.name as string | undefined) ||
            "unknown";

          if (existing) {
            newMap.set(toolCallId, {
              ...existing,
              toolMessage: toolMsg
            });
          } else {
            // If we haven't seen the tool call yet, create a placeholder
            newMap.set(toolCallId, {
              toolCall: {
                id: toolCallId,
                name,
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
         * Parse the summarization event from the update data (for updates event)
         * Only parse if we're not already streaming a summarization (to avoid duplicates)
         */
        if (!currentSummarizationIdRef.current) {
          parseSummarizationEvent(data, messageCountRef.current, (summary) => {
            setSummarizations((prev) => [
              ...prev,
              summary,
            ]);
          });
        }

        // Check if this is an array update (either [AIMessageChunk, LangGraphMetadata] or [ToolMessage, LangGraphMetadata])
        if (!Array.isArray(data) || data.length !== 2) {
          return;
        }

        // Check metadata for summarization middleware
        const metadata = data[1] as unknown as Record<string, unknown>;
        const isSummarizationMessage =
          metadata &&
          typeof metadata === "object" &&
          (("langgraph_node" in metadata && metadata.langgraph_node === "SummarizationMiddleware.before_model") ||
           ("langgraph_triggers" in metadata &&
            Array.isArray(metadata.langgraph_triggers) &&
            metadata.langgraph_triggers.includes("branch:to:SummarizationMiddleware.before_model")));

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

        const msg = data[0] as unknown as Record<string, unknown>;
        // Handle both LangGraph native format (id as string) and old format (kwargs.id)
        const msgId = typeof msg.id === "string" ? msg.id : (msg.kwargs as Record<string, unknown>)?.id as string | undefined;
        const messageId = msgId || currentAssistantId;

        // If this is a summarization message, stream it to the summarization bubble instead
        if (isSummarizationMessage) {
          // Extract text content from the chunk
          const chunkText = extractIncrementalTextFromChunk(msg);

          if (chunkText !== null && chunkText !== "") {
            // Initialize summarization if this is the first chunk
            if (!currentSummarizationIdRef.current) {
              const summarizationId = `summarization-${Date.now()}`;
              currentSummarizationIdRef.current = summarizationId;
              summarizationContentRef.current = "";

              // Create initial summarization event
              setSummarizations((prev) => [
                ...prev,
                {
                  id: summarizationId,
                  timestamp: Date.now(),
                  summary: "",
                  afterMessageIndex: Math.max(0, messageCountRef.current - 1),
                  isStreaming: true,
                },
              ]);
            }

            // Accumulate content
            const currentAccumulated = summarizationContentRef.current;
            let updatedContent: string;

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
              // Remove the prefix if present
              let displayContent = updatedContent;
              if (displayContent.startsWith("Here is a summary of the conversation to date:")) {
                displayContent = displayContent.replace(/^Here is a summary of the conversation to date:\s*/i, "").trim();
              }

              summarizationContentRef.current = updatedContent;

              // Update the summarization bubble with streaming content
              setSummarizations((prev) =>
                prev.map((s) =>
                  s.id === currentSummarizationIdRef.current
                    ? { ...s, summary: displayContent, isStreaming: true }
                    : s
                )
              );
            }
          }

          // Don't process summarization messages as regular AI messages
          return;
        }

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
        // Handle both LangGraph native format (tool_calls directly) and old format (kwargs.tool_calls)
        const msgAny = msg as Record<string, unknown>;
        const toolCallsFromMsg = (msgAny.tool_calls as ToolCall[] | undefined) ||
          ((msgAny.kwargs as Record<string, unknown>)?.tool_calls as ToolCall[] | undefined) ||
          [];
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
        agent_state: (data: AgentStateEventData) => {
          // Track context window size from agent_state events (which come from values events)
          const messages = data.messages || [];
          if (messages.length > 0) {
            const contextWindowTokens = countTokensApproximately(messages as unknown as Array<Record<string, unknown>>);
            recordContextWindowSize(contextWindowTokens);
          }
        },
        model_request: (data: ModelRequestEventData) => {
          updateToolCallArgs(data);
          recordModelCall();

          // Track token usage and tool calls from model_request events (these contain final, accurate counts)
          const messages = data.model_request?.messages || [];

          // Count tokens in the messages array to track context window size
          if (messages.length > 0) {
            const contextWindowTokens = countTokensApproximately(messages as unknown as Array<Record<string, unknown>>);
            recordContextWindowSize(contextWindowTokens);
          }

          for (const message of messages) {
            // Track tokens - handle both LangGraph native format (usage_metadata directly) and transformed format (kwargs.usage_metadata)
            const msgAny = message as unknown as Record<string, unknown>;
            const usage = (msgAny.usage_metadata as typeof message.kwargs.usage_metadata) || message.kwargs?.usage_metadata;
            if (usage) {
              const input = usage.input_tokens || 0;
              const output = usage.output_tokens || 0;
              const total = usage.total_tokens || input + output;

              // Only track if we have valid token counts (input_tokens > 0 indicates final count)
              if (input > 0 && total > 0) {
                const messageId = (msgAny.id as string | undefined) || message.kwargs?.id as string | undefined;
                if (messageId && !processedTokenMessagesRef.current.has(messageId)) {
                  recordTokens(input, output, total);
                  processedTokenMessagesRef.current.add(messageId);
                }
              }
            }

            // Track tool calls (only once per unique tool call ID across the conversation)
            // Handle both LangGraph native format (tool_calls directly) and transformed format (kwargs.tool_calls)
            const toolCalls = (msgAny.tool_calls as ToolCall[] | undefined) || message.kwargs?.tool_calls;
            if (toolCalls && Array.isArray(toolCalls)) {
              for (const toolCall of toolCalls) {
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

          // Mark summarization as complete (no longer streaming)
          if (currentSummarizationIdRef.current) {
            setSummarizations((prev) =>
              prev.map((s) =>
                s.id === currentSummarizationIdRef.current
                  ? { ...s, isStreaming: false }
                  : s
              )
            );
            currentSummarizationIdRef.current = null;
            summarizationContentRef.current = "";
          }
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
            // Only create new Map if we have pending tool calls to mark as errored
            let needsUpdate = false;
            for (const toolCall of prev.values()) {
              if (toolCall.aiMessageId === currentAssistantId && !toolCall.toolMessage && !toolCall.errored) {
                needsUpdate = true;
                break;
              }
            }
            if (!needsUpdate) return prev;

            const newMap = new Map(prev);
            for (const [id, toolCall] of prev) {
              if (toolCall.aiMessageId === currentAssistantId && !toolCall.toolMessage) {
                newMap.set(id, { ...toolCall, errored: true });
              }
            }
            return newMap;
          });
        },
      });
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
          // Only create new Map if we have pending tool calls to mark as errored
          let needsUpdate = false;
          for (const toolCall of prev.values()) {
            if (toolCall.aiMessageId === currentAssistantId && !toolCall.toolMessage && !toolCall.errored) {
              needsUpdate = true;
              break;
            }
          }
          if (!needsUpdate) return prev;

          const newMap = new Map(prev);
          for (const [id, toolCall] of prev) {
            if (toolCall.aiMessageId === currentAssistantId && !toolCall.toolMessage) {
              newMap.set(id, { ...toolCall, errored: true });
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
  }, [
    inputValue,
    selectedScenario,
    isLoading,
    apiKey,
    currentThreadId,
    recordToolCall,
    recordModelCall,
    recordTokens,
    updateToolCallArgs,
    recordContextWindowSize
  ]);

  const handleInterruptApprove = useCallback(async () => {
    if (!interruptData) return;

    const interruptResponse = {
      decisions: [{
        type: "approve" as const,
      }],
    };

    setInterruptData(null);
    await handleSend("", interruptResponse);
  }, [interruptData, handleSend]);

  const handleInterruptReject = useCallback(async (message?: string) => {
    if (!interruptData) return;

    const interruptResponse = {
      decisions: [{
        type: "reject" as const,
        ...(message ? { message } : {}),
      }],
    };

    setInterruptData(null);
    await handleSend("", interruptResponse);
  }, [interruptData, handleSend]);

  const handleInterruptEdit = useCallback(async (editedArgs: Record<string, unknown>) => {
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
  }, [interruptData, handleSend]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Memoize tool calls by message ID for efficient lookups
  const toolCallsByMessageId = useMemo(() => {
    const map = new Map<string, ToolCallState[]>();
    for (const toolCall of toolCalls.values()) {
      if (toolCall.aiMessageId) {
        const existing = map.get(toolCall.aiMessageId) || [];
        existing.push(toolCall);
        map.set(toolCall.aiMessageId, existing);
      }
    }
    // Sort each array by timestamp
    for (const [messageId, calls] of map.entries()) {
      map.set(messageId, calls.sort((a, b) => a.timestamp - b.timestamp));
    }
    return map;
  }, [toolCalls]);

  // Memoize the combined messages and summarizations array
  const renderedItems = useMemo(() => {
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

    return items;
  }, [messages, summarizations]);

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
            {renderedItems.map((item) => {
              if (item.type === 'summarization') {
                return <SummarizationBubble key={item.data.id} summary={item.data as SummarizationEvent} />;
              }

              const message = item.data as BaseMessage;
              const messageIndex = Math.floor(item.index);

              // Get tool calls associated with this AI message - use memoized map
              const associatedToolCalls = AIMessage.isInstance(message) && message.id
                ? (toolCallsByMessageId.get(message.id) || [])
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
                    <ErrorBubble error={errorMessage} />
                  )}
                </div>
              );
            })}
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
  let currentEventType: string | null = null;
  let currentData: unknown = null;

  // Helper function to transform LangGraph's native event format into our expected format
  const transformLangGraphEvent = (langGraphEventType: string, payload: unknown): { eventType: EventType; eventData: unknown } => {
    let eventType: EventType = "update";
    let eventData: unknown = payload;

    // Check for interrupts (human-in-the-loop pauses)
    if (langGraphEventType === "interrupt") {
      eventType = "interrupt";
      if (Array.isArray(payload) && payload.length > 0) {
        const interruptValue = payload[0];
        if (interruptValue && typeof interruptValue === "object" && "value" in interruptValue) {
          const value = interruptValue.value as { actionRequests?: Array<{ name: string; args: Record<string, unknown>; description?: string }>; reviewConfigs?: unknown[] };
          if (value?.actionRequests) {
            eventData = {
              actionRequests: value.actionRequests.map((ar) => ({
                name: ar.name,
                args: ar.args,
                description: ar.description,
              })),
              reviewConfigs: value.reviewConfigs || [],
            };
          } else {
            eventData = interruptValue;
          }
        } else {
          eventData = interruptValue;
        }
      } else {
        eventData = payload;
      }
    } else if (langGraphEventType === "values" && typeof payload === "object" && payload !== null) {
      const values = payload as { __interrupt__?: unknown; [key: string]: unknown };

      // Check for interrupt marker in values
      if (values.__interrupt__) {
        eventType = "interrupt";
        const interruptArray = values.__interrupt__ as Array<{ value?: { actionRequests?: Array<{ name: string; args: Record<string, unknown>; description?: string }>; reviewConfigs?: unknown[] } }>;

        // Extract action requests from interrupt
        if (interruptArray && interruptArray.length > 0 && interruptArray[0]?.value?.actionRequests) {
          eventData = {
            actionRequests: interruptArray[0].value.actionRequests.map((ar) => ({
              name: ar.name,
              args: ar.args,
              description: ar.description,
            })),
            reviewConfigs: interruptArray[0].value.reviewConfigs || [],
          };
        } else {
          eventData = values.__interrupt__;
        }
      } else {
        // Check data structure to determine event type
        eventType = determineEventTypeFromPayload(payload);
        eventData = payload;
      }
    } else if (langGraphEventType === "updates" && typeof payload === "object" && payload !== null) {
      const updates = payload as { __interrupt__?: unknown; [key: string]: unknown };

      // Check for interrupt marker in updates
      if (updates.__interrupt__) {
        eventType = "interrupt";
        const interruptArray = updates.__interrupt__ as Array<{
          id?: string;
          value?: { actionRequests?: Array<{ name: string; args: Record<string, unknown>; description?: string }>; reviewConfigs?: unknown[] };
        }>;

        // Extract action requests from interrupt
        if (interruptArray && interruptArray.length > 0 && interruptArray[0]?.value?.actionRequests) {
          eventData = {
            actionRequests: interruptArray[0].value.actionRequests.map((ar) => ({
              name: ar.name,
              args: ar.args,
              description: ar.description,
            })),
            reviewConfigs: interruptArray[0].value.reviewConfigs || [],
          };
        } else {
          eventData = updates.__interrupt__;
        }
      } else {
        // Check data structure to determine event type
        eventType = determineEventTypeFromPayload(payload);
        eventData = payload;
      }
    } else if (langGraphEventType === "messages" && Array.isArray(payload)) {
      // Check if it's a chunk update (array of [AIMessageChunk, LangGraphMetadata])
      // LangGraph native format: [message, metadata] where message has type: "ai" or type: "tool"
      if (payload.length === 2 && payload[0] && typeof payload[0] === "object" && payload[1] && typeof payload[1] === "object") {
        const firstItem = payload[0] as Record<string, unknown>;
        const secondItem = payload[1] as Record<string, unknown>;

        // Check if second item is metadata (has langgraph_node)
        if ("langgraph_node" in secondItem) {
          // Check if first item is LangGraph native format message (has type property)
          if ("type" in firstItem && (firstItem.type === "ai" || firstItem.type === "tool")) {
            // Convert to update format for processUpdate to handle
            eventType = "update";
            eventData = payload; // Keep as [message, metadata] for processUpdate
          } else if ("lc" in firstItem && firstItem.lc === 1) {
            // Old format with lc property
            eventType = "model_request";
            eventData = { model_request: { messages: [payload[0]], _privateState: {} as Record<string, unknown> } };
          }
        } else {
          // Not a [message, metadata] pair, try to find AI messages
          const aiMessages = payload.filter((msg) => {
            if (!msg || typeof msg !== "object") return false;
            const msgAny = msg as Record<string, unknown>;
            // Check for LangGraph native format (type: "ai")
            if (msgAny.type === "ai") return true;
            // Check for old format (lc and id array)
            return (
              "lc" in msgAny &&
              msgAny.lc === 1 &&
              "id" in msgAny &&
              Array.isArray(msgAny.id) &&
              msgAny.id[0] === "langchain_core" &&
              msgAny.id[1] === "messages" &&
              (msgAny.id[2] === "AIMessageChunk" || msgAny.id[2] === "AIMessage")
            );
          });

          if (aiMessages.length > 0) {
            eventType = "agent";
            eventData = { messages: aiMessages };
          }
        }
      } else if (payload.length > 0 && payload[0] && typeof payload[0] === "object") {
        // Single message or array of messages - check for LangGraph native format
        const firstMsg = payload[0] as Record<string, unknown>;
        if (firstMsg.type === "ai" || firstMsg.type === "tool") {
          // Convert to update format - wrap single message with metadata if available
          const metadata = payload.length > 1 && typeof payload[1] === "object" && "langgraph_node" in payload[1]
            ? payload[1]
            : { langgraph_node: "unknown" };
          eventType = "update";
          eventData = [payload[0], metadata];
        }
      }
    } else {
      // For other update types, check data structure
      if (typeof payload === "object" && payload !== null) {
        eventType = determineEventTypeFromPayload(payload);
        eventData = payload;
      }
    }

    return { eventType, eventData };
  };

  // Helper function to determine event type from payload structure
  const determineEventTypeFromPayload = (payload: unknown): EventType => {
    if (typeof payload !== "object" || payload === null) {
      return "update";
    }

    const data = payload as Record<string, unknown>;
    const keys = Object.keys(data);

    // Check for agent_state: has "messages" key (and optionally "_privateState")
    if (keys.includes("messages") && Array.isArray(data.messages)) {
      return "agent_state";
    }

    // Check for model_request: single "model_request" key
    if (keys.length === 1 && keys[0] === "model_request" && data.model_request) {
      return "model_request";
    }

    // Check for tools: single "tools" key
    if (keys.length === 1 && keys[0] === "tools" && data.tools) {
      return "tools";
    }

    // Check for chunk update: array of [AIMessageChunk, LangGraphMetadata]
    if (Array.isArray(payload) && payload.length === 2) {
      const first = payload[0] as unknown;
      const second = payload[1] as unknown;
      if (
        typeof first === "object" &&
        first !== null &&
        "lc" in first &&
        typeof second === "object" &&
        second !== null &&
        "langgraph_node" in second
      ) {
        return "model_request";
      }
    }

    return "update";
  };

  // Helper function to handle different event types and call appropriate callbacks
  const handleEvent = (eventType: EventType, eventData: unknown) => {
    if (eventType === "end") {
      callbacks.end?.();
    } else if (eventType === "error") {
      // Extract error message - prefer 'message' field over 'error' field
      let errorMessage: string;
      if (typeof eventData === "string") {
        errorMessage = eventData;
      } else if (eventData && typeof eventData === "object") {
        const errorData = eventData as { message?: string; error?: string };
        errorMessage = errorData.message || errorData.error || "Unknown error occurred";
      } else {
        errorMessage = "Unknown error occurred";
      }
      callbacks.error?.(new Error(errorMessage));
    } else if (eventType === "agent_state") {
      callbacks.agent_state?.(eventData as AgentStateEventData);
    } else if (eventType === "model_request") {
      callbacks.model_request?.(eventData as ModelRequestEventData);
    } else if (eventType === "tools") {
      callbacks.tools?.(eventData as ToolsEventData);
    } else if (eventType === "interrupt") {
      callbacks.interrupt?.(eventData as HITLRequest);
    } else if (eventType === "update") {
      callbacks.update?.(eventData as UpdateData);
    } else if (eventType === "agent") {
      callbacks.agent?.(eventData as AgentEventData);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      // Process any remaining event in buffer before ending
      if (currentEventType !== null && currentData !== null) {
        const isLangGraphEvent = !EVENT_TYPES.includes(currentEventType as EventType);

        if (isLangGraphEvent) {
          const { eventType, eventData } = transformLangGraphEvent(currentEventType, currentData);
          currentEventType = eventType;
          currentData = eventData;
        }

        const eventType = currentEventType as EventType;
        handleEvent(eventType, currentData);
      }

      // Always call end callback when stream completes
      callbacks.end?.();
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) {
        // Empty line signals end of event, process it
        if (currentEventType !== null && currentData !== null) {
          // Check if this is a LangGraph native event type or our custom format
          const isLangGraphEvent = !EVENT_TYPES.includes(currentEventType as EventType);

          if (isLangGraphEvent) {
            // Transform LangGraph event format
            const { eventType, eventData } = transformLangGraphEvent(currentEventType, currentData);
            currentEventType = eventType;
            currentData = eventData;
          }

          // Handle the transformed event
          const eventType = currentEventType as EventType;
          handleEvent(eventType, currentData);

          // Reset for next event
          currentEventType = null;
          currentData = null;
        }
        continue;
      }

      if (line.startsWith("event: ")) {
        currentEventType = line.slice(7).trim();
        continue;
      }

      if (line.startsWith("data: ")) {
        const dataStr = line.slice(6);
        try {
          currentData = JSON.parse(dataStr);
        } catch (error) {
          console.error("Error parsing stream data:", error);
          callbacks.error?.(error instanceof Error ? error : new Error("Failed to parse stream data"));
        }
        continue;
      }
    }
  }

  // Process any remaining event in buffer
  if (currentEventType !== null && currentData !== null) {
    const isLangGraphEvent = !EVENT_TYPES.includes(currentEventType as EventType);

    if (isLangGraphEvent) {
      const { eventType, eventData } = transformLangGraphEvent(currentEventType, currentData);
      currentEventType = eventType;
      currentData = eventData;
    }

    const eventType = currentEventType as EventType;
    handleEvent(eventType, currentData);
  }
}

// Helper function to extract incremental text from AIMessageChunk content array
// This extracts only the new text from content items of type "text"
// Handles both LangGraph native format (content directly on message) and old format (kwargs.content)
const extractIncrementalTextFromChunk = (msg: unknown): string | null => {
  const msgAny = msg as Record<string, unknown>;

  // Handle LangGraph native format (content directly on message)
  let content = msgAny.content;

  // Fall back to old format (kwargs.content)
  if (!content && msgAny.kwargs && typeof msgAny.kwargs === "object") {
    content = (msgAny.kwargs as Record<string, unknown>).content;
  }

  if (!content) {
    return null;
  }

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
