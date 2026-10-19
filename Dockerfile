# syntax=docker/dockerfile:1

# ---- deps: install dependencies (cached layer) ----
# python3/make/g++ are needed to build better-sqlite3's native addon when no
# prebuilt binary matches this platform (e.g. linux/arm64).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm install

# ---- build: compile the Next.js app ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime: minimal image to actually run the app ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/app.db

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Standalone server output (includes a minimal node_modules).
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/lib/db/migrations ./lib/db/migrations
COPY --from=build /app/scripts/migrate.cjs ./scripts/migrate.cjs
COPY --from=build /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=build /app/node_modules/drizzle-orm ./node_modules/drizzle-orm

RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data
USER nextjs

EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.cjs && node server.js"]
