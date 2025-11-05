import { z } from "zod";
import { createAgent, HumanMessage, tool, modelCallLimitMiddleware } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";

import { checkpointer } from "@/app/utils";

/**
 * Model Call Limit agent - demonstrates limiting model calls
 *
 * Scenario: Customer Support Agent
 * This agent helps customers with order inquiries, product information, and account issues.
 * It needs to query multiple systems (customer DB, orders, shipping, inventory) to answer
 * complex questions, which naturally requires multiple model calls.
 *
 * This demonstrates:
 * - Realistic multi-step workflows (lookup customer → find orders → check shipping → get product details)
 * - Model call limits preventing excessive API usage
 * - Cost control for complex customer service queries
 */

// Sample customer database
const CUSTOMERS = [
  { id: "CUST001", email: "alice@example.com", name: "Alice Johnson", joinDate: "2023-01-15" },
  { id: "CUST002", email: "bob@example.com", name: "Bob Smith", joinDate: "2023-03-22" },
  { id: "CUST003", email: "carol@example.com", name: "Carol Williams", joinDate: "2023-05-10" },
  { id: "CUST004", email: "david@example.com", name: "David Brown", joinDate: "2023-07-18" },
  { id: "CUST005", email: "eve@example.com", name: "Eve Davis", joinDate: "2023-09-05" },
];

// Sample orders database
const ORDERS = [
  { orderId: "ORD001", customerId: "CUST001", date: "2024-01-10", status: "shipped", total: 129.99 },
  { orderId: "ORD002", customerId: "CUST001", date: "2024-01-25", status: "processing", total: 89.50 },
  { orderId: "ORD003", customerId: "CUST002", date: "2024-01-12", status: "delivered", total: 249.99 },
  { orderId: "ORD004", customerId: "CUST003", date: "2024-01-28", status: "shipped", total: 59.99 },
  { orderId: "ORD005", customerId: "CUST004", date: "2024-01-05", status: "delivered", total: 199.99 },
  { orderId: "ORD006", customerId: "CUST005", date: "2024-01-30", status: "processing", total: 349.99 },
];

// Sample shipping information
const SHIPPING = [
  { orderId: "ORD001", carrier: "UPS", trackingNumber: "1Z999AA10123456784", estimatedDelivery: "2024-02-05" },
  { orderId: "ORD003", carrier: "FedEx", trackingNumber: "123456789012", estimatedDelivery: "2024-01-20" },
  { orderId: "ORD004", carrier: "USPS", trackingNumber: "9400111899223197428490", estimatedDelivery: "2024-02-03" },
  { orderId: "ORD005", carrier: "UPS", trackingNumber: "1Z999AA10234567891", estimatedDelivery: "2024-01-12" },
];

// Sample products database
const PRODUCTS = [
  { sku: "PROD001", name: "Wireless Headphones", price: 79.99, category: "Electronics", inStock: true },
  { sku: "PROD002", name: "Laptop Stand", price: 49.99, category: "Office", inStock: true },
  { sku: "PROD003", name: "Mechanical Keyboard", price: 129.99, category: "Electronics", inStock: false },
  { sku: "PROD004", name: "USB-C Cable", price: 19.99, category: "Accessories", inStock: true },
  { sku: "PROD005", name: "Monitor Stand", price: 39.99, category: "Office", inStock: true },
  { sku: "PROD006", name: "Wireless Mouse", price: 29.99, category: "Electronics", inStock: true },
];

