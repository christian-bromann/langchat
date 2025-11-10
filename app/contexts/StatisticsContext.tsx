"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { BaseMessage } from "@langchain/core/messages";
import { countTokens } from "@anthropic-ai/tokenizer";

/**
 * Token counter using Anthropic's tokenizer
 * Handles both BaseMessage format and model_request message format
 * @param messages Messages to count tokens for (can be BaseMessage[] or model_request message format)
 * @returns Token count
 */
export function countTokensApproximately(messages: BaseMessage[] | Array<Record<string, unknown>>): number {
  let totalTokens = 0;
  for (const msg of messages) {
    let textContent: string = "";

    // Handle BaseMessage format and LangGraph native format (has content property directly)
    if ("content" in msg) {
      const content = (msg as Record<string, unknown>).content;
      if (typeof content === "string") {
        textContent = content;
      } else if (Array.isArray(content)) {
        textContent = content
          .map((item) => {
            if (typeof item === "string") return item;
            if (item && typeof item === "object" && "type" in item && item.type === "text" && "text" in item) {
              return (item as { text: string }).text;
            }
            return "";
          })
          .join("");
      }
    }

    if (textContent) {
      totalTokens += countTokens(textContent);
    }
  }
  return totalTokens;
}

export interface Statistics {
  toolCalls: Map<string, number>; // tool name -> count
  modelCalls: number;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  contextWindowSize: number; // Maximum context window size seen
}

interface StatisticsContextType {
  statistics: Statistics;
  recordToolCall: (toolName: string) => void;
  recordModelCall: () => void;
  recordTokens: (input: number, output: number, total: number) => void;
  recordContextWindowSize: (size: number) => void;
  resetStatistics: () => void;
}

const StatisticsContext = createContext<StatisticsContextType | undefined>(undefined);

export function StatisticsProvider({ children }: { children: ReactNode }) {
  const [statistics, setStatistics] = useState<Statistics>({
    toolCalls: new Map(),
    modelCalls: 0,
    tokens: {
      input: 0,
      output: 0,
      total: 0,
    },
    contextWindowSize: 0,
  });

  const recordToolCall = useCallback((toolName: string) => {
    setStatistics((prev) => {
      const newToolCalls = new Map(prev.toolCalls);
      const currentCount = newToolCalls.get(toolName) || 0;
      newToolCalls.set(toolName, currentCount + 1);
      return {
        ...prev,
        toolCalls: newToolCalls,
      };
    });
  }, []);

  const recordModelCall = useCallback(() => {
    setStatistics((prev) => ({
      ...prev,
      modelCalls: prev.modelCalls + 1,
    }));
  }, []);

  const recordTokens = useCallback((input: number, output: number, total: number) => {
    setStatistics((prev) => ({
      ...prev,
      tokens: {
        input: prev.tokens.input + input,
        output: prev.tokens.output + output,
        total: prev.tokens.total + total,
      },
    }));
  }, []);

  const recordContextWindowSize = useCallback((size: number) => {
    setStatistics((prev) => ({
      ...prev,
      contextWindowSize: Math.max(prev.contextWindowSize, size),
    }));
  }, []);

  const resetStatistics = useCallback(() => {
    setStatistics({
      toolCalls: new Map(),
      modelCalls: 0,
      tokens: {
        input: 0,
        output: 0,
        total: 0,
      },
      contextWindowSize: 0,
    });
  }, []);

  return (
    <StatisticsContext.Provider
      value={{
        statistics,
        recordToolCall,
        recordModelCall,
        recordTokens,
        recordContextWindowSize,
        resetStatistics,
      }}
    >
      {children}
    </StatisticsContext.Provider>
  );
}

export function useStatistics() {
  const context = useContext(StatisticsContext);
  if (context === undefined) {
    throw new Error("useStatistics must be used within a StatisticsProvider");
  }
  return context;
}

