import type { EVENT_TYPES } from "./constants";
export type EventType = (typeof EVENT_TYPES)[number];

// Base LangChain message structure
export interface LangChainMessage {
  lc: number;
  type: string;
  id: string[];
  kwargs: Record<string, unknown>;
}

// HumanMessage structure
export interface HumanMessage extends LangChainMessage {
  id: ["langchain_core", "messages", "HumanMessage"];
  kwargs: {
    content: string;
    additional_kwargs: Record<string, unknown>;
    response_metadata: Record<string, unknown>;
    id: string;
  };
}

// Token details for usage metadata
export interface TokenDetails {
  cache_creation?: number;
  cache_read?: number;
}

export interface OutputTokenDetails {
  [key: string]: unknown;
}

// Usage metadata structure
export interface UsageMetadata {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_token_details?: TokenDetails;
  output_token_details?: OutputTokenDetails;
}

// Cache creation details
export interface CacheCreation {
  ephemeral_5m_input_tokens: number;
  ephemeral_1h_input_tokens: number;
}

// Response metadata structure
export interface ResponseMetadata {
  usage?: {
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    cache_creation: CacheCreation;
    service_tier?: string;
  };
  [key: string]: unknown;
}

// Additional kwargs for AI messages
export interface AIAdditionalKwargs {
  model?: string;
  id?: string;
  type?: string;
  role?: string;
  stop_reason?: string;
  stop_sequence?: string | null;
  [key: string]: unknown;
}

// Tool call structure
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  id: string;
  type: "tool_call";
}

// ToolMessage structure (from LangChain stream)
export interface ToolMessageData extends LangChainMessage {
  id: ["langchain_core", "messages", "ToolMessage"];
  kwargs: {
    status: "success" | "error";
    content: string;
    tool_call_id: string;
    name: string;
    metadata: Record<string, unknown>;
    additional_kwargs: Record<string, unknown>;
    response_metadata: Record<string, unknown>;
    id: string;
  };
}

// AIMessageChunk structure
export interface AIMessageChunk extends LangChainMessage {
  id: ["langchain_core", "messages", "AIMessageChunk"];
  kwargs: {
    content: string;
    additional_kwargs: AIAdditionalKwargs;
    tool_call_chunks: unknown[];
    response_metadata: ResponseMetadata;
    id: string;
    usage_metadata?: UsageMetadata;
    tool_calls: ToolCall[];
    invalid_tool_calls: unknown[];
    name?: string;
  };
}

// LangGraph metadata structure
export interface LangGraphMetadata {
  tags: string[];
  langgraph_step: number;
  langgraph_node: string;
  langgraph_triggers: string[];
  langgraph_path: string[];
  langgraph_checkpoint_ns: string;
  __pregel_task_id: string;
  checkpoint_ns: string;
  ls_provider: string;
  ls_model_name: string;
  ls_model_type: string;
  ls_temperature: number;
  ls_max_tokens: number;
}

// Update data structure for chunk updates (array format)
export type ChunkUpdateData = [AIMessageChunk, LangGraphMetadata];

// Messages update data structure
export interface MessagesUpdateData {
  messages: (HumanMessage | AIMessageChunk | ToolMessageData)[];
}

// Private state structure
export interface PrivateState {
  threadLevelCallCount: number;
  runModelCallCount: number;
}

// Model request update data structure
export interface ModelRequestUpdateData {
  model_request: {
    messages: AIMessageChunk[];
    _privateState: PrivateState;
  };
}

// Tools update data structure
export interface ToolsUpdateData {
  tools: {
    messages: ToolMessageData[];
  };
}

// Full update data structure (with private state)
export interface FullUpdateData {
  messages: (HumanMessage | AIMessageChunk | ToolMessageData)[];
  _privateState: PrivateState;
}

// Union type for all possible update data structures
export type UpdateData =
  | MessagesUpdateData
  | ChunkUpdateData
  | ModelRequestUpdateData
  | FullUpdateData
  | ToolsUpdateData;

// End event data structure
export interface EndEventData {
  [key: string]: unknown;
}

// Interrupt event data structure
export interface InterruptEventData {
  [key: string]: unknown;
}

// Agent event data structure
export interface AgentEventData {
  [key: string]: unknown;
}

// Agent state event data structure (full state with messages array)
export type AgentStateEventData = FullUpdateData;

// Model request event data structure
export type ModelRequestEventData = ModelRequestUpdateData;

// Tools event data structure
export type ToolsEventData = ToolsUpdateData;

// Union type for all event data structures
export type EventData = UpdateData | EndEventData | AgentStateEventData | ModelRequestEventData | ToolsEventData;
