import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error("REDIS_URL is not set as an environment variable");
}

export const checkpointer = await RedisSaver.fromUrl(redisUrl, {
  defaultTTL: 60, // TTL in minutes
  refreshOnRead: true,
});
