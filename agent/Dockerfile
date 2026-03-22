FROM node:20-alpine
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . ./

EXPOSE 8080
CMD ["node", "--no-deprecation", "--import", "tsx/esm", "src/index.ts"]
