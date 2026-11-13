import { createKafkaWithEnsuredTopic, type Consumer } from "@stock-platform/kafka";
import {
  parseJson,
  priceEventMessageKey,
  PriceEventSchema,
  type PriceEvent,
} from "@stock-platform/types";
import type { Logger } from "@stock-platform/logger";
import type { AppConfig } from "../config/index.js";
import type { ConsumedMessage } from "../models/consumed-message.js";

export type MessageHandler = (event: PriceEvent, message: ConsumedMessage) => Promise<void>;

export class KafkaConsumerService {
  private consumer: Consumer | undefined;

  constructor(
    private readonly config: AppConfig,
    private readonly log: Logger,
  ) {}

  async connect(): Promise<Consumer> {
    const kafka = await createKafkaWithEnsuredTopic({
      clientId: this.config.KAFKA_CLIENT_ID,
      brokers: this.config.KAFKA_BROKERS,
      topic: this.config.KAFKA_TOPIC,
      numPartitions: this.config.KAFKA_TOPIC_PARTITIONS,
      replicationFactor: this.config.KAFKA_REPLICATION_FACTOR,
    });

    const consumer = kafka.consumer({ groupId: this.config.KAFKA_GROUP_ID });
    await consumer.connect();
    this.consumer = consumer;

    consumer.on("consumer.crash", (ev) => {
      this.log.error({ ev }, "Kafka consumer crashed");
    });

    this.log.info(
      { topic: this.config.KAFKA_TOPIC, groupId: this.config.KAFKA_GROUP_ID },
      "Kafka consumer connected",
    );

    return consumer;
  }

  async subscribeAndRun(consumer: Consumer, onMessage: MessageHandler): Promise<void> {
    await consumer.subscribe({ topic: this.config.KAFKA_TOPIC, fromBeginning: false });

    await consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }) => {
        if (!message.value) {
          throw new Error(`Empty message at ${topic}:${partition}:${message.offset}`);
        }

        const idempotencyKey = message.key?.toString();
        if (!idempotencyKey) {
          throw new Error(`Missing message key at ${topic}:${partition}:${message.offset}`);
        }

        const event = parseJson(PriceEventSchema, message.value.toString());
        if (!event) {
          this.log.error({ topic, partition, offset: message.offset }, "Failed to parse");
          throw new Error(`Malformed price event at ${topic}:${partition}:${message.offset}`);
        }

        const expectedKey = priceEventMessageKey(event);
        if (idempotencyKey !== expectedKey) {
          throw new Error(
            `Message key "${idempotencyKey}" does not match payload key "${expectedKey}"`,
          );
        }

        await onMessage(event, { idempotencyKey });

        await consumer.commitOffsets([
          {
            topic,
            partition,
            offset: (BigInt(message.offset) + 1n).toString(),
          },
        ]);
      },
    });
  }

  async disconnect(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect();
    }
  }
}
