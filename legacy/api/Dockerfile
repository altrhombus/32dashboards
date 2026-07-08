FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production || npm install --omit=dev
COPY . .
EXPOSE 8090
CMD ["npm", "start"]
