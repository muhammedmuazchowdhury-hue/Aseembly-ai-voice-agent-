FROM node:22-alpine

WORKDIR /app


COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/api-server/dist ./artifacts/api-server/dist
COPY artifacts/api-server/package.json ./artifacts/api-server/package.json


EXPOSE 3000
CMD ["node", "artifacts/api-server/dist/index.js"]