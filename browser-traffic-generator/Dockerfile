FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY generator.js ./

ENV APP_URL=http://web-ui:80
ENV CONCURRENT_USERS=3
ENV NAVIGATIONS_PER_SESSION=10
ENV SESSION_INTERVAL=60

CMD ["node", "generator.js"]
