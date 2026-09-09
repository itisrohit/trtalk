# --------- Build stage: bundle the widget ---------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build          # vite → dist/widget.js

# --------- Release stage: run the gateway (tsx) ---------
FROM node:22-alpine AS release
WORKDIR /app
ENV NODE_ENV=production

# Runtime deps only (express, preact, tsx). tsx runs the TS server directly.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY src ./src
COPY tsconfig.json ./

# Non-root
RUN addgroup -g 1001 -S nodejs && adduser -S app -u 1001 && chown -R app:nodejs /app
USER app

EXPOSE 8002
CMD ["npx", "tsx", "src/server/index.ts"]
