import { createKafkaWithEnsuredTopic, type Consumer } from "@stock-platform/kafka";
import type { PriceEvent } from "@stock-platform/types";
import type { Logger } from "@stock-platform/logger";
import type { AppConfig } from "../config/index.js";

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

  async subscribeAndRun(
    consumer: Consumer,
    onMessage: (event: PriceEvent) => Promise<void>,
  ): Promise<void> {
    await consumer.subscribe({ topic: this.config.KAFKA_TOPIC, fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) {
          return;
        }

        let event: PriceEvent;
        try {
          event = JSON.parse(message.value.toString()) as PriceEvent;
        } catch (err) {
          this.log.error({ err }, "Failed to parse Kafka message");
          return;
        }

        await onMessage(event);
      },
    });
  }

  async disconnect(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect();
    }
  }
}