export async function modelCallLimitsAgent(options: {
  message: string;
  apiKey: string;
  threadLimit?: number;
  runLimit?: number;
  exitBehavior?: "throw" | "end";
  model?: string;
  threadId?: string;
}) {
  const modelName = options.model ?? "claude-3-7-sonnet-latest";
  const threadLimit = options.threadLimit ?? 30;
  const runLimit = options.runLimit ?? 5;
  const exitBehavior = options.exitBehavior ?? "throw" as const;

  // Create the Anthropic model instance with user-provided API key
  const model = new ChatAnthropic({
    model: modelName,
    apiKey: options.apiKey,
  });

  // Tool to lookup customer by email
  const lookupCustomer = tool(
    async (input: { email: string }) => {
      const customer = CUSTOMERS.find((c) => c.email.toLowerCase() === input.email.toLowerCase());
      if (!customer) {
        return { error: `Customer with email ${input.email} not found` };
      }
      return customer;
    },
    {
      name: "lookup_customer",
      description: "Look up a customer by their email address. Returns customer ID, name, and join date.",
      schema: z.object({
        email: z.string().email().describe("The customer's email address"),
      }),
    }
  );

  // Tool to get orders for a customer
  const getCustomerOrders = tool(
    async (input: { customerId: string }) => {
      const orders = ORDERS.filter((o) => o.customerId === input.customerId);
      return {
        customerId: input.customerId,
        orders,
        count: orders.length,
      };
    },
    {
      name: "get_customer_orders",
      description: "Get all orders for a specific customer by their customer ID.",
      schema: z.object({
        customerId: z.string().describe("The customer ID (e.g., CUST001)"),
      }),
    }
  );

  // Tool to get order details
  const getOrderDetails = tool(
    async (input: { orderId: string }) => {
      const order = ORDERS.find((o) => o.orderId === input.orderId);
      if (!order) {
        return { error: `Order ${input.orderId} not found` };
      }
      return order;
    },
    {
      name: "get_order_details",
      description: "Get details for a specific order by order ID. Returns order date, status, and total.",
      schema: z.object({
        orderId: z.string().describe("The order ID (e.g., ORD001)"),
      }),
    }
  );

  // Tool to check shipping status
  const getShippingStatus = tool(
    async (input: { orderId: string }) => {
      const shipping = SHIPPING.find((s) => s.orderId === input.orderId);
      if (!shipping) {
        return { error: `Shipping information not found for order ${input.orderId}` };
      }
      return shipping;
    },
    {
      name: "get_shipping_status",
      description: "Get shipping information for an order including carrier, tracking number, and estimated delivery date.",
      schema: z.object({
        orderId: z.string().describe("The order ID to check shipping for"),
      }),
    }
  );

  // Tool to lookup product information
  const lookupProduct = tool(
    async (input: { sku: string }) => {
      const product = PRODUCTS.find((p) => p.sku === input.sku);
      if (!product) {
        return { error: `Product with SKU ${input.sku} not found` };
      }
      return product;
    },
    {
      name: "lookup_product",
      description: "Look up product information by SKU. Returns product name, price, category, and stock status.",
      schema: z.object({
        sku: z.string().describe("The product SKU (e.g., PROD001)"),
      }),
    }
  );

  // Tool to search products by category
  const searchProductsByCategory = tool(
    async (input: { category: string }) => {
      const products = PRODUCTS.filter((p) => p.category.toLowerCase() === input.category.toLowerCase());
      return {
        category: input.category,
        products,
        count: products.length,
      };
    },
    {
      name: "search_products_by_category",
      description: "Search for products in a specific category. Categories include: Electronics, Office, Accessories.",
      schema: z.object({
        category: z.string().describe("The product category to search"),
      }),
    }
  );

  // Tool to check inventory for multiple products
  const checkInventory = tool(
    async (input: { skus: string[] }) => {
      const inventory = input.skus.map((sku) => {
        const product = PRODUCTS.find((p) => p.sku === sku);
        return {
          sku,
          inStock: product?.inStock ?? false,
          name: product?.name ?? "Not found",
        };
      });
      return { inventory };
    },
    {
      name: "check_inventory",
      description: "Check inventory status for one or more products by their SKUs. Call this for each set of products you need to check.",
      schema: z.object({
        skus: z.array(z.string()).describe("Array of product SKUs to check"),
      }),
    }
  );

  // Create agent with ModelCallLimitMiddleware
  const agent = createAgent({
    model,
    tools: [
      lookupCustomer,
      getCustomerOrders,
      getOrderDetails,
      getShippingStatus,
      lookupProduct,
      searchProductsByCategory,
      checkInventory,
    ],
    middleware: [
      modelCallLimitMiddleware({
        threadLimit: threadLimit,
        runLimit: runLimit,
        exitBehavior,
      }),
    ],
    checkpointer,
    systemPrompt: `You are a customer support agent helping customers with their orders, products, and account questions.

You have access to tools that allow you to:
- Look up customer information by email
- Get customer orders by customer ID
- Get detailed information about specific orders
- Check shipping status and tracking information
- Look up product information by SKU
- Search products by category
- Check inventory status for products

When helping customers, you may need to make multiple tool calls to gather complete information:
- First, look up the customer by email
- Then get their orders to see what they've purchased
- Check shipping status for orders that are in transit
- Look up product details if they ask about specific items
- Check inventory if they want to know product availability

Always be helpful, professional, and provide complete information to the customer. If you need to check multiple orders or products, make sure to gather all the relevant information before responding.`,
  });

  // Initialize the conversation
  const initialState = {
    messages: [new HumanMessage(options.message)],
  };

  const threadId = options.threadId || `thread-${Date.now()}`;
  const stream = await agent.stream(initialState, {
    // @ts-expect-error - not yet updated
    encoding: "text/event-stream",
    streamMode: ["values", "updates", "messages"],
    recursionLimit: 50, // High recursion limit to allow many calls before hitting the middleware limit
    configurable: { thread_id: threadId },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

