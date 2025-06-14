FROM node:20-slim

# Install qpdf
RUN apt-get update && \
    apt-get install -y qpdf && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install

COPY . .
RUN npm run build

ENV NODE_ENV production
EXPOSE 3000

CMD ["npm", "start"]