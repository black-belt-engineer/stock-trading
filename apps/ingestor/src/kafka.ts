import type { PriceEvent } from "@stock-platform/types";
import { Kafka, parseBrokers, ensureTopic, type Producer } from "@stock-platform/kafka";
import type { AppEnv } from "./types.js";
import { log } from "./utils.js";

export async function setupKafkaProducer(config: AppEnv): Promise<{ producer: Producer }> {
  const kafka = new Kafka({
    clientId: config.KAFKA_CLIENT_ID,
    brokers: parseBrokers(config.KAFKA_BROKERS),
  });

  const admin = kafka.admin();
  await admin.connect();
  await ensureTopic(admin, {
    topic: config.KAFKA_TOPIC,
    numPartitions: config.KAFKA_TOPIC_PARTITIONS,
    replicationFactor: config.KAFKA_REPLICATION_FACTOR,
  });
  await admin.disconnect();

  const producer = kafka.producer();
  await producer.connect();

  log.info(
    { topic: config.KAFKA_TOPIC, brokers: config.KAFKA_BROKERS },
    "Kafka producer connected",
  );

  return { producer };
}

export async function publishPriceEvent(
  producer: Producer,
  topic: string,
  event: PriceEvent,
): Promise<void> {
  await producer.send({
    topic,
    messages: [
      {
        key: event.symbol,
        value: JSON.stringify(event),
      },
    ],
  });
}
