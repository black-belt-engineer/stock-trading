import type { Logger } from "@stock-platform/logger";
import { createKafkaWithEnsuredTopic } from "@stock-platform/kafka";
import type { PriceEvent } from "@stock-platform/types";

export type KafkaFeedEnv = {
  brokers: string;
  topic: string;
  groupId: string;
  clientId: string;
  numPartitions: number;
  replicationFactor: number;
};

export async function startPriceTickKafkaConsumer(
  env: KafkaFeedEnv,
  log: Logger,
  onEvent: (event: PriceEvent) => void,
): Promise<{ disconnect: () => Promise<void> }> {
  const kafka = await createKafkaWithEnsuredTopic({
    clientId: env.clientId,
    brokers: env.brokers,
    topic: env.topic,
    numPartitions: env.numPartitions,
    replicationFactor: env.replicationFactor,
  });

  const consumer = kafka.consumer({ groupId: env.groupId });
  await consumer.connect();

  consumer.on("consumer.crash", (ev) => {
    log.error({ ev }, "Kafka consumer crashed");
  });

  await consumer.subscribe({ topic: env.topic, fromBeginning: false });

  void consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) {
        return;
      }
      try {
        const event = JSON.parse(message.value.toString()) as PriceEvent;
        onEvent(event);
      } catch (err) {
        log.error({ err }, "Failed to parse Kafka message");
      }
    },
  });

  log.info({ topic: env.topic, groupId: env.groupId }, "Dashboard Kafka consumer running");

  return {
    disconnect: () => consumer.disconnect(),
  };
}
