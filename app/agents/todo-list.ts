import { z } from "zod";
import { createAgent, HumanMessage, tool, todoListMiddleware } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";

import { checkpointer } from "@/app/utils";

/**
 * TodoList Middleware agent - demonstrates task planning and tracking for complex multi-step tasks
 *
 * Scenario: AI Travel Planner Agent
 * This agent helps users plan trips by breaking down complex travel planning into structured tasks.
 * It uses the TodoList middleware to create and track tasks like:
 * - Gathering travel dates and preferences
 * - Finding flight options
 * - Comparing hotels
 * - Suggesting itinerary
 * - Preparing packing checklist
 *
 * This demonstrates:
 * - Complex multi-step workflows that benefit from structured task planning
 * - Task tracking across multiple agent turns
 * - Long-running operations where progress visibility is important
 * - Breaking down complex problems into manageable steps
 */

// Sample flight database
const FLIGHTS = [
  { id: "FL001", from: "NYC", to: "LAX", date: "2024-03-15", price: 299, airline: "Delta", duration: "6h 30m" },
  { id: "FL002", from: "NYC", to: "LAX", date: "2024-03-15", price: 349, airline: "United", duration: "6h 15m" },
  { id: "FL003", from: "NYC", to: "LAX", date: "2024-03-15", price: 279, airline: "American", duration: "6h 45m" },
  { id: "FL004", from: "NYC", to: "SFO", date: "2024-03-15", price: 329, airline: "Delta", duration: "6h 0m" },
  { id: "FL005", from: "NYC", to: "SFO", date: "2024-03-15", price: 379, airline: "United", duration: "5h 45m" },
  { id: "FL006", from: "LAX", to: "NYC", date: "2024-03-22", price: 299, airline: "Delta", duration: "6h 30m" },
  { id: "FL007", from: "LAX", to: "NYC", date: "2024-03-22", price: 349, airline: "United", duration: "6h 15m" },
  { id: "FL008", from: "SFO", to: "NYC", date: "2024-03-22", price: 329, airline: "Delta", duration: "6h 0m" },
];

// Sample hotels database
const HOTELS = [
  { id: "HT001", city: "LAX", name: "Grand Hotel LA", price: 150, rating: 4.5, amenities: ["WiFi", "Pool", "Gym"] },
  { id: "HT002", city: "LAX", name: "Beachside Resort", price: 200, rating: 4.8, amenities: ["WiFi", "Pool", "Gym", "Spa"] },
  { id: "HT003", city: "LAX", name: "City Center Inn", price: 100, rating: 4.0, amenities: ["WiFi", "Breakfast"] },
  { id: "HT004", city: "SFO", name: "Bay View Hotel", price: 180, rating: 4.6, amenities: ["WiFi", "Pool", "Gym"] },
  { id: "HT005", city: "SFO", name: "Downtown Plaza", price: 140, rating: 4.3, amenities: ["WiFi", "Gym", "Restaurant"] },
  { id: "HT006", city: "SFO", name: "Tech Hub Inn", price: 120, rating: 4.2, amenities: ["WiFi", "Breakfast", "Gym"] },
];

// Sample activities database
const ACTIVITIES = [
  { id: "ACT001", city: "LAX", name: "Hollywood Walk of Fame", type: "Sightseeing", duration: "2-3 hours", cost: "Free" },
  { id: "ACT002", city: "LAX", name: "Santa Monica Pier", type: "Entertainment", duration: "3-4 hours", cost: "Free" },
  { id: "ACT003", city: "LAX", name: "Griffith Observatory", type: "Sightseeing", duration: "2 hours", cost: "Free" },
  { id: "ACT004", city: "SFO", name: "Golden Gate Bridge", type: "Sightseeing", duration: "1-2 hours", cost: "Free" },
  { id: "ACT005", city: "SFO", name: "Alcatraz Island Tour", type: "Tour", duration: "3-4 hours", cost: "$45" },
  { id: "ACT006", city: "SFO", name: "Fisherman's Wharf", type: "Entertainment", duration: "2-3 hours", cost: "Free" },
];

