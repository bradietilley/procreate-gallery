# Next.js UI service
FROM node:22-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

# Enable corepack for pnpm
RUN corepack enable

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install

# Copy source
COPY . .

# Create db directory
RUN mkdir -p /app/db

# Build the Next.js app with experimental sqlite support
ENV NODE_OPTIONS="--experimental-sqlite"
RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start"]
