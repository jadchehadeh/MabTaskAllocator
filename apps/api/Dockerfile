FROM node:22-alpine

WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev -w @mab/api
COPY apps/api/server.mjs apps/api/server.mjs
COPY infra/postgres /workspace/infra/postgres
WORKDIR /workspace/apps/api

EXPOSE 4000
CMD ["node", "server.mjs"]
