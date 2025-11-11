import { z } from "zod";
import { createAgent, HumanMessage, tool, contextEditingMiddleware, ClearToolUsesEdit } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";

import { checkpointer } from "@/app/utils";

// Simulated academic papers database with detailed abstracts
const ACADEMIC_PAPERS = [
  {
    id: "PAPER001",
    title: "Large Language Models and Their Applications in Natural Language Processing",
    authors: ["Dr. Jane Smith", "Dr. John Doe"],
    year: 2024,
    abstract: `This comprehensive paper explores the evolution and applications of large language models (LLMs) in natural language processing. We examine the architectural foundations of transformer-based models, including attention mechanisms, positional encoding, and multi-head attention. The paper discusses various training methodologies, including pre-training on large corpora, fine-tuning techniques, and reinforcement learning from human feedback (RLHF). We analyze performance metrics across multiple benchmarks including GLUE, SuperGLUE, and HELM. The paper also covers practical applications in machine translation, text summarization, question answering, and code generation. We discuss challenges such as hallucination, bias, and computational requirements. Finally, we explore future directions including multimodal models, efficient training methods, and ethical considerations. The research demonstrates significant improvements in downstream tasks when using LLMs compared to traditional approaches.`,
    citations: 1250,
    keywords: ["LLM", "NLP", "Transformer", "Deep Learning"],
  },
  {
    id: "PAPER002",
    title: "Context Window Management in Long-Context Language Models",
    authors: ["Dr. Alice Johnson", "Dr. Bob Wilson"],
    year: 2024,
    abstract: `Managing context windows in long-context language models presents unique challenges and opportunities. This paper introduces novel techniques for context editing and compression that enable models to maintain performance while reducing computational overhead. We propose several strategies including hierarchical attention, sliding window mechanisms, and selective context pruning. Our experiments show that intelligent context management can reduce token usage by up to 60% while maintaining 95% of original performance. We evaluate our methods across multiple domains including legal document analysis, scientific literature review, and conversational AI. The paper discusses trade-offs between context size, model performance, and computational efficiency. We also explore the impact of different editing strategies on model behavior and user experience. Our findings suggest that context editing middleware can significantly improve the scalability of long-context applications.`,
    citations: 890,
    keywords: ["Context Management", "Long Context", "Efficiency", "LLM"],
  },
  {
    id: "PAPER003",
    title: "Retrieval-Augmented Generation: Combining Search and Language Models",
    authors: ["Dr. Carol Brown", "Dr. David Lee"],
    year: 2023,
    abstract: `Retrieval-augmented generation (RAG) represents a paradigm shift in how language models access and utilize external knowledge. This paper presents a comprehensive survey of RAG architectures, including dense retrieval methods, sparse retrieval techniques, and hybrid approaches. We examine various embedding strategies, including dense embeddings from transformer models, sparse embeddings using BM25, and learned sparse representations. The paper discusses integration strategies for combining retrieved documents with language model inputs, including concatenation, attention-based fusion, and iterative retrieval. We evaluate RAG systems on knowledge-intensive tasks including open-domain question answering, fact-checking, and long-form generation. Our experiments demonstrate that RAG can significantly reduce hallucination rates while improving factual accuracy. We also explore challenges such as retrieval quality, latency, and scalability. The paper concludes with recommendations for practitioners and future research directions.`,
    citations: 2100,
    keywords: ["RAG", "Retrieval", "Knowledge", "LLM"],
  },
  {
    id: "PAPER004",
    title: "Multi-Agent Systems for Complex Problem Solving",
    authors: ["Dr. Emma Davis", "Dr. Frank Miller"],
    year: 2024,
    abstract: `Multi-agent systems have emerged as a powerful approach for solving complex problems that require coordination, specialization, and distributed decision-making. This paper presents a framework for designing and implementing multi-agent systems using language models. We explore various agent architectures including hierarchical structures, peer-to-peer networks, and market-based coordination mechanisms. The paper discusses communication protocols, task allocation strategies, and conflict resolution methods. We examine applications in software development, scientific research, and business process automation. Our experiments demonstrate that multi-agent systems can outperform single-agent approaches on complex tasks requiring diverse expertise. We analyze performance metrics including task completion rate, coordination overhead, and resource utilization. The paper also addresses challenges such as agent coordination, error propagation, and system reliability. We provide practical guidelines for designing effective multi-agent systems and discuss future research opportunities.`,
    citations: 1450,
    keywords: ["Multi-Agent", "Coordination", "Distributed Systems", "AI"],
  },
  {
    id: "PAPER005",
    title: "Efficient Fine-Tuning Strategies for Large Language Models",
    authors: ["Dr. Grace Taylor", "Dr. Henry White"],
    year: 2024,
    abstract: `Fine-tuning large language models efficiently is crucial for adapting them to specific domains and tasks. This paper compares various fine-tuning approaches including full fine-tuning, parameter-efficient fine-tuning (PEFT), and prompt-based methods. We examine techniques such as LoRA (Low-Rank Adaptation), AdaLoRA, and prefix tuning. The paper presents experimental results comparing these methods across multiple tasks and model sizes. We analyze trade-offs between parameter efficiency, training speed, and model performance. Our findings show that PEFT methods can achieve comparable performance to full fine-tuning while using only 1-5% of trainable parameters. We also explore domain adaptation strategies, few-shot learning approaches, and continual learning techniques. The paper discusses practical considerations including memory requirements, training time, and deployment complexity. We provide recommendations for selecting appropriate fine-tuning strategies based on task requirements and resource constraints.`,
    citations: 980,
    keywords: ["Fine-Tuning", "PEFT", "LoRA", "Efficiency"],
  },
];

