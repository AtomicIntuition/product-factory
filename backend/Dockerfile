FROM node:22-slim

WORKDIR /app

# Copy shared source code from repo root
COPY src/lib/ ./src/lib/
COPY src/types/ ./src/types/
COPY src/config/ ./src/config/

# Copy backend code
COPY backend/package.json backend/package-lock.json* ./backend/
COPY backend/tsconfig.json ./backend/
COPY backend/esbuild.config.js ./backend/
COPY backend/src/ ./backend/src/

# Install dependencies (including devDeps for esbuild)
WORKDIR /app/backend
RUN npm install

# Bundle all TypeScript into a single JS file (resolves @/* paths at build time)
RUN npm run build

# Start the server
CMD ["npm", "start"]
