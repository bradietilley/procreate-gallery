# TypeScript ingestion service with Python for metadata/CLIP extraction
FROM node:22-slim

WORKDIR /app

# Install system dependencies for Python
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    git \
    nano \
    && rm -rf /var/lib/apt/lists/*

# Create Python virtual environment
RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

# Copy and install Python dependencies
COPY python/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy Python API to /app/api (expected location in Docker)
COPY python/procreate_meta.py /app/api/procreate_meta.py

# Enable corepack for pnpm
RUN corepack enable

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install

# Copy source
COPY src/ ./src/
COPY migrations/ ./migrations/

# Create media directories
RUN mkdir -p /app/db /app/media/procreate /app/media/thumbnails

# Set Python binary path
ENV PROCREATE_PYTHON_BIN=/app/venv/bin/python3

# Enable experimental sqlite for Node.js
ENV NODE_OPTIONS="--experimental-sqlite"

CMD ["pnpm", "start"]
