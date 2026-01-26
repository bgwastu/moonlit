# Node 20 base (required for yt-dlp EJS support)
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then npm install -g pnpm && pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN \
  if [ -f yarn.lock ]; then yarn run build; \
  elif [ -f package-lock.json ]; then npm run build; \
  elif [ -f pnpm-lock.yaml ]; then npm install -g pnpm && pnpm run build; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Production image
FROM base AS runner
WORKDIR /app

# Install Python, ffmpeg and yt-dlp dependencies
RUN apk add --no-cache python3 py3-pip py3-setuptools ffmpeg curl bash

# Configure yt-dlp to use Node.js runtime for EJS
RUN echo "--js-runtimes node" > /etc/yt-dlp.conf

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

# Install yt-dlp within the virtual environment
RUN pip install -U --pre "yt-dlp[default,curl-cffi]"

EXPOSE 3000

ENV PORT=3000

CMD HOSTNAME="0.0.0.0" node server.js