// Detailed topic information database
const TOPIC_DATABASE: Record<string, string> = {
  "transformer architecture": `The Transformer architecture, introduced in "Attention Is All You Need" (Vaswani et al., 2017), revolutionized natural language processing. At its core, the Transformer uses self-attention mechanisms to process sequences in parallel, unlike recurrent architectures that process sequentially. The architecture consists of an encoder-decoder structure, though many modern models use encoder-only (BERT) or decoder-only (GPT) variants. Key components include multi-head attention, which allows the model to attend to different representation subspaces simultaneously; positional encoding, which injects information about token positions; and feed-forward networks that apply transformations to each position independently. Layer normalization and residual connections help with training stability and gradient flow. The attention mechanism computes relationships between all pairs of positions, allowing the model to capture long-range dependencies effectively. Modern variants include improvements like relative positional encoding, sparse attention patterns, and efficient attention mechanisms to reduce computational complexity.`,

  "context editing": `Context editing is a technique for managing conversation context in language models when it grows too large. As conversations extend, the total token count can exceed model limits or become computationally expensive. Context editing strategies intelligently prune or compress older parts of the conversation while preserving recent, relevant information. Common approaches include clearing older tool outputs, summarizing past exchanges, and selectively removing less important messages. The goal is to maintain conversation coherence and model performance while reducing token usage. This is particularly important in long-running conversations, multi-turn interactions, and applications with extensive tool usage. Effective context editing requires understanding which parts of the conversation are most relevant to current and future turns. Some strategies preserve recent tool results, system messages, and critical user instructions while clearing older intermediate results.`,

  "retrieval augmented generation": `Retrieval-Augmented Generation (RAG) combines the generative capabilities of language models with external knowledge retrieval. The process typically involves: (1) converting user queries into searchable representations, (2) retrieving relevant documents from a knowledge base using semantic or keyword search, (3) augmenting the model's context with retrieved information, and (4) generating responses grounded in the retrieved content. RAG systems can significantly improve factual accuracy and reduce hallucination by providing models with up-to-date, verifiable information. Key components include embedding models for semantic search, vector databases for efficient retrieval, and integration strategies for combining retrieved content with model inputs. RAG is particularly valuable for applications requiring domain-specific knowledge, real-time information, or access to private documents. Challenges include retrieval quality, latency optimization, and handling cases where relevant information isn't available.`,

  "multi-agent systems": `Multi-agent systems involve multiple autonomous agents working together to solve problems that are too complex for a single agent. In the context of language models, agents can specialize in different tasks, coordinate through communication protocols, and collaborate on complex workflows. Each agent may have specific capabilities, tools, or knowledge domains. Coordination mechanisms include hierarchical structures where agents report to supervisors, peer-to-peer networks where agents communicate directly, and market-based systems where agents bid on tasks. Multi-agent systems excel at tasks requiring diverse expertise, parallel processing, and distributed decision-making. They can handle complex workflows like software development, research synthesis, and business process automation. Key challenges include ensuring effective communication, managing conflicts, preventing error propagation, and coordinating agent actions. Modern implementations often use language models as agents, enabling natural language communication and flexible task allocation.`,

  "fine-tuning strategies": `Fine-tuning adapts pre-trained language models to specific tasks or domains. Full fine-tuning updates all model parameters but requires significant computational resources. Parameter-efficient fine-tuning (PEFT) methods update only a small subset of parameters. LoRA (Low-Rank Adaptation) introduces trainable low-rank matrices that approximate weight updates, reducing trainable parameters by 99%+. AdaLoRA adaptively allocates rank to different layers. Prefix tuning prepends trainable tokens to inputs. Prompt tuning learns soft prompts. These methods offer trade-offs between parameter efficiency, training speed, and performance. PEFT methods are particularly valuable when computational resources are limited, when fine-tuning multiple models for different tasks, or when maintaining the base model's general capabilities is important. Fine-tuning strategies must consider task complexity, available data, computational budget, and deployment requirements.`,
};

