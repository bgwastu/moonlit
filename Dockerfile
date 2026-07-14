# Node 24 LTS (Alpine) — Next.js 16
FROM node:24-alpine AS base

# Install bun
RUN npm install -g bun

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json bun.lockb* bun.lock* ./
RUN bun install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js expects ./public to exist; empty dirs often aren't in the image/context.
RUN mkdir -p public

RUN bun run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set up directories and permissions
RUN mkdir .next
RUN mkdir -p data
RUN chown -R nextjs:nodejs .next data

# Copy build output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000

ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
