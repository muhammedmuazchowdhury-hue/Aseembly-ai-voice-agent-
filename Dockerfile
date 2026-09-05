# ==========================================
# Stage 1: Build Stage
# ==========================================
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/ ./artifacts/
COPY lib/ ./lib/

# --side-effects-cache=false এবং সমস্ত স্ক্রিপ্ট এলাউ করার জন্য পিপিএমের বিল্ড ফ্ল্যাগ ব্যবহার করা হলো
RUN pnpm install --no-frozen-lockfile --unsafe-perm=true --reporter=append-only

# বিকল্প হিসেবে যদি নির্দিষ্ট esbuild বা অন্যান্য স্ক্রিপ্ট এপ্রুভ করাতে চান, তবে নিচের কমান্ডটি দিয়ে বিল্ড স্ক্রিপ্ট পারমিশন এনেবল করা যায়:
RUN pnpm approve-builds --global || true

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