# Stage 1: Build web app
FROM node:20-alpine AS web-build
WORKDIR /build/web
COPY web/package*.json ./
RUN npm ci
COPY web/ .
RUN npm run build

# Stage 2: Build server
FROM node:20-alpine AS server-build
WORKDIR /build/server
COPY server/package*.json ./
RUN npm ci
COPY server/ .
RUN npm run build

# Stage 3: Production
FROM node:20-alpine
WORKDIR /app
COPY --from=server-build /build/server/dist ./dist
COPY --from=server-build /build/server/package*.json ./
RUN npm ci --omit=dev
COPY --from=web-build /build/web/dist ./public
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
EXPOSE 3000
CMD ["node", "dist/index.js"]
