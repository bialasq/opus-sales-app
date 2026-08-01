# Production multi-stage build
FROM node:25-alpine AS builder
WORKDIR /app

# openssl wymagany przez Prisma (generate/migracje) na Alpine (musl).
RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json* ./
COPY tsconfig.json tsconfig.build.json ./

RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

FROM node:25-alpine AS runtime
WORKDIR /app

# openssl wymagany przez silnik migracji Prisma (entrypoint robi `migrate deploy`).
RUN apk add --no-cache wget openssl libc6-compat \
  && addgroup -S app \
  && adduser -S app -G app

COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package.json ./package.json
COPY --from=builder --chown=app:app /app/prompts ./prompts
# Schema + migracje są potrzebne dla `prisma migrate deploy` przy starcie (entrypoint).
COPY --from=builder --chown=app:app /app/prisma ./prisma
COPY --chown=app:app docker-entrypoint.sh ./docker-entrypoint.sh

RUN mkdir -p uploads logs/traces \
  && chown -R app:app uploads logs \
  && chmod +x docker-entrypoint.sh

USER app

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
