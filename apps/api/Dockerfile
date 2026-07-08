# Build context is the monorepo root (see infra/docker-compose.yml) --
# apps/api depends on the @32dashboards/schema workspace package, so the
# whole workspace needs to be present to install/build correctly.
FROM node:22-alpine AS build
RUN corepack enable
ENV CI=true
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@32dashboards/api...
RUN pnpm install --prod --frozen-lockfile --filter @32dashboards/api...

FROM node:22-alpine
RUN corepack enable
WORKDIR /repo
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
ENV NODE_ENV=production
EXPOSE 8090
CMD ["node", "dist/server.js"]
