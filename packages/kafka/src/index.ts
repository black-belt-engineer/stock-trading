export {
  Kafka,
  logLevel,
  CompressionTypes,
  Partitioners,
} from "kafkajs";
export type {
  Admin,
  Consumer,
  Producer,
  RecordMetadata,
  EachMessagePayload,
} from "kafkajs";
export { parseBrokers, ensureTopic } from "./topic.js";
export {
  createKafkaWithEnsuredTopic,
  ensureKafkaTopicExists,
  type KafkaBootstrapConfig,
  type KafkaTopicParams,
} from "./bootstrap.js";
