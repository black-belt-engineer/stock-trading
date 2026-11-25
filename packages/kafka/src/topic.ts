import type { Admin } from "kafkajs";

/** Comma-separated broker list from `KAFKA_BROKERS`. */
export function parseBrokers(raw: string): string[] {
  return raw
    .split(",")
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

export async function ensureTopic(
  admin: Admin,
  params: {
    topic: string;
    numPartitions: number;
    replicationFactor: number;
    /** Topic settings used when the topic is created, e.g. `retention.ms`. An existing topic is left as it is. */
    configEntries?: ReadonlyArray<{ name: string; value: string }>;
  },
): Promise<void> {
  const topics = await admin.listTopics();
  if (topics.includes(params.topic)) {
    return;
  }
  await admin.createTopics({
    topics: [
      {
        topic: params.topic,
        numPartitions: params.numPartitions,
        replicationFactor: params.replicationFactor,
        configEntries: params.configEntries ? [...params.configEntries] : [],
      },
    ],
    waitForLeaders: true,
  });
}
