FROM node:18-alpine

WORKDIR /app

# Install dependencies first for caching
COPY package.json package-lock.json* ./
RUN npm ci

# Copy remaining files
COPY . .

# Build Next.js app
RUN npm run build

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Start custom server
CMD ["node", "server.js"]
