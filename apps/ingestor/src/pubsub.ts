import { PubSub, type Topic } from "@google-cloud/pubsub";
import type { PriceEvent } from "@stock-platform/types";
import type { AppEnv } from "./types.js";
import { log } from "./utils.js";

export type PubSubContext = {
  pubsub: PubSub;
  topic: Topic;
};

export async function setupPubSub(config: AppEnv): Promise<PubSubContext> {
  const { PUBSUB_PROJECT_ID, PUBSUB_TOPIC, PUBSUB_EMULATOR_HOST } = config;

  if (PUBSUB_EMULATOR_HOST) {
    log.info({ pubsubEmulatorHost: PUBSUB_EMULATOR_HOST }, "Using Pub/Sub emulator");
  }

  const pubsub = new PubSub({ projectId: PUBSUB_PROJECT_ID });
  const topic = pubsub.topic(PUBSUB_TOPIC);
  const [topicExists] = await topic.exists();

  if (!topicExists) {
    await topic.create();
    log.info({ topic: PUBSUB_TOPIC }, "Created Pub/Sub topic");
  }

  return { pubsub, topic };
}

export async function publishPriceEvent(
  topic: Topic,
  event: PriceEvent,
): Promise<string> {
  return topic.publishMessage({ json: event });
}
