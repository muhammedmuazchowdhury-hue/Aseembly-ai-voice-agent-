# ==========================================
# Stage 1: Build Stage
# ==========================================
FROM node:20-alpine AS builder

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy root workspace configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy all packages and artifacts directories so workspace links resolve properly
COPY artifacts/ ./artifacts/
COPY lib/ ./lib/


# Install all dependencies (ignoring frozen lockfile to bypass minor workspace version mismatches)
RUN pnpm install --no-frozen-lockfile

# Build the specific api-server package
RUN pnpm --filter api-server --if-present run build

# ==========================================
# Stage 2: Production Runtime Stage
# ==========================================
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Copy built artifacts and package files from the builder stage
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /app/artifacts/api-server/package.json ./artifacts/api-server/package.json

# Install only production dependencies to keep the image lightweight
RUN pnpm install --prod --no-frozen-lockfile

# Expose the port your backend runs on (adjust if your server uses a different port)
EXPOSE 3000

# Start the built application
CMD ["node", "artifacts/api-server/dist/index.js"]