// Simulate weather data
const WEATHER_DATA: Record<string, Record<string, string>> = {
  LAX: {
    "2024-03-15": "Sunny, 72°F",
    "2024-03-16": "Partly Cloudy, 70°F",
    "2024-03-17": "Sunny, 74°F",
    "2024-03-22": "Sunny, 75°F",
  },
  SFO: {
    "2024-03-15": "Foggy, 60°F",
    "2024-03-16": "Partly Cloudy, 62°F",
    "2024-03-17": "Sunny, 65°F",
    "2024-03-22": "Partly Cloudy, 63°F",
  },
};

export async function todoListAgent(options: {
  message: string;
  apiKey: string;
  model?: string;
  threadId?: string;
}) {
  // Create the Anthropic model instance with user-provided API key
  const model = new ChatAnthropic({
    model: "claude-sonnet-4-5-20250929",
    apiKey: options.apiKey,
  });

  // Tool to search for flights
  const searchFlights = tool(
    async (input: { from: string; to: string; date: string }) => {
      const flights = FLIGHTS.filter(
        (f) =>
          f.from.toUpperCase() === input.from.toUpperCase() &&
          f.to.toUpperCase() === input.to.toUpperCase() &&
          f.date === input.date
      );
      if (flights.length === 0) {
        return {
          error: `No flights found from ${input.from} to ${input.to} on ${input.date}`,
        };
      }
      return {
        route: `${input.from} → ${input.to}`,
        date: input.date,
        flights: flights.slice(0, 5), // Return top 5 options
        count: flights.length,
      };
    },
    {
      name: "search_flights",
      description:
        "Search for available flights between two cities on a specific date. Returns flight options with prices, airlines, and durations.",
      schema: z.object({
        from: z.string().describe("Departure city code (e.g., NYC, LAX, SFO)"),
        to: z.string().describe("Arrival city code (e.g., NYC, LAX, SFO)"),
        date: z.string().describe("Travel date in YYYY-MM-DD format"),
      }),
    }
  );

  // Tool to search for hotels
  const searchHotels = tool(
    async (input: { city: string; maxPrice?: number }) => {
      const hotels = HOTELS.filter(
        (h) =>
          h.city.toUpperCase() === input.city.toUpperCase() &&
          (!input.maxPrice || h.price <= input.maxPrice)
      );
      if (hotels.length === 0) {
        return {
          error: `No hotels found in ${input.city}${input.maxPrice ? ` under $${input.maxPrice}` : ""}`,
        };
      }
      return {
        city: input.city,
        hotels: hotels.slice(0, 5), // Return top 5 options
        count: hotels.length,
      };
    },
    {
      name: "search_hotels",
      description:
        "Search for available hotels in a city. Optionally filter by maximum price per night. Returns hotel options with prices, ratings, and amenities.",
      schema: z.object({
        city: z.string().describe("City code (e.g., LAX, SFO)"),
        maxPrice: z.number().optional().describe("Maximum price per night (optional)"),
      }),
    }
  );

  // Tool to get activities/attractions
  const getActivities = tool(
    async (input: { city: string; type?: string }) => {
      let activities = ACTIVITIES.filter(
        (a) => a.city.toUpperCase() === input.city.toUpperCase()
      );
      if (input.type) {
        activities = activities.filter(
          (a) => a.type.toLowerCase() === input.type?.toLowerCase()
        );
      }
      if (activities.length === 0) {
        return {
          error: `No activities found in ${input.city}${input.type ? ` of type ${input.type}` : ""}`,
        };
      }
      return {
        city: input.city,
        activities: activities.slice(0, 10), // Return top 10 options
        count: activities.length,
      };
    },
    {
      name: "get_activities",
      description:
        "Get recommended activities and attractions in a city. Optionally filter by activity type (Sightseeing, Entertainment, Tour).",
      schema: z.object({
        city: z.string().describe("City code (e.g., LAX, SFO)"),
        type: z
          .string()
          .optional()
          .describe("Activity type filter (optional): Sightseeing, Entertainment, Tour"),
      }),
    }
  );

  // Tool to check weather forecast
  const getWeatherForecast = tool(
    async (input: { city: string; date: string }) => {
      const forecast = WEATHER_DATA[input.city.toUpperCase()]?.[input.date] || "Weather data not available";
      return {
        city: input.city,
        date: input.date,
        forecast,
      };
    },
    {
      name: "get_weather_forecast",
      description:
        "Get weather forecast for a specific city and date. Returns temperature and conditions.",
      schema: z.object({
        city: z.string().describe("City code (e.g., LAX, SFO)"),
        date: z.string().describe("Date in YYYY-MM-DD format"),
      }),
    }
  );

  // Tool to create packing list
  const createPackingList = tool(
    async (input: { destination: string; duration: number; weather: string; activities: string[] }) => {
      const items = ["Travel documents", "Wallet", "Phone charger"];

      // Add destination-specific items
      if (input.destination.includes("LAX") || input.destination.includes("Los Angeles")) {
        items.push("Sunglasses", "Sunscreen", "Beachwear");
      }
      if (input.destination.includes("SFO") || input.destination.includes("San Francisco")) {
        items.push("Layers", "Comfortable walking shoes");
      }

      // Add weather-based items
      if (input.weather.includes("rain") || input.weather.includes("cloudy")) {
        items.push("Umbrella", "Rain jacket");
      }
      if (input.weather.includes("sunny") || input.weather.includes("Sunny")) {
        items.push("Hat", "Sunscreen");
      }

      // Add activity-based items
      if (input.activities.some(a => a.toLowerCase().includes("beach"))) {
        items.push("Swimsuit", "Beach towel");
      }
      if (input.activities.some(a => a.toLowerCase().includes("hiking"))) {
        items.push("Hiking boots", "Water bottle");
      }

      // Add duration-based items
      if (input.duration > 3) {
        items.push("Extra clothes", "Toiletries");
      }

      return {
        destination: input.destination,
        duration: `${input.duration} days`,
        items: items.sort(),
        count: items.length,
      };
    },
    {
      name: "create_packing_list",
      description:
        "Create a personalized packing list based on destination, trip duration, weather forecast, and planned activities.",
      schema: z.object({
        destination: z.string().describe("Travel destination city"),
        duration: z.number().describe("Number of days for the trip"),
        weather: z.string().describe("Weather forecast summary"),
        activities: z.array(z.string()).describe("List of planned activities"),
      }),
    }
  );

  // Create agent with TodoListMiddleware
  const agent = createAgent({
    model,
    tools: [
      searchFlights,
      searchHotels,
      getActivities,
      getWeatherForecast,
      createPackingList,
    ],
    middleware: [todoListMiddleware()],
    checkpointer,
    systemPrompt: `You are an AI travel planning assistant that helps users plan their trips step by step.

You have access to tools that allow you to:
- Search for flights between cities
- Search for hotels by city and price
- Get recommendations for activities and attractions
- Check weather forecasts
- Create personalized packing lists

When a user asks for help planning a trip, you should use the write_todos tool to break down the complex task into manageable steps. For example:
1. Gather travel dates and destination preferences
2. Search for flight options
3. Search for hotel options
4. Get activity recommendations
5. Check weather forecast
6. Create itinerary
7. Prepare packing checklist

Work through each task systematically, gathering information step by step. Be thorough and provide complete, helpful travel planning advice. Adapt your plan as you gather new information from the user or from your tool calls.`,
  });

  // Initialize the conversation
  const initialState = {
    messages: [new HumanMessage(options.message)],
  };

  const threadId = options.threadId || `thread-${Date.now()}`;
  const stream = await agent.stream(initialState, {
    encoding: "text/event-stream",
    streamMode: ["values", "updates", "messages"],
    recursionLimit: 50,
    configurable: { thread_id: threadId },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

