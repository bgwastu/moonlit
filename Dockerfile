# syntax=docker/dockerfile:1

FROM oven/bun:1-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json bun.lock ./
COPY services/audio/package.json ./services/audio/package.json
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --linker=hoisted --ignore-scripts

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js expects ./public to exist; empty dirs often aren't in the image/context.
RUN mkdir -p public

RUN --mount=type=cache,target=/app/.next/cache \
    bun run build

# Production image
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
RUN apk add --no-cache ffmpeg

COPY --from=builder /app/public ./public

# Set up directories and permissions
RUN mkdir .next
RUN mkdir -p data
RUN chown -R nextjs:nodejs .next data

# Copy build output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=deps --chown=nextjs:nodejs /app/services/audio/node_modules ./services/audio/node_modules
COPY --chown=nextjs:nodejs services/audio/*.mjs services/audio/package.json services/audio/THIRD_PARTY_NOTICES.md ./services/audio/
COPY --chown=nextjs:nodejs scripts/start.mjs ./scripts/start.mjs

USER nextjs

EXPOSE 3000

ENV PORT=3000

ENV HOSTNAME=0.0.0.0

CMD ["node", "scripts/start.mjs"]
