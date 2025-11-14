import { z } from "zod";
import { createAgent, HumanMessage, tool, llmToolSelectorMiddleware, createMiddleware } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";

import { checkpointer } from "@/app/utils";

/**
 * Mock database of products
 */
const PRODUCTS = {
  "laptop": {
    name: "Premium Laptop Pro",
    price: 1299.99,
    stock: 45,
    category: "Electronics",
    description: "High-performance laptop with 16GB RAM and 512GB SSD",
    brand: "TechCorp",
    rating: 4.5,
  },
  "phone": {
    name: "SmartPhone X",
    price: 899.99,
    stock: 120,
    category: "Electronics",
    description: "Latest smartphone with advanced camera and AI features",
    brand: "TechCorp",
    rating: 4.7,
  },
  "headphones": {
    name: "Wireless Headphones Pro",
    price: 249.99,
    stock: 78,
    category: "Audio",
    description: "Noise-cancelling wireless headphones with 30-hour battery",
    brand: "SoundMax",
    rating: 4.6,
  },
  "tablet": {
    name: "Tablet Plus",
    price: 599.99,
    stock: 32,
    category: "Electronics",
    description: "10-inch tablet with stylus support and long battery life",
    brand: "TechCorp",
    rating: 4.4,
  },
  "watch": {
    name: "Smart Watch Elite",
    price: 399.99,
    stock: 56,
    category: "Wearables",
    description: "Fitness tracking smartwatch with heart rate monitor",
    brand: "FitTech",
    rating: 4.3,
  },
  "speaker": {
    name: "Bluetooth Speaker Max",
    price: 179.99,
    stock: 89,
    category: "Audio",
    description: "Portable speaker with 360-degree sound",
    brand: "SoundMax",
    rating: 4.2,
  },
};

// Product search tools
const searchProducts = tool(
  async (input: { query: string }) => {
    const queryLower = input.query.toLowerCase();
    const results = Object.entries(PRODUCTS)
      .filter(([key, product]) =>
        product.name.toLowerCase().includes(queryLower) ||
        product.category.toLowerCase().includes(queryLower) ||
        key.includes(queryLower)
      )
      .map(([key, product]) => ({
        id: key,
        ...product,
      }));

    return {
      query: input.query,
      results,
      count: results.length,
    };
  },
  {
    name: "search_products",
    description: "Search for products by name, category, or keyword. Returns matching products with details.",
    schema: z.object({
      query: z.string().describe("The search query to find products"),
    }),
  }
);

// Tool to search products by category
const searchProductsByCategory = tool(
  async (input: { category: string }) => {
    const categoryLower = input.category.toLowerCase();
    const results = Object.entries(PRODUCTS)
      .filter(([, product]) => product.category.toLowerCase() === categoryLower)
      .map(([key, product]) => ({ id: key, ...product }));
    return { category: input.category, results, count: results.length };
  },
  {
    name: "search_products_by_category",
    description: "Search for products by category name (e.g., 'Electronics', 'Audio', 'Wearables').",
    schema: z.object({
      category: z.string().describe("The product category to search in"),
    }),
  }
);

// Tool to search products by brand
const searchProductsByBrand = tool(
  async (input: { brand: string }) => {
    const brandLower = input.brand.toLowerCase();
    const results = Object.entries(PRODUCTS)
      .filter(([, product]) => product.brand.toLowerCase().includes(brandLower))
      .map(([key, product]) => ({ id: key, ...product }));
    return { brand: input.brand, results, count: results.length };
  },
  {
    name: "search_products_by_brand",
    description: "Search for products by brand name (e.g., 'TechCorp', 'SoundMax', 'FitTech').",
    schema: z.object({
      brand: z.string().describe("The brand name to search for"),
    }),
  }
);

