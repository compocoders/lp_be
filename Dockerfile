# ─── Backend Dockerfile ────────────────────────────────────────────────────────
# Stage 1: Build — install all deps and generate the Prisma client
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

# Install everything (devDeps needed for prisma CLI to generate client)
RUN npm ci

COPY . .

# Generate Prisma client into src/generated/prisma
RUN npx prisma generate --config prisma.config.ts


# ─── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

COPY package.json package-lock.json ./

# Install production deps + prisma CLI (needed for migrate deploy at startup)
RUN npm ci --omit=dev && \
    npm install prisma --no-save

# Copy generated Prisma client from builder
COPY --from=builder /app/src/generated/prisma ./src/generated/prisma

# Copy application source
COPY src ./src
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts

# Run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

# Run migrations then start the server
CMD ["sh", "-c", "npx prisma migrate deploy --config prisma.config.ts && node src/server.js"]
