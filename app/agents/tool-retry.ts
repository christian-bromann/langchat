import { z } from "zod";
import { createAgent, HumanMessage, tool, toolRetryMiddleware } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";

import { checkpointer } from "@/app/utils";

/**
 * Simulated weather data for different cities
 */
const WEATHER_DATA: Record<string, { temp: number; condition: string; humidity: number }> = {
  "new york": { temp: 72, condition: "Partly Cloudy", humidity: 65 },
  "san francisco": { temp: 68, condition: "Foggy", humidity: 80 },
  "los angeles": { temp: 75, condition: "Sunny", humidity: 50 },
  "chicago": { temp: 65, condition: "Cloudy", humidity: 70 },
  "miami": { temp: 85, condition: "Sunny", humidity: 75 },
  "seattle": { temp: 60, condition: "Rainy", humidity: 85 },
};

/**
 * Track call counts per thread+city combination to simulate network failures independently
 * This allows each city query to fail independently, demonstrating retry behavior
 */
const callCounts = new Map<string, number>();

/**
 * Simulate network failures - this will fail initially to demonstrate retry behavior
 * Each thread+city combination gets its own counter to simulate independent failures
 */
async function simulateNetworkFailure(threadId: string | undefined, city: string): Promise<boolean> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 200));

  const key = `${threadId || "default"}:${city.toLowerCase()}`;
  const currentCount = (callCounts.get(key) || 0) + 1;
  callCounts.set(key, currentCount);

  // Fail on first 2 calls, succeed on 3rd (demonstrates retry success)
  // This simulates transient network issues that resolve after retries
  return currentCount <= 2;
}

/**
 * Custom error class for network failures
 */
class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

/**
 * Tool Retry Middleware Agent - demonstrates automatic retry with exponential backoff
 *
 * Scenario: Weather API that experiences intermittent network failures.
 * The tool retry middleware automatically retries failed calls with exponential backoff,
 * allowing the agent to recover from transient failures without manual intervention.
 *
 * This demonstrates:
 * - Automatic retry on tool failures
 * - Exponential backoff with jitter
 * - Configurable retry behavior (max retries, retry conditions)
 * - Graceful error handling when retries are exhausted
 * - Real-world resilience patterns for unreliable external APIs
 */
export async function toolRetryAgent(options: {
  message: string;
  apiKey: string;
  threadId?: string;
}) {
  // Create the Anthropic model instance with user-provided API key
  const model = new ChatAnthropic({
    model: "claude-sonnet-4-5-20250929",
    apiKey: options.apiKey,
  });

  // Weather API tool that simulates intermittent failures
  const getWeather = tool(
    async (input: { city: string }) => {
      // Simulate network failure (will succeed after retries)
      // Pass threadId and city to maintain separate failure counters per city query
      if (await simulateNetworkFailure(options.threadId, input.city)) {
        throw new NetworkError(
          `Network request failed: Unable to connect to weather service for ${input.city}. This may be a temporary issue.`
        );
      }

      const cityKey = input.city.toLowerCase();
      const weather = WEATHER_DATA[cityKey];

      if (!weather) {
        throw new Error(`Weather data not available for ${input.city}`);
      }

      return {
        city: input.city,
        temperature: `${weather.temp}°F`,
        condition: weather.condition,
        humidity: `${weather.humidity}%`,
        timestamp: new Date().toISOString(),
      };
    },
    {
      name: "get_weather",
      description: "Get current weather information for a city. This tool may experience temporary network failures that will be automatically retried.",
      schema: z.object({
        city: z.string().describe("The name of the city to get weather for (e.g., 'New York', 'San Francisco', 'Los Angeles')"),
      }),
    }
  );

  // Create agent with retry middleware
  // Configured to retry up to 3 times (4 total attempts) with exponential backoff
  const agent = createAgent({
    model,
    tools: [getWeather],
    middleware: [
      toolRetryMiddleware({
        maxRetries: 3, // 3 retries = 4 total attempts
        retryOn: (error: Error) => {
          // Only retry on NetworkError (simulating transient network issues)
          return error instanceof NetworkError;
        },
        backoffFactor: 2.0, // Exponential backoff: 1s, 2s, 4s
        initialDelayMs: 1000, // Start with 1 second delay
        maxDelayMs: 8000, // Cap at 8 seconds
        jitter: true, // Add random jitter to avoid thundering herd
        onFailure: "return_message", // Return error message to LLM instead of raising
      }),
    ],
    checkpointer,
  });

  // Initialize the conversation
  const initialState = {
    messages: [new HumanMessage(options.message)],
  };

  const stream = await agent.stream(initialState, {
    encoding: "text/event-stream",
    streamMode: ["values", "updates", "messages"],
    recursionLimit: 50,
    configurable: { thread_id: options.threadId },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

