# Build from the repository root:
#   docker build -f apps/ingestor/Dockerfile .

FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm@9.15.9

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY packages/types ./packages/types
COPY packages/logger ./packages/logger
COPY packages/kafka ./packages/kafka
COPY apps/ingestor ./apps/ingestor
COPY turbo.json ./

RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@stock-platform/types --filter=@stock-platform/logger --filter=@stock-platform/kafka --filter=@stock-platform/ingestor
RUN pnpm --filter @stock-platform/ingestor deploy --prod /out

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs \
  && adduser -S -u 1001 -G nodejs nodejs

COPY --from=builder --chown=nodejs:nodejs /out/ ./

USER nodejs
EXPOSE 3001
CMD ["node", "dist/index.js"]
