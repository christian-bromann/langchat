import { z } from "zod";
import { createAgent, HumanMessage, tool, todoListMiddleware } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";

import { checkpointer } from "@/app/utils";

// Sample flight database with base prices
const FLIGHTS_BASE = [
  { id: "FL001", from: "NYC", to: "LAX", date: "2024-03-15", basePrice: 299, airline: "Delta", duration: "6h 30m" },
  { id: "FL002", from: "NYC", to: "LAX", date: "2024-03-15", basePrice: 349, airline: "United", duration: "6h 15m" },
  { id: "FL003", from: "NYC", to: "LAX", date: "2024-03-15", basePrice: 279, airline: "American", duration: "6h 45m" },
  { id: "FL004", from: "NYC", to: "SFO", date: "2024-03-15", basePrice: 329, airline: "Delta", duration: "6h 0m" },
  { id: "FL005", from: "NYC", to: "SFO", date: "2024-03-15", basePrice: 379, airline: "United", duration: "5h 45m" },
  { id: "FL006", from: "LAX", to: "NYC", date: "2024-03-22", basePrice: 299, airline: "Delta", duration: "6h 30m" },
  { id: "FL007", from: "LAX", to: "NYC", date: "2024-03-22", basePrice: 349, airline: "United", duration: "6h 15m" },
  { id: "FL008", from: "SFO", to: "NYC", date: "2024-03-22", basePrice: 329, airline: "Delta", duration: "6h 0m" },
];

