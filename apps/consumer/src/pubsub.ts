import { PubSub, type Subscription } from "@google-cloud/pubsub";
import type { AppEnv } from "./types.js";
import { log } from "./utils.js";

export type PubSubContext = {
  pubsub: PubSub;
  subscription: Subscription;
};

export async function setupPubSub(config: AppEnv): Promise<PubSubContext> {
  const {
    PUBSUB_PROJECT_ID,
    PUBSUB_TOPIC,
    PUBSUB_SUBSCRIPTION,
    PUBSUB_EMULATOR_HOST,
  } = config;

  if (PUBSUB_EMULATOR_HOST) {
    log.info({ pubsubEmulatorHost: PUBSUB_EMULATOR_HOST }, "Using Pub/Sub emulator");
  }

  const pubsub = new PubSub({ projectId: PUBSUB_PROJECT_ID });
  const subscription = pubsub.subscription(PUBSUB_SUBSCRIPTION);
  const [subscriptionExists] = await subscription.exists();

  if (!subscriptionExists) {
    const topicName = PUBSUB_TOPIC ?? "stock-prices";
    const topic = pubsub.topic(topicName);
    const [topicExists] = await topic.exists();

    if (!topicExists) {
      await topic.create();
      log.info({ topic: topicName }, "Created Pub/Sub topic");
    }

    await topic.createSubscription(PUBSUB_SUBSCRIPTION);
    log.info({ subscription: PUBSUB_SUBSCRIPTION }, "Created Pub/Sub subscription");
  }

  return { pubsub, subscription };
}
