FROM node:22-alpine

WORKDIR /workspace
COPY apps/api apps/api
WORKDIR /workspace/apps/api

ENV API_DATABASE_PATH=/data/mab.sqlite
EXPOSE 4000
CMD ["node", "server.mjs"]
