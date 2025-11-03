import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";

let checkpointer: RedisSaver | null = null;

/**
 * Get checkpointer instance using Redis as the storage backend.
 * This is a singleton instance that can be used across the application.
 * @returns Checkpointer instance
 */
export async function getCheckpointer() {
  if (!checkpointer) {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      throw new Error("REDIS_URL is not set as an environment variable");
    }

    checkpointer = await RedisSaver.fromUrl(redisUrl, {
      defaultTTL: 60, // TTL in minutes
      refreshOnRead: true,
    });
  }
  return checkpointer;
}
