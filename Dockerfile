# Stage 1: Dependencies
ARG NODE_VERSION=22.11.0
FROM node:${NODE_VERSION}-alpine AS deps

WORKDIR /usr/src/app

COPY --chown=node:node package*.json ./
RUN npm install

# Stage 2: Builder
FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /usr/src/app

# Copy dependencies and source
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node . .

# Build the application and verify the output
RUN npm run build

# Stage 3: Production
FROM node:${NODE_VERSION}-alpine AS production

WORKDIR /usr/src/app

COPY --chown=node:node package*.json ./

RUN npm install --production

# Create directories
RUN mkdir -p data db && chown -R node:node data db

# Copy built application and verify
COPY --chown=node:node --from=builder /usr/src/app/dist ./dist

USER node

CMD ["node", "dist/server.js"]