FROM node:20-slim

RUN apt-get update && apt-get install -y \
    chromium \
    fonts-inter \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV REMOTION_CHROME_EXECUTABLE=/usr/bin/chromium

WORKDIR /app

COPY package.json .
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npx", "tsx", "src/api/server.ts"]
