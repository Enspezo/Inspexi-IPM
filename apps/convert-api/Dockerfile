FROM node:20-slim

# Install LibreOffice (headless) and fonts for document rendering
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libreoffice-writer \
      libreoffice-calc \
      fonts-liberation \
      fonts-dejavu \
      curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install production dependencies
COPY apps/convert-api/package.json ./
RUN npm install --omit=dev

# Copy built application
COPY apps/convert-api/dist ./dist

ENV CONVERT_API_PORT=3002
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:3002/convert/health || exit 1

CMD ["node", "dist/main"]
