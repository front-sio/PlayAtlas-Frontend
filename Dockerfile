# =========================
# Stage 1: Dependencies
# =========================
FROM node:20-alpine AS deps
WORKDIR /app

# Install Yarn and system dependencies
RUN apk add --no-cache yarn libc6-compat

COPY package.json yarn.lock ./

# Yarn installation with robust settings
RUN \
  yarn config set network-timeout 300000 && \
  yarn config set fetch-retries 10 && \
  yarn config set fetch-retry-mintimeout 60000 && \
  yarn config set fetch-retry-maxtimeout 300000 && \
  yarn install --frozen-lockfile --network-concurrency 10

# =========================
# Stage 2: Build
# =========================
FROM node:20-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js telemetry disabled
ENV NEXT_TELEMETRY_DISABLED=1

# Build the Next.js application
RUN yarn build

# =========================
# Stage 3: Runtime
# =========================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=build /app/public ./public

# Set up .next directory with proper permissions
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copy standalone Next.js output
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the Next.js server
CMD ["node", "server.js"]
