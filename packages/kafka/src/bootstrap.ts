import { Kafka } from "kafkajs";
import { ensureTopic, parseBrokers } from "./topic.js";

export type KafkaTopicParams = {
  topic: string;
  numPartitions: number;
  replicationFactor: number;
};

export type KafkaBootstrapConfig = {
  clientId: string;
  /** Comma-separated broker list (`KAFKA_BROKERS`). */
  brokers: string;
} & KafkaTopicParams;

/**
 * Connects admin, ensures the topic exists, then disconnects admin.
 * Uses `finally` so admin disconnect runs even if `ensureTopic` throws.
 */
export async function ensureKafkaTopicExists(
  kafka: Kafka,
  params: KafkaTopicParams,
): Promise<void> {
  const admin = kafka.admin();
  await admin.connect();
  try {
    await ensureTopic(admin, params);
  } finally {
    await admin.disconnect();
  }
}

/** Constructs a `Kafka` client and ensures the topic exists (admin connect → create if missing → disconnect) before returning it. */
export async function createKafkaWithEnsuredTopic(
  config: KafkaBootstrapConfig,
): Promise<Kafka> {
  const kafka = new Kafka({
    clientId: config.clientId,
    brokers: parseBrokers(config.brokers),
  });
  await ensureKafkaTopicExists(kafka, {
    topic: config.topic,
    numPartitions: config.numPartitions,
    replicationFactor: config.replicationFactor,
  });
  return kafka;
}