// Tool to search products by price range
const searchProductsByPriceRange = tool(
  async (input: { minPrice: number; maxPrice: number }) => {
    const results = Object.entries(PRODUCTS)
      .filter(([, product]) => product.price >= input.minPrice && product.price <= input.maxPrice)
      .map(([key, product]) => ({ id: key, ...product }));
    return { minPrice: input.minPrice, maxPrice: input.maxPrice, results, count: results.length };
  },
  {
    name: "search_products_by_price_range",
    description: "Search for products within a specific price range.",
    schema: z.object({
      minPrice: z.number().describe("Minimum price in dollars"),
      maxPrice: z.number().describe("Maximum price in dollars"),
    }),
  }
);

// Get product details tool
const getProductDetails = tool(
  async (input: { productId: string }) => {
    const product = PRODUCTS[input.productId as keyof typeof PRODUCTS];
    if (!product) {
      return {
        error: `Product not found: ${input.productId}`,
        productId: input.productId,
      };
    }

    return {
      productId: input.productId,
      ...product,
    };
  },
  {
    name: "get_product_details",
    description: "Get detailed information about a specific product by its ID.",
    schema: z.object({
      productId: z.string().describe("The product ID to get details for"),
    }),
  }
);

// Check inventory tool
const checkInventory = tool(
  async (input: { productId: string }) => {
    const product = PRODUCTS[input.productId as keyof typeof PRODUCTS];
    if (!product) {
      return {
        error: `Product not found: ${input.productId}`,
        productId: input.productId,
      };
    }

    return {
      productId: input.productId,
      stock: product.stock,
      inStock: product.stock > 0,
      availability: product.stock > 20 ? "high" : product.stock > 5 ? "medium" : "low",
    };
  },
  {
    name: "check_inventory",
    description: "Check the inventory status and stock level for a specific product.",
    schema: z.object({
      productId: z.string().describe("The product ID to check inventory for"),
    }),
  }
);

// Calculate shipping cost tool
const calculateShipping = tool(
  async (input: { productId: string; destination: string }) => {
    const product = PRODUCTS[input.productId as keyof typeof PRODUCTS];
    if (!product) {
      return {
        error: `Product not found: ${input.productId}`,
        productId: input.productId,
      };
    }

    // Mock shipping calculation
    const baseShipping = 10.0;
    const weightMultiplier = product.price > 1000 ? 1.5 : 1.0;
    const shippingCost = baseShipping * weightMultiplier;

    return {
      productId: input.productId,
      destination: input.destination,
      shippingCost: shippingCost.toFixed(2),
      estimatedDays: 3,
    };
  },
  {
    name: "calculate_shipping",
    description: "Calculate shipping cost and estimated delivery time for a product to a destination.",
    schema: z.object({
      productId: z.string().describe("The product ID to calculate shipping for"),
      destination: z.string().describe("The destination address or city"),
    }),
  }
);

// Get product reviews tool
const getProductReviews = tool(
  async (input: { productId: string }) => {
    const product = PRODUCTS[input.productId as keyof typeof PRODUCTS];
    if (!product) {
      return {
        error: `Product not found: ${input.productId}`,
        productId: input.productId,
      };
    }

    // Mock reviews
    const reviews = [
      { rating: 5, comment: "Excellent product, highly recommend!" },
      { rating: 4, comment: "Great quality, fast shipping." },
      { rating: 5, comment: "Love it! Worth every penny." },
    ];

    return {
      productId: input.productId,
      reviews,
      averageRating: 4.67,
      totalReviews: reviews.length,
    };
  },
  {
    name: "get_product_reviews",
    description: "Get customer reviews and ratings for a specific product.",
    schema: z.object({
      productId: z.string().describe("The product ID to get reviews for"),
    }),
  }
);