/**
 * Context Editing Middleware agent - demonstrates automatic context management
 *
 * Scenario: AI Research Assistant
 * This agent helps researchers explore academic topics by searching papers,
 * retrieving detailed information, and analyzing concepts. As the conversation
 * grows with many tool calls and large outputs, the context editing middleware
 * automatically clears older tool results to manage token usage.
 *
 * This demonstrates:
 * - Automatic context pruning when token limits are exceeded
 * - Preservation of recent tool results while clearing older ones
 * - Configurable clearing strategies (trigger tokens, keep count, exclusions)
 * - Real-world scenario where context grows through many tool calls
 * - Seamless operation as older context is automatically managed
 */
export async function contextEditingAgent(options: {
  message: string;
  apiKey: string;
  model?: string;
  threadId?: string;
}) {
  // Create the Anthropic model instance with user-provided API key
  const model = new ChatAnthropic({
    model: "claude-sonnet-4-5",
    apiKey: options.apiKey,
  });

  // Tool to search academic papers (returns large abstracts)
  const searchPapers = tool(
    async (input: { query: string; limit?: number }) => {
      const queryLower = input.query.toLowerCase();
      const limit = input.limit ?? 5;

      // Simple keyword matching (in real scenario, this would be semantic search)
      const matchingPapers = ACADEMIC_PAPERS.filter(paper =>
        paper.title.toLowerCase().includes(queryLower) ||
        paper.abstract.toLowerCase().includes(queryLower) ||
        paper.keywords.some(kw => kw.toLowerCase().includes(queryLower))
      ).slice(0, limit);

      if (matchingPapers.length === 0) {
        return {
          query: input.query,
          results: [],
          message: `No papers found matching "${input.query}". Try different keywords or broader terms.`,
        };
      }

      return {
        query: input.query,
        results: matchingPapers,
        count: matchingPapers.length,
        message: `Found ${matchingPapers.length} paper(s) matching "${input.query}"`,
      };
    },
    {
      name: "search_papers",
      description: "Search for academic papers by keywords, topics, or concepts. Returns detailed paper information including title, authors, abstract, citations, and keywords. Use this to find relevant research on specific topics.",
      schema: z.object({
        query: z.string().describe("Search query - can be keywords, topics, or concepts"),
        limit: z.number().optional().describe("Maximum number of results to return (default: 5)"),
      }),
    }
  );

  // Tool to get detailed information about a topic (returns long descriptions)
  const getTopicInfo = tool(
    async (input: { topic: string }) => {
      const topicLower = input.topic.toLowerCase();
      const matchingTopic = Object.keys(TOPIC_DATABASE).find(
        key => key.toLowerCase() === topicLower || topicLower.includes(key)
      );

      if (!matchingTopic) {
        return {
          topic: input.topic,
          information: `I don't have detailed information about "${input.topic}" in my knowledge base. Try searching for academic papers on this topic instead.`,
          available_topics: Object.keys(TOPIC_DATABASE),
        };
      }

      return {
        topic: matchingTopic,
        information: TOPIC_DATABASE[matchingTopic],
        message: `Retrieved detailed information about "${matchingTopic}"`,
      };
    },
    {
      name: "get_topic_info",
      description: "Get comprehensive, detailed information about a specific topic from the knowledge base. Returns extensive explanations covering key concepts, methodologies, and applications. Use this to get in-depth understanding of topics like 'transformer architecture', 'context editing', 'RAG', etc.",
      schema: z.object({
        topic: z.string().describe("Topic name to retrieve information about"),
      }),
    }
  );

  // Tool to compare concepts (returns detailed comparisons)
  const compareConcepts = tool(
    async (input: { concept1: string; concept2: string }) => {
      const info1 = TOPIC_DATABASE[input.concept1.toLowerCase()] || "Information not available";
      const info2 = TOPIC_DATABASE[input.concept2.toLowerCase()] || "Information not available";

      const comparison = {
        concept1: input.concept1,
        concept2: input.concept2,
        similarities: [] as string[],
        differences: [] as string[],
        use_cases: {} as Record<string, string>,
      };

      // Generate a detailed comparison
      if (info1 !== "Information not available" && info2 !== "Information not available") {
        comparison.similarities = [
          "Both are important techniques in modern NLP and AI systems",
          "Both aim to improve model performance and efficiency",
          "Both are actively researched areas with ongoing developments",
        ];
        comparison.differences = [
          `${input.concept1} focuses on model architecture and training, while ${input.concept2} focuses on inference and deployment`,
          `${input.concept1} requires significant computational resources during development, while ${input.concept2} optimizes runtime efficiency`,
          `${input.concept1} is typically applied during model creation, while ${input.concept2} is applied during model usage`,
        ];
        comparison.use_cases = {
          [input.concept1]: "Building new models, adapting to domains, improving base capabilities",
          [input.concept2]: "Deploying models efficiently, managing resources, scaling applications",
        };
      }

      return {
        ...comparison,
        message: `Comparison between ${input.concept1} and ${input.concept2}`,
        detailed_comparison: `This comparison analyzes ${input.concept1} and ${input.concept2} across multiple dimensions including technical approach, computational requirements, use cases, and practical applications. Both concepts represent important advances in the field, though they address different stages of the ML lifecycle.`,
      };
    },
    {
      name: "compare_concepts",
      description: "Compare two concepts or topics in detail. Returns comprehensive comparison including similarities, differences, use cases, and practical considerations. Use this to understand relationships between different techniques or approaches.",
      schema: z.object({
        concept1: z.string().describe("First concept to compare"),
        concept2: z.string().describe("Second concept to compare"),
      }),
    }
  );

  // Tool to analyze research trends (returns detailed analysis)
  const analyzeTrends = tool(
    async (input: { topic: string; years?: number }) => {
      const years = input.years ?? 3;
      const topicLower = input.topic.toLowerCase();

      const relevantPapers = ACADEMIC_PAPERS.filter(paper =>
        paper.title.toLowerCase().includes(topicLower) ||
        paper.abstract.toLowerCase().includes(topicLower) ||
        paper.keywords.some(kw => kw.toLowerCase().includes(topicLower))
      );

      const analysis = {
        topic: input.topic,
        period: `Last ${years} years`,
        total_papers: relevantPapers.length,
        average_citations: relevantPapers.length > 0
          ? Math.round(relevantPapers.reduce((sum, p) => sum + p.citations, 0) / relevantPapers.length)
          : 0,
        trend: relevantPapers.length >= 2 ? "increasing" : "emerging",
        key_findings: [
          `Research on ${input.topic} has been active with ${relevantPapers.length} recent papers`,
          `Average citation count of ${relevantPapers.length > 0 ? Math.round(relevantPapers.reduce((sum, p) => sum + p.citations, 0) / relevantPapers.length) : 0} indicates strong impact`,
          `Recent work focuses on practical applications and efficiency improvements`,
        ],
        recommendations: [
          `Continue monitoring developments in ${input.topic}`,
          `Consider integrating recent findings into your research`,
          `Explore connections with related topics for broader understanding`,
        ],
      };

      return {
        ...analysis,
        message: `Analysis of research trends for "${input.topic}"`,
        detailed_analysis: `This analysis examines the research landscape for ${input.topic} over the past ${years} years, identifying key trends, influential papers, and emerging directions. The field shows strong growth with increasing focus on practical applications and efficiency.`,
      };
    },
    {
      name: "analyze_trends",
      description: "Analyze research trends for a specific topic. Returns detailed analysis including paper counts, citation metrics, trends, key findings, and recommendations. Use this to understand the research landscape and identify important directions.",
      schema: z.object({
        topic: z.string().describe("Topic to analyze research trends for"),
        years: z.number().optional().describe("Number of years to look back (default: 3)"),
      }),
    }
  );

  // Create agent with Context Editing Middleware
  // Configured to trigger at 50K tokens (lower than default for demo purposes)
  // Keeps the 3 most recent tool results
  // Uses approximate token counting for faster performance
  const agent = createAgent({
    model,
    tools: [
      searchPapers,
      getTopicInfo,
      compareConcepts,
      analyzeTrends,
    ],
    checkpointer,
    middleware: [
      contextEditingMiddleware({
        edits: [
          new ClearToolUsesEdit({
            triggerTokens: 2000,      // Lower threshold for demo (default is 100K)
            keep: 3,                  // Keep 3 most recent tool results
            clearToolInputs: false,   // Keep tool call arguments for context
            excludeTools: [],         // No tools excluded from clearing
            placeholder: "[cleared]", // Placeholder for cleared results
          }),
        ],
        tokenCountMethod: "approx", // Use approximate counting for speed
      }),
    ],
    systemPrompt: `You are an AI research assistant that helps researchers explore academic topics, find relevant papers, and analyze concepts.

You have access to tools that allow you to:
- Search academic papers by keywords or topics (returns detailed abstracts)
- Get comprehensive information about specific topics
- Compare different concepts in detail
- Analyze research trends and patterns

As you help the user explore multiple topics and make many tool calls, the conversation context will grow. The context editing middleware will automatically manage this by clearing older tool results when needed, while preserving the most recent ones to maintain conversation flow.

Be thorough in your research, make multiple tool calls to gather comprehensive information, and provide detailed analyses. The system will automatically handle context management as the conversation grows.`,
  });

  // Initialize the conversation
  const initialState = {
    messages: [new HumanMessage(options.message)],
  };

  const stream = await agent.stream(initialState, {
    encoding: "text/event-stream",
    streamMode: ["values", "updates", "messages"],
    recursionLimit: 30,
    configurable: { thread_id: options.threadId },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

