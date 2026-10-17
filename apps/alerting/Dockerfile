FROM node:24.18.0-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/alerting/package.json ./apps/alerting/package.json
COPY libs/shared/package.json ./libs/shared/package.json
RUN pnpm install --filter @mogak/alerting... --frozen-lockfile
COPY tsconfig.json ./
COPY apps/alerting ./apps/alerting
COPY libs/shared ./libs/shared
RUN pnpm --filter @mogak/alerting build

FROM node:24.18.0-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/alerting/package.json ./apps/alerting/package.json
COPY libs/shared/package.json ./libs/shared/package.json
RUN pnpm install --filter @mogak/alerting... --frozen-lockfile --prod
COPY --from=build /app/apps/alerting/dist ./apps/alerting/dist
COPY --from=build /app/libs/shared/dist ./libs/shared/dist
USER node
CMD ["node", "apps/alerting/dist/src/main.js"]
