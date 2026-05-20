import { createKafkaWithEnsuredTopic, type Producer } from "@stock-platform/kafka";
import type { PriceEvent } from "@stock-platform/types";
import type { Logger } from "@stock-platform/logger";
import type { AppConfig } from "../config/index.js";

export class KafkaProducerService {
  private producer: Producer | undefined;

  constructor(
    private readonly config: AppConfig,
    private readonly log: Logger,
  ) {}

  async connect(): Promise<Producer> {
    const kafka = await createKafkaWithEnsuredTopic({
      clientId: this.config.KAFKA_CLIENT_ID,
      brokers: this.config.KAFKA_BROKERS,
      topic: this.config.KAFKA_TOPIC,
      numPartitions: this.config.KAFKA_TOPIC_PARTITIONS,
      replicationFactor: this.config.KAFKA_REPLICATION_FACTOR,
    });

    const producer = kafka.producer();
    await producer.connect();
    this.producer = producer;

    this.log.info(
      { topic: this.config.KAFKA_TOPIC, brokers: this.config.KAFKA_BROKERS },
      "Kafka producer connected",
    );

    return producer;
  }

  async publish(event: PriceEvent): Promise<void> {
    const producer = this.producer;
    if (!producer) {
      throw new Error("Kafka producer not connected");
    }
    await producer.send({
      topic: this.config.KAFKA_TOPIC,
      messages: [{ key: event.symbol, value: JSON.stringify(event) }],
    });
  }

  async disconnect(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
    }
  }
}
