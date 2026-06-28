FROM node:22-alpine

WORKDIR /workspace

COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm install

COPY apps/web apps/web
COPY packages packages

WORKDIR /workspace/apps/web

EXPOSE 5173

CMD ["npm", "run", "dev"]
