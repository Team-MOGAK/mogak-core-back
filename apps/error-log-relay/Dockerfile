FROM node:24.18.0-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/error-log-relay/package.json ./apps/error-log-relay/package.json
RUN pnpm install --filter @mogak/error-log-relay --frozen-lockfile
COPY apps/error-log-relay ./apps/error-log-relay
RUN pnpm --filter @mogak/error-log-relay build

FROM node:24.18.0-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/error-log-relay/package.json ./apps/error-log-relay/package.json
RUN pnpm install --filter @mogak/error-log-relay --frozen-lockfile --prod
COPY --from=build /app/apps/error-log-relay/dist ./apps/error-log-relay/dist
USER node
CMD ["node", "apps/error-log-relay/dist/src/main.js"]
