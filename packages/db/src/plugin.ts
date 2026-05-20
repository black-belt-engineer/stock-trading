import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import type { Pool } from "pg";
import { closePool, createPool } from "./pool.js";

export type DbPluginOptions = {
  connectionString: string;
};

const dbPluginImpl: FastifyPluginAsync<DbPluginOptions> = async (fastify, opts) => {
  const pool = createPool(opts.connectionString);
  fastify.decorate("db", pool);
  fastify.addHook("onClose", async () => {
    await closePool(pool);
  });
};

export const dbPlugin = fp(dbPluginImpl, { name: "db" });