// Sample hotels database with availability tracking
const HOTELS_BASE = [
  { id: "HT001", city: "LAX", name: "Grand Hotel LA", basePrice: 150, rating: 4.5, amenities: ["WiFi", "Pool", "Gym"], availability: 5 },
  { id: "HT002", city: "LAX", name: "Beachside Resort", basePrice: 200, rating: 4.8, amenities: ["WiFi", "Pool", "Gym", "Spa"], availability: 3 },
  { id: "HT003", city: "LAX", name: "City Center Inn", basePrice: 100, rating: 4.0, amenities: ["WiFi", "Breakfast"], availability: 8 },
  { id: "HT004", city: "SFO", name: "Bay View Hotel", basePrice: 180, rating: 4.6, amenities: ["WiFi", "Pool", "Gym"], availability: 4 },
  { id: "HT005", city: "SFO", name: "Downtown Plaza", basePrice: 140, rating: 4.3, amenities: ["WiFi", "Gym", "Restaurant"], availability: 6 },
  { id: "HT006", city: "SFO", name: "Tech Hub Inn", basePrice: 120, rating: 4.2, amenities: ["WiFi", "Breakfast", "Gym"], availability: 7 },
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

// Track search state to penalize poor planning (e.g., multiple searches increase prices)
const searchState = {
  flightSearches: 0,
  hotelSearches: 0,
  lastSearchedCity: null as string | null,
};

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
export async function todoListAgent(options: {
  message: string;
  apiKey: string;
  model?: string;
  threadId?: string;
}) {
  // Create the Anthropic model instance with user-provided API key
  const model = new ChatAnthropic({
    model: "claude-3-7-sonnet-latest",
    apiKey: options.apiKey,
  });

  // Tool to check budget before making decisions
  const checkBudget = tool(
    async (input: { budget: number; estimatedCost?: number }) => {
      if (input.estimatedCost && input.estimatedCost > input.budget) {
        return {
          warning: `Estimated cost ($${input.estimatedCost}) exceeds budget ($${input.budget}). Consider adjusting plans.`,
          budget: input.budget,
          estimatedCost: input.estimatedCost,
          remaining: input.budget - input.estimatedCost,
          withinBudget: false,
        };
      }
      return {
        budget: input.budget,
        estimatedCost: input.estimatedCost || 0,
        remaining: input.budget - (input.estimatedCost || 0),
        withinBudget: true,
        message: input.estimatedCost
          ? `Budget check: $${input.estimatedCost} fits within $${input.budget} budget ($${input.budget - input.estimatedCost} remaining)`
          : `Budget available: $${input.budget}`,
      };
    },
    {
      name: "check_budget",
      description:
        "Check if estimated costs fit within the user's budget. IMPORTANT: Use this BEFORE searching for flights/hotels to ensure you stay within budget. This helps avoid wasting searches on options that are too expensive.",
      schema: z.object({
        budget: z.number().describe("Total budget for the trip"),
        estimatedCost: z.number().optional().describe("Estimated cost to check against budget"),
      }),
    }
  );

  // Tool to search for flights (prices increase with multiple searches - simulating urgency)
  const searchFlights = tool(
    async (input: { from: string; to: string; date: string }) => {
      // Reset search state if searching different route (good planning)
      if (searchState.lastSearchedCity !== `${input.from}-${input.to}`) {
        searchState.flightSearches = 0;
        searchState.lastSearchedCity = `${input.from}-${input.to}`;
      }

      searchState.flightSearches++;

      // Price increases with each search (simulating urgency/demand)
      const priceMultiplier = 1 + (searchState.flightSearches - 1) * 0.1; // 10% increase per search

      const flights = FLIGHTS_BASE.filter(
        (f) =>
          f.from.toUpperCase() === input.from.toUpperCase() &&
          f.to.toUpperCase() === input.to.toUpperCase() &&
          f.date === input.date
      ).map(f => ({
        ...f,
        price: Math.round(f.basePrice * priceMultiplier),
      }));

      if (flights.length === 0) {
        return {
          error: `No flights found from ${input.from} to ${input.to} on ${input.date}`,
        };
      }

      const warning = searchState.flightSearches > 1
        ? `⚠️ Note: Prices have increased due to multiple searches. Better planning could have avoided this.`
        : undefined;

      return {
        route: `${input.from} → ${input.to}`,
        date: input.date,
        flights: flights.slice(0, 5).map(({ basePrice, ...f }) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const _ = basePrice; // basePrice used internally but excluded from output
          return f;
        }),
        count: flights.length,
        warning,
        searchCount: searchState.flightSearches,
      };
    },
    {
      name: "search_flights",
      description:
        "Search for available flights between two cities on a specific date. Returns flight options with prices, airlines, and durations. IMPORTANT: Prices increase with each search, so plan carefully and check budget first.",
      schema: z.object({
        from: z.string().describe("Departure city code (e.g., NYC, LAX, SFO)"),
        to: z.string().describe("Arrival city code (e.g., NYC, LAX, SFO)"),
        date: z.string().describe("Travel date in YYYY-MM-DD format"),
      }),
    }
  );

  // Tool to search for hotels (availability decreases with multiple searches)
  const searchHotels = tool(
    async (input: { city: string; maxPrice?: number; nights?: number }) => {
      // Reset if searching different city (good planning)
      if (searchState.lastSearchedCity !== input.city) {
        searchState.hotelSearches = 0;
        searchState.lastSearchedCity = input.city;
      }

      searchState.hotelSearches++;

      // Availability decreases with each search (simulating bookings happening)
      const availabilityReduction = Math.min(searchState.hotelSearches - 1, 2); // Max 2 rooms lost

      const hotels = HOTELS_BASE.filter(
        (h) =>
          h.city.toUpperCase() === input.city.toUpperCase() &&
          (!input.maxPrice || h.basePrice <= input.maxPrice)
      ).map(h => {
        const available = Math.max(0, h.availability - availabilityReduction);
        return {
          ...h,
          price: h.basePrice,
          availability: available,
          available: available > 0,
        };
      }).filter(h => h.available); // Only show available hotels

      if (hotels.length === 0) {
        return {
          error: `No hotels found in ${input.city}${input.maxPrice ? ` under $${input.maxPrice}` : ""}${availabilityReduction > 0 ? " (some may have been booked due to delayed search)" : ""}`,
        };
      }

      const warning = searchState.hotelSearches > 1
        ? `⚠️ Note: Some hotels have reduced availability due to delayed search. Better planning could have secured better options.`
        : undefined;

      return {
        city: input.city,
        hotels: hotels.slice(0, 5).map(({ basePrice, availability: avail, ...h }) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const _ = basePrice; // basePrice used internally but excluded from output
          return {
            ...h,
            availability: `${avail} rooms`,
          };
        }),
        count: hotels.length,
        warning,
        searchCount: searchState.hotelSearches,
      };
    },
    {
      name: "search_hotels",
      description:
        "Search for available hotels in a city. Optionally filter by maximum price per night and number of nights. Returns hotel options with prices, ratings, amenities, and availability. IMPORTANT: Availability decreases with each search, so plan carefully and check budget first.",
      schema: z.object({
        city: z.string().describe("City code (e.g., LAX, SFO)"),
        maxPrice: z.number().optional().describe("Maximum price per night (optional)"),
        nights: z.number().optional().describe("Number of nights (optional, helps calculate total cost)"),
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

  // Tool to calculate total trip cost (requires all components)
  const calculateTotalCost = tool(
    async (input: {
      flightCost?: number;
      hotelCost?: number;
      hotelNights?: number;
      activityCost?: number;
      otherCosts?: number;
    }) => {
      const flight = input.flightCost || 0;
      const hotel = (input.hotelCost || 0) * (input.hotelNights || 0);
      const activities = input.activityCost || 0;
      const other = input.otherCosts || 0;
      const total = flight + hotel + activities + other;

      const breakdown = {
        flights: flight,
        hotel: hotel,
        activities: activities,
        other: other,
        total: total,
      };

      const missing = [];
      if (!input.flightCost) missing.push("flight cost");
      if (!input.hotelCost || !input.hotelNights) missing.push("hotel cost");
      if (input.activityCost === undefined) missing.push("activity costs");

      if (missing.length > 0) {
        return {
          ...breakdown,
          warning: `⚠️ Incomplete calculation. Missing: ${missing.join(", ")}. Make sure to gather all costs before calculating total.`,
          complete: false,
        };
      }

      return {
        ...breakdown,
        message: `Total trip cost: $${total} (Flights: $${flight}, Hotel: $${hotel}, Activities: $${activities}, Other: $${other})`,
        complete: true,
      };
    },
    {
      name: "calculate_total_cost",
      description:
        "Calculate the total cost of the trip by combining flight costs, hotel costs (price × nights), activity costs, and other expenses. IMPORTANT: This requires information from previous steps - make sure you have flight prices, hotel prices, and number of nights before calling this.",
      schema: z.object({
        flightCost: z.number().optional().describe("Total cost of flights (round trip)"),
        hotelCost: z.number().optional().describe("Price per night for hotel"),
        hotelNights: z.number().optional().describe("Number of nights"),
        activityCost: z.number().optional().describe("Estimated cost of activities"),
        otherCosts: z.number().optional().describe("Other expenses (meals, transportation, etc.)"),
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
        "Create a personalized packing list based on destination, trip duration, weather forecast, and planned activities. IMPORTANT: Requires weather and activities information from previous steps.",
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
      checkBudget,
      searchFlights,
      searchHotels,
      getActivities,
      getWeatherForecast,
      calculateTotalCost,
      createPackingList,
    ],
    middleware: [todoListMiddleware()],
    checkpointer,
    systemPrompt: `You are an AI travel planning assistant that helps users plan their trips step by step.

You have access to tools that allow you to:
- Check budget before making decisions (IMPORTANT: Use this first!)
- Search for flights between cities (prices increase with multiple searches)
- Search for hotels by city and price (availability decreases with delayed searches)
- Get recommendations for activities and attractions
- Check weather forecasts
- Calculate total trip cost (requires all components)
- Create personalized packing lists`,
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

