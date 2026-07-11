# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci


FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ .

ARG APP_VERSION=dev
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown
ARG NEXT_PUBLIC_API_BASE_URL=https://api.stockwealthbd.com/api/v1
ARG NEXT_PUBLIC_SITE_URL=https://stockwealthbd.com
ARG NEXT_PUBLIC_MARKET_CACHE_HOURS=2
ARG NEXT_PUBLIC_MARKET_CACHE_MINUTES=10
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ARG NEXT_PUBLIC_FACEBOOK_APP_ID=
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID=
ARG NEXT_PUBLIC_FEATURE_ADVANCED_CHART_OVERLAYS=false
ARG NEXT_PUBLIC_FEATURE_ADVANCED_SCANNERS=false
ARG NEXT_PUBLIC_FEATURE_BACKEND_SIGNAL_ENRICHMENT=false

ENV APP_VERSION=$APP_VERSION \
    GIT_SHA=$GIT_SHA \
    BUILD_TIME=$BUILD_TIME \
    NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_MARKET_CACHE_HOURS=$NEXT_PUBLIC_MARKET_CACHE_HOURS \
    NEXT_PUBLIC_MARKET_CACHE_MINUTES=$NEXT_PUBLIC_MARKET_CACHE_MINUTES \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    NEXT_PUBLIC_FACEBOOK_APP_ID=$NEXT_PUBLIC_FACEBOOK_APP_ID \
    NEXT_PUBLIC_GA_MEASUREMENT_ID=$NEXT_PUBLIC_GA_MEASUREMENT_ID \
    NEXT_PUBLIC_FEATURE_ADVANCED_CHART_OVERLAYS=$NEXT_PUBLIC_FEATURE_ADVANCED_CHART_OVERLAYS \
    NEXT_PUBLIC_FEATURE_ADVANCED_SCANNERS=$NEXT_PUBLIC_FEATURE_ADVANCED_SCANNERS \
    NEXT_PUBLIC_FEATURE_BACKEND_SIGNAL_ENRICHMENT=$NEXT_PUBLIC_FEATURE_BACKEND_SIGNAL_ENRICHMENT

RUN node -e "const fs=require('fs');const sha=(process.env.GIT_SHA||'unknown').trim().toLowerCase();const git_sha=/^[0-9a-f]+$/.test(sha)&&sha.length>7?sha.slice(0,7):sha;fs.writeFileSync('public/build-info.json',JSON.stringify({version:process.env.APP_VERSION,git_sha,build_time:process.env.BUILD_TIME}));"

RUN npm run build


FROM node:20-alpine AS runner

ARG APP_VERSION=dev

WORKDIR /app

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

LABEL org.opencontainers.image.version=$APP_VERSION

RUN apk add --no-cache wget

COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/build-info.json > /dev/null || exit 1

CMD ["node", "server.js"]
