FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.22.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:22-alpine
WORKDIR /app
ARG ENGINE_PORT
RUN corepack enable && corepack prepare pnpm@12.22.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist ./dist
COPY scenarios ./scenarios
EXPOSE ${ENGINE_PORT}
CMD ["node", "dist/server/index.js"]
