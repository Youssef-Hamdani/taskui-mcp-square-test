FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server.mjs widget.html ./
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
