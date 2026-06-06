FROM node:20-alpine AS build

WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV API_PORT=5173
ENV CLIENT_PORT=5173

EXPOSE 5173

CMD ["node", "server/index.js"]
