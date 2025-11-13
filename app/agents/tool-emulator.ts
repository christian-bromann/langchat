import { z } from "zod";
import { createAgent, HumanMessage, tool, toolEmulatorMiddleware } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";

import { checkpointer } from "@/app/utils";

/**
 * Simulated user preferences database
 */
const USER_PREFERENCES: Record<string, { destination: string; budget: string; travelStyle: string }> = {
  "user_123": {
    destination: "Tokyo, Japan",
    budget: "moderate",
    travelStyle: "cultural exploration",
  },
  "user_456": {
    destination: "Paris, France",
    budget: "luxury",
    travelStyle: "romantic getaway",
  },
  "user_789": {
    destination: "Bali, Indonesia",
    budget: "budget",
    travelStyle: "beach relaxation",
  },
};

/**
 * Tool Emulator Middleware Agent - demonstrates tool emulation for testing
 *
 * Scenario: Travel planning assistant that uses tool emulator middleware to simulate
 * expensive or unavailable API calls. The middleware allows you to test agent behavior
 * without actually calling external services like flight APIs or hotel booking systems.
 *
 * In this example:
 * - get_user_preferences: Executes normally (real tool)
 * - search_flights: Emulated by LLM (simulates flight search API)
 * - book_hotel: Emulated by LLM (simulates hotel booking API)
 *
 * This demonstrates:
 * - Selective tool emulation (emulate some tools, execute others)
 * - Testing agent logic without external API dependencies
 * - Cost savings during development/testing
 * - Realistic responses from emulated tools
 * - Ability to test error scenarios and edge cases
 */
export async function toolEmulatorAgent(options: {
  message: string;
  apiKey: string;
  threadId?: string;
}) {
  // Create the Anthropic model instance with user-provided API key
  const model = new ChatAnthropic({
    model: "claude-sonnet-4-5-20250929",
    apiKey: options.apiKey,
  });

  // Real tool - executes normally
  const getUserPreferences = tool(
    async (input: { userId: string }) => {
      const preferences = USER_PREFERENCES[input.userId];
      if (!preferences) {
        throw new Error(`User preferences not found for user ID: ${input.userId}`);
      }
      return preferences;
    },
    {
      name: "get_user_preferences",
      description: "Get travel preferences for a user. Returns destination, budget, and travel style.",
      schema: z.object({
        userId: z.string().describe("The user ID to get preferences for (e.g., 'user_123', 'user_456', 'user_789')"),
      }),
    }
  );

  // These tools will be emulated by the middleware
  const searchFlights = tool(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_input: { origin: string; destination: string; date: string }) => {
      // This function body will never execute because the middleware intercepts it
      // In a real scenario, this would call an expensive flight API
      throw new Error("This tool is emulated and should not execute");
    },
    {
      name: "search_flights",
      description: "Search for available flights between two cities on a specific date. Returns flight options with prices, airlines, and times.",
      schema: z.object({
        origin: z.string().describe("The origin city (e.g., 'New York', 'San Francisco')"),
        destination: z.string().describe("The destination city (e.g., 'Tokyo', 'Paris')"),
        date: z.string().describe("The travel date in YYYY-MM-DD format"),
      }),
    }
  );

  const bookHotel = tool(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_input: { city: string; checkIn: string; checkOut: string; guests: number }) => {
      // This function body will never execute because the middleware intercepts it
      // In a real scenario, this would call a hotel booking API
      throw new Error("This tool is emulated and should not execute");
    },
    {
      name: "book_hotel",
      description: "Book a hotel in a city for specified check-in and check-out dates. Returns booking confirmation with hotel name, address, and confirmation number.",
      schema: z.object({
        city: z.string().describe("The city where the hotel should be located"),
        checkIn: z.string().describe("Check-in date in YYYY-MM-DD format"),
        checkOut: z.string().describe("Check-out date in YYYY-MM-DD format"),
        guests: z.number().describe("Number of guests"),
      }),
    }
  );

  // Create agent with tool emulator middleware
  // Only search_flights and book_hotel are emulated; get_user_preferences executes normally
  const agent = createAgent({
    model,
    tools: [getUserPreferences, searchFlights, bookHotel],
    middleware: [
      toolEmulatorMiddleware({
        tools: ["search_flights", "book_hotel"], // Only emulate these tools
        // Uses default model (claude-sonnet-4-5-20250929) for emulation
      }),
    ],
    checkpointer,
    systemPrompt: `You are a helpful travel planning assistant. When users ask for help planning trips, you MUST use the available tools:

1. First, get the user's preferences using get_user_preferences tool
2. Then, search for flights using search_flights tool with the origin, destination, and date
3. Finally, book a hotel using book_hotel tool with the city, check-in/check-out dates, and number of guests

Always use the tools - do not skip steps or provide information without using the tools. Be thorough and use all relevant tools to complete the user's request.`,
  });

  const stream = await agent.stream({
    messages: [new HumanMessage(options.message)],
  }, {
    encoding: "text/event-stream",
    streamMode: ["values", "updates", "messages"],
    recursionLimit: 50,
    configurable: { thread_id: options.threadId },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

