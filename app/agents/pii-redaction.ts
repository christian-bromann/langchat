import { z } from "zod";
import {
  createAgent,
  HumanMessage,
  tool,
  piiRedactionMiddleware,
} from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";

import { checkpointer } from "@/app/utils";

interface Customer {
  name: string;
  email: string;
  phone: string;
  ssn: string;
  accountStatus: string;
  balance: number;
  lastPaymentDate?: string;
}

// Mock customer database
const customerDatabase: Record<string, Customer> = {
  "123-45-6789": {
    name: "Sarah Johnson",
    email: "sarah.johnson@email.com",
    phone: "555-123-4567",
    ssn: "123-45-6789",
    accountStatus: "active",
    balance: 1250.50,
    lastPaymentDate: "2024-01-15",
  },
  "987-65-4321": {
    name: "Michael Chen",
    email: "michael.chen@email.com",
    phone: "555-987-6543",
    ssn: "987-65-4321",
    accountStatus: "active",
    balance: 850.00,
    lastPaymentDate: "2024-01-20",
  },
  "456-78-9012": {
    name: "Emily Rodriguez",
    email: "emily.rodriguez@email.com",
    phone: "555-456-7890",
    ssn: "456-78-9012",
    accountStatus: "past_due",
    balance: 2100.75,
    lastPaymentDate: "2023-12-10",
  },
};

// Define PII detection rules
const PII_RULES = {
  ssn: /\b\d{3}-?\d{2}-?\d{4}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  creditCard: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
};

// Tool to look up customer by SSN
const lookupCustomerBySSNTool = tool(
  async (input: { ssn: string }) => {
    // This tool receives the original SSN value (restored from redaction)
    const customer = customerDatabase[input.ssn];
    if (!customer) {
      return {
        found: false,
        error: "Customer not found with the provided SSN",
      };
    }
    return {
      found: true,
      name: customer.name,
      accountStatus: customer.accountStatus,
      balance: customer.balance,
      lastPaymentDate: customer.lastPaymentDate,
    };
  },
  {
    name: "lookup_customer_by_ssn",
    description:
      "Look up customer account information by Social Security Number (SSN). Use this when a customer provides their SSN to check their account status, balance, or payment history.",
    schema: z.object({
      ssn: z.string().describe("The customer's Social Security Number in format XXX-XX-XXXX"),
    }),
  }
);

// Tool to look up customer by email
const lookupCustomerByEmailTool = tool(
  async (input: { email: string }) => {
    // This tool receives the original email value (restored from redaction)
    const customer = Object.values(customerDatabase).find((c) => c.email.toLowerCase() === input.email.toLowerCase());
    if (!customer) {
      return {
        found: false,
        error: "Customer not found with the provided email address",
      };
    }
    return {
      found: true,
      name: customer.name,
      accountStatus: customer.accountStatus,
      balance: customer.balance,
      lastPaymentDate: customer.lastPaymentDate,
    };
  },
  {
    name: "lookup_customer_by_email",
    description:
      "Look up customer account information by email address. Use this when a customer provides their email to check their account status, balance, or payment history.",
    schema: z.object({
      email: z.string().email().describe("The customer's email address"),
    }),
  }
);

// Tool to look up customer by phone
const lookupCustomerByPhoneTool = tool(
  async (input: { phone: string }) => {
    // This tool receives the original phone value (restored from redaction)
    const normalizedPhone = input.phone.replace(/[^\d-]/g, "");
    const customer = Object.values(customerDatabase).find((c) => c.phone.replace(/[^\d-]/g, "") === normalizedPhone);
    if (!customer) {
      return {
        found: false,
        error: "Customer not found with the provided phone number",
      };
    }
    return {
      found: true,
      name: customer.name,
      accountStatus: customer.accountStatus,
      balance: customer.balance,
      lastPaymentDate: customer.lastPaymentDate,
    };
  },
  {
    name: "lookup_customer_by_phone",
    description:
      "Look up customer account information by phone number. Use this when a customer provides their phone number to check their account status, balance, or payment history.",
    schema: z.object({
      phone: z.string().describe("The customer's phone number in format XXX-XXX-XXXX"),
    }),
  }
);

// Tool to process payment
const processPaymentTool = tool(
  async (input: { ssn: string; creditCard: string; amount: number }) => {
    // This tool receives the original SSN and credit card values (restored from redaction)
    const customer = customerDatabase[input.ssn];
    if (!customer) {
      return {
        success: false,
        error: "Customer not found",
      };
    }

    // Simulate payment processing
    if (input.amount <= 0) {
      return {
        success: false,
        error: "Payment amount must be greater than zero",
      };
    }

    if (input.amount > customer.balance) {
      return {
        success: false,
        error: `Payment amount ($${input.amount}) exceeds account balance ($${customer.balance})`,
      };
    }

    // Update balance
    customerDatabase[input.ssn].balance -= input.amount;
    customerDatabase[input.ssn].lastPaymentDate = new Date().toISOString().split("T")[0];

    return {
      success: true,
      newBalance: customerDatabase[input.ssn].balance,
      paymentDate: customerDatabase[input.ssn].lastPaymentDate,
      message: `Payment of $${input.amount} processed successfully`,
    };
  },
  {
    name: "process_payment",
    description:
      "Process a payment for a customer account. Requires the customer's SSN, credit card number, and payment amount. Use this when a customer wants to make a payment on their account.",
    schema: z.object({
      ssn: z.string().describe("The customer's Social Security Number"),
      creditCard: z.string().describe("The customer's credit card number"),
      amount: z.number().describe("The payment amount in dollars"),
    }),
  }
);

export async function piiRedactionAgent(options: {
  message: string;
  apiKey: string;
  threadId?: string;
  model?: string;
}) {
  const modelName = options.model ?? "claude-sonnet-4-5";

  // Create the Anthropic model instance
  const model = new ChatAnthropic({
    model: modelName,
    apiKey: options.apiKey,
  });

  // Create agent with PII Redaction Middleware
  const agent = createAgent({
    model,
    tools: [
      lookupCustomerBySSNTool,
      lookupCustomerByEmailTool,
      lookupCustomerByPhoneTool,
      processPaymentTool,
    ],
    middleware: [
      piiRedactionMiddleware({
        rules: PII_RULES,
      }),
    ],
    checkpointer,
    systemPrompt:
      "You are a helpful customer support agent for a financial services company. " +
      "You help customers check their account information, make payments, and answer questions about their accounts. " +
      "Always be professional, courteous, and helpful. " +
      "When customers provide sensitive information like SSNs, emails, phone numbers, or credit card numbers, " +
      "use the appropriate lookup tools to find their account information. " +
      "Remember that sensitive information is automatically protected - you'll see redacted versions in the conversation, " +
      "but the tools will receive the original values to process requests correctly.",
  });

  // Stream with thread ID for state persistence
  const stream = await agent.stream({
    messages: [new HumanMessage(options.message)],
  }, {
    encoding: "text/event-stream",
    configurable: { thread_id: options.threadId },
    streamMode: ["values", "updates", "messages"],
    recursionLimit: 50,
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

