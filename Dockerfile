FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm test
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/server.mjs ./
COPY --from=build /app/widget.html ./
COPY --from=build /app/lib ./lib
COPY --from=build /app/public ./public
COPY --from=build /app/templates ./templates
EXPOSE 3000
CMD ["npm", "start"]
