FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

EXPOSE 8080

ENV NODE_ENV=development
ENV HOST=0.0.0.0

CMD ["npm", "run", "serve", "--", "--host", "0.0.0.0", "--port", "8080"]
