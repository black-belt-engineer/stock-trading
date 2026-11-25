import { createKafkaWithEnsuredTopic, type Consumer } from "@stock-platform/kafka";
import type { Logger } from "@stock-platform/logger";
import { parseIdentityEvent } from "../models/identity-event.js";

export type IdentityEventsOptions = {
  brokers: string;
  topic: string;
  groupId: string;
  /** Deletes every row of the user; must be idempotent (a replayed event changes nothing). */
  deleteUser: (userId: string) => Promise<number>;
  log: Logger;
};

/** Kept longer than the service could plausibly be down (K6 edge case), unlike `stock-prices`. */
const RETENTION_MS = String(7 * 24 * 60 * 60 * 1000);
const RETRY_MS = 30_000;

/**
 * Consumes `identity.events` (K6) as the group `portfolio-identity`: on `user.deleted` it deletes
 * the user's rows, then commits the offset. Messages it does not understand are logged and
 * skipped, so one bad message cannot stop the consumer.
 *
 * Runs in the background: the HTTP API starts even with the broker down, and the consumer keeps
 * trying to connect, also after a crash kafkajs does not recover from itself. Producers must not
 * compress with Snappy, LZ4 or ZSTD: kafkajs only has gzip built in (Keycloak's listener sends
 * uncompressed). A new group starts at the beginning of the topic, so deletions published
 * before the service first ran are not missed.
 */
export class IdentityEventsService {
  private consumer: Consumer | undefined;
  private retry: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(private readonly options: IdentityEventsOptions) {}

  start(): void {
    void this.connect();
  }

  private async connect(): Promise<void> {
    const { brokers, topic, groupId, log } = this.options;
    try {
      const kafka = await createKafkaWithEnsuredTopic({
        clientId: "portfolio",
        brokers,
        topic,
        numPartitions: 3,
        replicationFactor: 1,
        configEntries: [{ name: "retention.ms", value: RETENTION_MS }],
      });
      if (this.stopped) return;
      const consumer = kafka.consumer({ groupId });
      this.consumer = consumer;
      consumer.on("consumer.crash", (event) => {
        log.error({ err: event.payload.error, restart: event.payload.restart }, "identity.events consumer crashed");
        // kafkajs restarts itself after a retriable error only. After any other (for example a
        // message compressed with a codec it lacks, such as Snappy) it stops for good; start
        // again after a pause instead of going quiet. The bad message is retried, so the error
        // repeats in the log until someone looks.
        if (!event.payload.restart) void this.reconnectLater(consumer);
      });
      await consumer.connect();
      await consumer.subscribe({ topic, fromBeginning: true });
      await consumer.run({
        autoCommit: false,
        eachMessage: async ({ partition, message }) => {
          const raw = message.value?.toString() ?? "";
          const event = parseIdentityEvent(raw);
          if (event === null) {
            log.warn({ topic, partition, offset: message.offset }, "Skipped an identity event that is not a user.deleted");
          } else {
            // A failure here throws: the offset is not committed and kafkajs retries the message.
            const removed = await this.options.deleteUser(event.userId);
            log.info({ userId: event.userId, source: event.source, removed }, "Deleted the data of a deleted user");
          }
          await consumer.commitOffsets([{ topic, partition, offset: (BigInt(message.offset) + 1n).toString() }]);
        },
      });
      log.info({ topic, groupId }, "Consuming identity events");
    } catch (err) {
      log.error({ err }, `Could not start the identity.events consumer; retrying in ${RETRY_MS / 1000} s`);
      await this.reconnectLater(this.consumer);
    }
  }

  private async reconnectLater(consumer: Consumer | undefined): Promise<void> {
    if (consumer !== this.consumer) return;
    await consumer?.disconnect().catch(() => undefined);
    this.consumer = undefined;
    if (this.stopped) return;
    clearTimeout(this.retry);
    this.retry = setTimeout(() => void this.connect(), RETRY_MS);
    this.retry.unref();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.retry);
    await this.consumer?.disconnect();
  }
}
