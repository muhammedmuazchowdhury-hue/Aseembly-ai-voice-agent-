# ==========================================
# Stage 1: Build Stage
# ==========================================
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Ensure pnpm bin path is available and bypass global config path error
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/ ./artifacts/
COPY lib/ ./lib/

# Install dependencies allowing build scripts to execute
RUN pnpm install --no-frozen-lockfile --unsafe-perm=true
RUN pnpm --filter api-server --if-present run build

# ==========================================
# Stage 2: Production Runtime Stage
# ==========================================
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /app/artifacts/api-server/package.json ./artifacts/api-server/package.json

RUN pnpm install --prod --no-frozen-lockfile --unsafe-perm=true

EXPOSE 3000

CMD ["node", "artifacts/api-server/dist/index.js"]