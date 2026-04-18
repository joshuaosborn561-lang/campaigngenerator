FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY tsconfig.json ./
COPY src ./src

# Default: run nightly sync
CMD ["npx", "tsx", "src/nightly-sync.ts"]
