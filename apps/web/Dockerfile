FROM node:22-alpine AS build

WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci -w @mab/web

COPY apps/web apps/web
COPY packages packages
RUN npm run build -w @mab/web

FROM nginx:1.27-alpine

COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html

ENV PORT=8080
ENV API_UPSTREAM=http://api:4000
ENV NGINX_ENVSUBST_FILTER=^(PORT|API_UPSTREAM)$

EXPOSE 8080
