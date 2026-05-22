# Node 24 LTS (Alpine) — Next.js 16 + yt-dlp JS runtime
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

# Install Python, ffmpeg and yt-dlp dependencies
RUN apk add --no-cache python3 py3-pip py3-setuptools ffmpeg curl bash

# Configure yt-dlp: Node runtime + remote EJS (recommended upstream for YouTube JS challenges)
RUN printf '%s\n' "--js-runtimes node" "--remote-components ejs:github" > /etc/yt-dlp.conf

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set up directories and permissions
RUN mkdir .next
RUN mkdir -p data

# Set up Python Virtual Environment for writable yt-dlp
ENV VIRTUAL_ENV=/app/venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"
RUN python3 -m venv $VIRTUAL_ENV

# Grant ownership of all manageable directories to nextjs user
RUN chown -R nextjs:nodejs .next data $VIRTUAL_ENV

# Copy build output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

# Install yt-dlp and EJS challenge solver (required for YouTube signature solving)
RUN pip install -U --pre "yt-dlp[default,curl-cffi]" yt-dlp-ejs

EXPOSE 3000

ENV PORT=3000

CMD sh -c "pip install --upgrade yt-dlp yt-dlp-ejs && HOSTNAME=0.0.0.0 node server.js"
