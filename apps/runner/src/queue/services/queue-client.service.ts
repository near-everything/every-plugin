import { Queue, type ConnectionOptions, type JobsOptions } from 'bullmq';
import { Context, Effect, Layer, Redacted } from 'effect';
import { AppConfig } from '../../config';

export interface QueueClientOptions {
  readonly defaultJobOptions?: JobsOptions;
}

export interface QueueClient {
  readonly connection: ConnectionOptions;
  readonly createQueue: (name: string, options?: QueueClientOptions) => Queue;
}

export const QueueClient = Context.GenericTag<QueueClient>("QueueClient");

export const QueueClientLive = Layer.effect(
  QueueClient,
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const redisUrl = Redacted.value(config.redisUrl);

    // Parse Redis URL for BullMQ connection
    const url = new URL(redisUrl);
    const connection: ConnectionOptions = {
      host: url.hostname,
      port: parseInt(url.port) || 6379,
      password: url.password || undefined,
      username: url.username || undefined,
      db: url.pathname ? parseInt(url.pathname.slice(1)) || 0 : 0,
    };

    const createQueue = (name: string, options?: QueueClientOptions): Queue => {
      return new Queue(name, {
        connection,
        ...options,
      });
    };

    return {
      connection,
      createQueue,
    };
  })
);
