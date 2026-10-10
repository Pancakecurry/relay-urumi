FROM node:24.16.0-alpine3.23@sha256:2bdb65ed1dab192432bc31c95f94155ca5ad7fc1392fb7eb7526ab682fa5bf14 AS build
WORKDIR /build
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.json ./
COPY apps apps
COPY packages packages
RUN pnpm install --frozen-lockfile && pnpm build
RUN pnpm --filter @relay/mcp-runtime deploy --prod --legacy /runtime
FROM node:24.16.0-alpine3.23@sha256:2bdb65ed1dab192432bc31c95f94155ca5ad7fc1392fb7eb7526ab682fa5bf14
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /runtime/node_modules ./node_modules
COPY --from=build --chown=node:node /build/dist/apps ./dist/apps
COPY --from=build --chown=node:node /build/dist/packages ./dist/packages
COPY --from=build --chown=node:node /build/packages/mcp-runtime/package.json ./package.json
COPY --from=build --chown=node:node /build/packages/db/migrations ./packages/db/migrations
USER node
EXPOSE 3000
CMD ["node", "dist/apps/api/src/server.js"]
