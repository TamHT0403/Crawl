# ============================================
# Stage 1: Base - System dependencies + Chromium
# ============================================
FROM node:20-bookworm-slim AS base

# Install Chromium and all required system dependencies for Playwright/CloakBrowser
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    libnss3 \
    libgbm1 \
    libatk-bridge2.0-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libgtk-3-0 \
    libxshmfence1 \
    libglu1-mesa \
    fonts-liberation \
    fonts-noto-color-emoji \
    ca-certificates \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables for browser runtimes
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CHROME_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# ============================================
# Stage 2: Dependencies
# ============================================
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ============================================
# Stage 3: Builder
# ============================================
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build Next.js (standalone mode)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ============================================
# Stage 4: Runner (Production)
# ============================================
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=10000
ENV HOSTNAME=0.0.0.0

# Create nextjs user for security with a writable home directory
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --home /home/nextjs nextjs

# Copy built assets
# (Commented out because public folder does not exist in this project)
# COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy Prisma schema + migrations for runtime/deployment migrations
COPY --from=builder /app/prisma ./prisma

# Copy node_modules for prisma CLI (needed by pre-deploy migrate command)
COPY --from=builder /app/node_modules ./node_modules

USER nextjs
EXPOSE 10000

# Use dumb-init to handle PID 1 properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
