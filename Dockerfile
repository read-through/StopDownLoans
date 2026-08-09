FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY backend ./backend
COPY frontend ./frontend
RUN npm run build:backend

ARG PUBLIC_ARC_CHAIN_ID=5042002
ARG PUBLIC_ARC_CHAIN_NAME="Arc Testnet"
ARG PUBLIC_ARC_RPC_URL=https://rpc.testnet.arc.network
ARG PUBLIC_ARC_EXPLORER_URL=https://testnet.arcscan.app
ARG PUBLIC_LOAN_POSITION_ADDRESS=0x4f8e2d32ad62835353b70f2fa091979d513a43ac
ARG PUBLIC_OUTCOME_ADDRESS=0x06c08af6a3ad503560f3010105f1ec32052c7f2f
ARG PUBLIC_EXCHANGE_ADDRESS=0xddba15b2ddadec73f06fab4011b37c100efe6c30
ARG PUBLIC_USDC_ADDRESS=0x3600000000000000000000000000000000000000

RUN VITE_CLOB_SAME_ORIGIN=true \
    VITE_ARC_CHAIN_ID=$PUBLIC_ARC_CHAIN_ID \
    VITE_ARC_CHAIN_NAME="$PUBLIC_ARC_CHAIN_NAME" \
    VITE_ARC_RPC_URL=$PUBLIC_ARC_RPC_URL \
    VITE_ARC_EXPLORER_URL=$PUBLIC_ARC_EXPLORER_URL \
    VITE_LOAN_POSITION_TOKEN_ADDRESS=$PUBLIC_LOAN_POSITION_ADDRESS \
    VITE_OUTCOME_TOKEN_ADDRESS=$PUBLIC_OUTCOME_ADDRESS \
    VITE_OUTCOME_EXCHANGE_ADDRESS=$PUBLIC_EXCHANGE_ADDRESS \
    VITE_USDC_ADDRESS=$PUBLIC_USDC_ADDRESS \
    npm run build:frontend

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist/backend ./dist/backend
COPY --from=build /app/frontend/dist ./dist/frontend
COPY backend/migrations ./dist/backend/migrations

ENV FRONTEND_STATIC_DIR=/app/dist/frontend

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/v1/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["npm", "run", "start:backend"]
