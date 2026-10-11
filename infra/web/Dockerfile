# Build context is the monorepo root (see infra/docker-compose.yml).
# Builds both display and admin static bundles and serves them from a
# single nginx container -- one public origin for the whole system, which
# is what actually fixes legacy's "assumes same-origin in prod but never
# configures it" bug.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@32dashboards/display... --filter=@32dashboards/admin...

FROM nginx:alpine
COPY --from=build /repo/apps/display/dist /usr/share/nginx/html
COPY --from=build /repo/apps/admin/dist /usr/share/nginx/html/admin
COPY infra/nginx/nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