// Compare products tool
const compareProducts = tool(
  async (input: { productIds: string[] }) => {
    const products = input.productIds
      .map((id) => {
        const product = PRODUCTS[id as keyof typeof PRODUCTS];
        return product ? { id, ...product } : null;
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return {
      products,
      count: products.length,
    };
  },
  {
    name: "compare_products",
    description: "Compare multiple products side by side by their IDs.",
    schema: z.object({
      productIds: z.array(z.string()).describe("Array of product IDs to compare"),
    }),
  }
);

// Product recommendations and related products
const getProductRecommendations = tool(
  async (input: { productId: string }) => {
    const product = PRODUCTS[input.productId as keyof typeof PRODUCTS];
    if (!product) {
      return { error: `Product not found: ${input.productId}` };
    }
    const recommendations = Object.entries(PRODUCTS)
      .filter(([id, p]) => id !== input.productId && (p.category === product.category || p.brand === product.brand))
      .slice(0, 3)
      .map(([id, p]) => ({ id, ...p }));
    return { productId: input.productId, recommendations, count: recommendations.length };
  },
  {
    name: "get_product_recommendations",
    description: "Get product recommendations based on a specific product (similar category or brand).",
    schema: z.object({
      productId: z.string().describe("The product ID to get recommendations for"),
    }),
  }
);

// Tool to get related products
const getRelatedProducts = tool(
  async (input: { productId: string }) => {
    const product = PRODUCTS[input.productId as keyof typeof PRODUCTS];
    if (!product) {
      return { error: `Product not found: ${input.productId}` };
    }
    const related = Object.entries(PRODUCTS)
      .filter(([id, p]) => id !== input.productId && p.category === product.category)
      .slice(0, 4)
      .map(([id, p]) => ({ id, ...p }));
    return { productId: input.productId, related, count: related.length };
  },
  {
    name: "get_related_products",
    description: "Get products related to a specific product (same category).",
    schema: z.object({
      productId: z.string().describe("The product ID to get related products for"),
    }),
  }
);

// Pricing and discounts
const checkProductDiscounts = tool(
  async (input: { productId: string }) => {
    const product = PRODUCTS[input.productId as keyof typeof PRODUCTS];
    if (!product) {
      return { error: `Product not found: ${input.productId}` };
    }
    const hasDiscount = product.price > 1000;
    const discountPercent = hasDiscount ? 10 : 0;
    const discountedPrice = hasDiscount ? product.price * 0.9 : product.price;
    return {
      productId: input.productId,
      originalPrice: product.price,
      discountedPrice,
      discountPercent,
      hasDiscount,
    };
  },
  {
    name: "check_product_discounts",
    description: "Check if a product has any active discounts or promotions.",
    schema: z.object({
      productId: z.string().describe("The product ID to check discounts for"),
    }),
  }
);

// Tool to get product price history
const getProductPriceHistory = tool(
  async (input: { productId: string }) => {
    const product = PRODUCTS[input.productId as keyof typeof PRODUCTS];
    if (!product) {
      return { error: `Product not found: ${input.productId}` };
    }
    return {
      productId: input.productId,
      currentPrice: product.price,
      priceHistory: [
        { date: "2024-01-01", price: product.price * 1.1 },
        { date: "2024-02-01", price: product.price * 1.05 },
        { date: "2024-03-01", price: product.price },
      ],
    };
  },
  {
    name: "get_product_price_history",
    description: "Get historical pricing information for a product.",
    schema: z.object({
      productId: z.string().describe("The product ID to get price history for"),
    }),
  }
);

// Inventory and availability
const checkProductAvailability = tool(
  async (input: { productId: string; location?: string }) => {
    const product = PRODUCTS[input.productId as keyof typeof PRODUCTS];
    if (!product) {
      return { error: `Product not found: ${input.productId}` };
    }
    return {
      productId: input.productId,
      location: input.location || "default",
      available: product.stock > 0,
      stock: product.stock,
      estimatedDelivery: product.stock > 20 ? "1-2 days" : product.stock > 5 ? "3-5 days" : "1-2 weeks",
    };
  },
  {
    name: "check_product_availability",
    description: "Check product availability and estimated delivery time for a specific location.",
    schema: z.object({
      productId: z.string().describe("The product ID to check availability for"),
      location: z.string().optional().describe("The location/zip code to check availability"),
    }),
  }
);

// Tool to get product specifications
const getProductSpecifications = tool(
  async (input: { productId: string }) => {
    const product = PRODUCTS[input.productId as keyof typeof PRODUCTS];
    if (!product) {
      return { error: `Product not found: ${input.productId}` };
    }
    return {
      productId: input.productId,
      specifications: {
        category: product.category,
        brand: product.brand,
        price: product.price,
        stock: product.stock,
        rating: product.rating,
        description: product.description,
      },
    };
  },
  {
    name: "get_product_specifications",
    description: "Get detailed technical specifications for a product.",
    schema: z.object({
      productId: z.string().describe("The product ID to get specifications for"),
    }),
  }
);

// Orders and cart
const createOrder = tool(
  async (input: { productId: string; quantity: number; userId?: string }) => {
    const product = PRODUCTS[input.productId as keyof typeof PRODUCTS];
    if (!product) {
      return { error: `Product not found: ${input.productId}` };
    }
    if (product.stock < input.quantity) {
      return { error: `Insufficient stock. Available: ${product.stock}` };
    }
    const orderId = `ORD-${Date.now()}`;
    return {
      orderId,
      productId: input.productId,
      quantity: input.quantity,
      totalPrice: product.price * input.quantity,
      status: "pending",
      estimatedDelivery: "3-5 business days",
    };
  },
  {
    name: "create_order",
    description: "Create a new order for a product with specified quantity.",
    schema: z.object({
      productId: z.string().describe("The product ID to order"),
      quantity: z.number().describe("The quantity to order"),
      userId: z.string().optional().describe("The user ID placing the order"),
    }),
  }
);

// Tool to get order status
const getOrderStatus = tool(
  async (input: { orderId: string }) => {
    return {
      orderId: input.orderId,
      status: "processing",
      estimatedDelivery: "2024-12-25",
      trackingNumber: `TRK-${input.orderId}`,
    };
  },
  {
    name: "get_order_status",
    description: "Get the current status and tracking information for an order.",
    schema: z.object({
      orderId: z.string().describe("The order ID to check status for"),
    }),
  }
);

// Tool to add a product to the cart
const addToCart = tool(
  async (input: { productId: string; quantity: number; userId?: string }) => {
    const product = PRODUCTS[input.productId as keyof typeof PRODUCTS];
    if (!product) {
      return { error: `Product not found: ${input.productId}` };
    }
    return {
      success: true,
      productId: input.productId,
      quantity: input.quantity,
      cartItemId: `CART-${Date.now()}`,
      message: "Product added to cart",
    };
  },
  {
    name: "add_to_cart",
    description: "Add a product to the shopping cart.",
    schema: z.object({
      productId: z.string().describe("The product ID to add to cart"),
      quantity: z.number().describe("The quantity to add"),
      userId: z.string().optional().describe("The user ID"),
    }),
  }
);

// Tool to get cart contents
const getCartContents = tool(
  async (input: { userId?: string }) => {
    return {
      userId: input.userId || "guest",
      items: [
        { productId: "laptop", quantity: 1, price: 1299.99 },
        { productId: "headphones", quantity: 2, price: 249.99 },
      ],
      totalItems: 3,
      totalPrice: 1799.97,
    };
  },
  {
    name: "get_cart_contents",
    description: "Get the current contents of the shopping cart.",
    schema: z.object({
      userId: z.string().optional().describe("The user ID"),
    }),
  }
);

// Wishlist
const addToWishlist = tool(
  async (input: { productId: string; userId?: string }) => {
    const product = PRODUCTS[input.productId as keyof typeof PRODUCTS];
    if (!product) {
      return { error: `Product not found: ${input.productId}` };
    }
    return {
      success: true,
      productId: input.productId,
      userId: input.userId || "guest",
      message: "Product added to wishlist",
    };
  },
  {
    name: "add_to_wishlist",
    description: "Add a product to the user's wishlist.",
    schema: z.object({
      productId: z.string().describe("The product ID to add to wishlist"),
      userId: z.string().optional().describe("The user ID"),
    }),
  }
);

// Tool to get wishlist contents
const getWishlist = tool(
  async (input: { userId?: string }) => {
    return {
      userId: input.userId || "guest",
      items: [
        { productId: "phone", addedDate: "2024-12-01" },
        { productId: "watch", addedDate: "2024-12-05" },
      ],
      count: 2,
    };
  },
  {
    name: "get_wishlist",
    description: "Get the user's wishlist items.",
    schema: z.object({
      userId: z.string().optional().describe("The user ID"),
    }),
  }
);

// User account
const getUserProfile = tool(
  async (input: { userId: string }) => {
    return {
      userId: input.userId,
      name: "John Doe",
      email: "john@example.com",
      memberSince: "2023-01-15",
      totalOrders: 12,
      loyaltyPoints: 450,
    };
  },
  {
    name: "get_user_profile",
    description: "Get user profile information including order history and loyalty points.",
    schema: z.object({
      userId: z.string().describe("The user ID to get profile for"),
    }),
  }
);

// Tool to get user order history
const getUserOrderHistory = tool(
  async (input: { userId: string; limit?: number }) => {
    return {
      userId: input.userId,
      orders: [
        { orderId: "ORD-001", date: "2024-11-15", total: 1299.99, status: "delivered" },
        { orderId: "ORD-002", date: "2024-12-01", total: 899.99, status: "shipped" },
      ],
      count: 2,
    };
  },
  {
    name: "get_user_order_history",
    description: "Get the order history for a user.",
    schema: z.object({
      userId: z.string().describe("The user ID to get order history for"),
      limit: z.number().optional().describe("Maximum number of orders to return"),
    }),
  }
);

// Product questions and answers
const getProductQuestions = tool(
  async (input: { productId: string }) => {
    return {
      productId: input.productId,
      questions: [
        { id: "Q1", question: "Does this come with a warranty?", answer: "Yes, 1-year manufacturer warranty" },
        { id: "Q2", question: "What's the return policy?", answer: "30-day money-back guarantee" },
      ],
      count: 2,
    };
  },
  {
    name: "get_product_questions",
    description: "Get frequently asked questions and answers for a product.",
    schema: z.object({
      productId: z.string().describe("The product ID to get questions for"),
    }),
  }
);

// Tool to ask a question about a product
const askProductQuestion = tool(
  async (input: { productId: string; question: string; userId?: string }) => {
    return {
      success: true,
      productId: input.productId,
      questionId: `Q-${Date.now()}`,
      message: "Your question has been submitted and will be answered soon",
    };
  },
  {
    name: "ask_product_question",
    description: "Submit a question about a product.",
    schema: z.object({
      productId: z.string().describe("The product ID"),
      question: z.string().describe("The question to ask"),
      userId: z.string().optional().describe("The user ID asking the question"),
    }),
  }
);

// Notifications and alerts
const setProductAvailabilityAlert = tool(
  async (input: { productId: string; userId?: string }) => {
    return {
      success: true,
      productId: input.productId,
      alertId: `ALERT-${Date.now()}`,
      message: "You will be notified when this product is back in stock",
    };
  },
  {
    name: "set_product_availability_alert",
    description: "Set up an alert to be notified when a product becomes available.",
    schema: z.object({
      productId: z.string().describe("The product ID to set alert for"),
      userId: z.string().optional().describe("The user ID"),
    }),
  }
);

// Tool to set a price drop alert
const setPriceDropAlert = tool(
  async (input: { productId: string; targetPrice: number; userId?: string }) => {
    return {
      success: true,
      productId: input.productId,
      targetPrice: input.targetPrice,
      alertId: `PRICE-ALERT-${Date.now()}`,
      message: "You will be notified if the price drops to your target price",
    };
  },
  {
    name: "set_price_drop_alert",
    description: "Set up an alert to be notified when a product's price drops to a target price.",
    schema: z.object({
      productId: z.string().describe("The product ID"),
      targetPrice: z.number().describe("The target price to be notified at"),
      userId: z.string().optional().describe("The user ID"),
    }),
  }
);

// Product bundles and deals
const getProductBundles = tool(
  async (input: { productId: string }) => {
    return {
      productId: input.productId,
      bundles: [
        { bundleId: "B1", products: ["laptop", "headphones"], discount: 15, totalPrice: 1354.98 },
        { bundleId: "B2", products: ["phone", "watch"], discount: 10, totalPrice: 1169.98 },
      ],
      count: 2,
    };
  },
  {
    name: "get_product_bundles",
    description: "Get available product bundles that include a specific product.",
    schema: z.object({
      productId: z.string().describe("The product ID to find bundles for"),
    }),
  }
);

// Tool to get daily deals
const getDailyDeals = tool(
  async () => {
    return {
      deals: [
        { productId: "laptop", discount: 15, originalPrice: 1299.99, salePrice: 1104.99 },
        { productId: "speaker", discount: 20, originalPrice: 179.99, salePrice: 143.99 },
      ],
      count: 2,
      validUntil: "2024-12-31",
    };
  },
  {
    name: "get_daily_deals",
    description: "Get today's special deals and promotions.",
    schema: z.object({}),
  }
);

// Categories and filters
const getAllCategories = tool(
  async () => {
    const categories = Array.from(new Set(Object.values(PRODUCTS).map(p => p.category)));
    return {
      categories: categories.map(cat => ({
        name: cat,
        productCount: Object.values(PRODUCTS).filter(p => p.category === cat).length,
      })),
      count: categories.length,
    };
  },
  {
    name: "get_all_categories",
    description: "Get all available product categories.",
    schema: z.object({}),
  }
);

// Tool to get products by rating
const getProductsByRating = tool(
  async (input: { minRating: number }) => {
    const results = Object.entries(PRODUCTS)
      .filter(([, product]) => product.rating >= input.minRating)
      .map(([key, product]) => ({ id: key, ...product }));
    return { minRating: input.minRating, results, count: results.length };
  },
  {
    name: "get_products_by_rating",
    description: "Get products filtered by minimum rating.",
    schema: z.object({
      minRating: z.number().describe("Minimum rating (0-5)"),
    }),
  }
);

// Shipping and delivery
const getShippingOptions = tool(
  async (input: { productId: string; destination: string }) => {
    return {
      productId: input.productId,
      destination: input.destination,
      options: [
        { type: "standard", cost: 10.99, days: "5-7" },
        { type: "express", cost: 24.99, days: "2-3" },
        { type: "overnight", cost: 49.99, days: "1" },
      ],
    };
  },
  {
    name: "get_shipping_options",
    description: "Get all available shipping options and costs for a product to a destination.",
    schema: z.object({
      productId: z.string().describe("The product ID"),
      destination: z.string().describe("The destination address or zip code"),
    }),
  }
);

// Tool to check delivery date
const checkDeliveryDate = tool(
  async (input: { productId: string; destination: string; shippingType?: string }) => {
    const product = PRODUCTS[input.productId as keyof typeof PRODUCTS];
    if (!product) {
      return { error: `Product not found: ${input.productId}` };
    }
    const days = input.shippingType === "express" ? 3 : input.shippingType === "overnight" ? 1 : 7;
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + days);
    return {
      productId: input.productId,
      destination: input.destination,
      shippingType: input.shippingType || "standard",
      estimatedDeliveryDate: deliveryDate.toISOString().split('T')[0],
      daysUntilDelivery: days,
    };
  },
  {
    name: "check_delivery_date",
    description: "Check the estimated delivery date for a product to a specific destination.",
    schema: z.object({
      productId: z.string().describe("The product ID"),
      destination: z.string().describe("The destination address or zip code"),
      shippingType: z.string().optional().describe("The shipping type (standard, express, overnight)"),
    }),
  }
);

// Return policy
const getReturnPolicy = tool(
  async (input: { productId: string }) => {
    return {
      productId: input.productId,
      returnWindow: "30 days",
      returnConditions: "Product must be unused and in original packaging",
      returnCost: "Free",
      refundMethod: "Original payment method",
    };
  },
  {
    name: "get_return_policy",
    description: "Get the return policy information for a product.",
    schema: z.object({
      productId: z.string().describe("The product ID to get return policy for"),
    }),
  }
);

const tools = [
  searchProducts,
  searchProductsByCategory,
  searchProductsByBrand,
  searchProductsByPriceRange,
  getProductDetails,
  getProductSpecifications,
  checkInventory,
  checkProductAvailability,
  compareProducts,
  getProductRecommendations,
  getRelatedProducts,
  getProductReviews,
  checkProductDiscounts,
  getProductPriceHistory,
  calculateShipping,
  getShippingOptions,
  checkDeliveryDate,
  createOrder,
  getOrderStatus,
  addToCart,
  getCartContents,
  addToWishlist,
  getWishlist,
  getUserProfile,
  getUserOrderHistory,
  getProductQuestions,
  askProductQuestion,
  setProductAvailabilityAlert,
  setPriceDropAlert,
  getProductBundles,
  getDailyDeals,
  getAllCategories,
  getProductsByRating,
  getReturnPolicy,
];

/**
 * Custom middleware to emit tool selection events
 * This middleware must be placed AFTER llmToolSelectorMiddleware to capture the selection results
 */
function toolSelectionEmitterMiddleware() {
  let selectedTools: string[] = [];

  return createMiddleware({
    name: "ToolSelectionEmitter",
    async wrapModelCall(request, handler) {
      // Store original tools before any filtering
      const toolsBefore = [...request.tools] || [];
      selectedTools = toolsBefore
        .filter((tool): tool is { name: string; description?: string } =>
          typeof tool === "object" && tool !== null && "name" in tool && typeof tool.name === "string"
        )
        .map((tool) => tool.name);

      // Call the handler (this will process through llmToolSelectorMiddleware first)
      return handler(request);
    },
    afterModel (state, runtime) {
      /**
       * don't emit tool selection if:
       */
      if (
        /**
         * we don't have a writer (should never happen)
         */
        !runtime.writer ||
        /**
         * we didn't select any tools
         */
        selectedTools.length === 0 ||
        /**
         * we are about to end the turn
         */
        state.messages.at(-1)?.additional_kwargs.stop_reason === "end_turn"
      ) {
        selectedTools = [];
        return
      }

      runtime.writer({
        event: "tool_selection",
        data: {
          availableTools: tools.map((tool) => tool.name),
          selectedTools,
        },
      });
      selectedTools = [];
    }
  });
}

/**
 * LLM Tool Selector Agent - demonstrates intelligent tool selection
 *
 * Scenario: E-commerce assistant with many tools available. The llmToolSelectorMiddleware
 * intelligently filters tools down to only the most relevant ones for each query, reducing
 * token usage and helping the model focus on the right tools.
 *
 * This demonstrates:
 * - Intelligent tool selection using LLM
 * - Reduced token usage by filtering irrelevant tools
 * - Better model performance by focusing on relevant tools
 * - Real-time visibility into tool selection decisions
 */
export async function llmToolSelectorAgent(options: {
  message: string;
  apiKey: string;
  threadId?: string;
}) {
  // Create the Anthropic model instance with user-provided API key
  const model = new ChatAnthropic({
    model: "claude-sonnet-4-5-20250929",
    apiKey: options.apiKey,
  });

  // Create agent with LLM Tool Selector middleware
  // Limit to 3 tools per request to demonstrate selection
  const agent = createAgent({
    model,
    tools,
    middleware: [
      llmToolSelectorMiddleware({
        maxTools: 5, // Allow up to 5 tools to enable comprehensive responses
        systemPrompt: "Select the most relevant tools for answering the user's query comprehensively. Include tools for searching, getting details, checking availability, reviews, pricing, shipping, and recommendations when relevant. Be thorough in tool selection.",
      }),
      toolSelectionEmitterMiddleware(), // Emit tool selection events
    ],
    checkpointer,
    systemPrompt: `You are a comprehensive e-commerce assistant with access to many tools.`,
  });

  const stream = await agent.stream({
    messages: [new HumanMessage(options.message)],
  }, {
    encoding: "text/event-stream",
    streamMode: ["values", "updates", "messages", "custom"],
    recursionLimit: 50,
    configurable: { thread_id: options.threadId },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

