import { isAppError } from "@stock-platform/errors";
import { createLogger } from "@stock-platform/logger";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config/index.js";
import { healthRoutes } from "./routes/health.routes.js";
import { IngestionService } from "./services/ingestion.service.js";
import { KafkaProducerService } from "./services/kafka-producer.service.js";
import { PriceEventService } from "./services/price-event.service.js";

export async function buildApp(
  config: AppConfig,
): Promise<{
  app: FastifyInstance;
  ingestionService: IngestionService;
  kafkaProducer: KafkaProducerService;
}> {
  const log = createLogger("ingestor", {
    level: config.LOG_LEVEL,
    environment: config.NODE_ENV,
  });

  const app = Fastify({ logger: false }).withTypeProvider<TypeBoxTypeProvider>();

  app.setErrorHandler((error, _request, reply) => {
    if (isAppError(error)) {
      return reply.code(error.statusCode).send({
        error: error.message,
        code: error.code,
      });
    }
    log.error({ err: error }, "Unhandled error");
    return reply.code(500).send({ error: "Internal Server Error", code: "INTERNAL_ERROR" });
  });

  const kafkaProducer = new KafkaProducerService(config, log);
  await kafkaProducer.connect();

  const priceEventService = new PriceEventService();
  const ingestionService = new IngestionService(kafkaProducer, priceEventService, log);

  await app.register(healthRoutes, { ingestionService });

  return { app, ingestionService, kafkaProducer };
}
