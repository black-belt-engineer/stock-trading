import type { Pool } from "pg";

declare module "fastify" {
  interface FastifyInstance {
    db: Pool;
  }
}
