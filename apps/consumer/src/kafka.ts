import { createKafkaWithEnsuredTopic, type Consumer } from "@stock-platform/kafka";
import type { AppEnv } from "./types.js";
import { log } from "./utils.js";

export type KafkaConsumerContext = {
  consumer: Consumer;
};

export async function setupKafkaConsumer(config: AppEnv): Promise<KafkaConsumerContext> {
  const kafka = await createKafkaWithEnsuredTopic({
    clientId: config.KAFKA_CLIENT_ID,
    brokers: config.KAFKA_BROKERS,
    topic: config.KAFKA_TOPIC,
    numPartitions: config.KAFKA_TOPIC_PARTITIONS,
    replicationFactor: config.KAFKA_REPLICATION_FACTOR,
  });

  const consumer = kafka.consumer({ groupId: config.KAFKA_GROUP_ID });
  await consumer.connect();

  log.info(
    { topic: config.KAFKA_TOPIC, groupId: config.KAFKA_GROUP_ID },
    "Kafka consumer connected",
  );

  return { consumer };
}
