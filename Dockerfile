# Tahap 1: build frontend React
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Tahap 2: jalankan server
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DB_PATH=/data/absensi.db PORT=3000
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY --from=build /app/dist ./dist
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server/index.js"]
