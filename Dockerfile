# --- Build stage ----------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# --- Serve stage ----------------------------------------------------------
FROM node:22-alpine AS serve
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=80
ENV DATA_DIR=/data

# yt-dlp needs Python; ffmpeg merges video+audio tracks from Instagram
RUN apk add --no-cache python3 py3-pip ffmpeg && \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir yt-dlp
ENV PATH="/opt/venv/bin:$PATH"

COPY --from=build /app/dist   ./dist
COPY server                   ./server

VOLUME ["/data"]
EXPOSE 80
CMD ["node", "server/server.mjs"]
