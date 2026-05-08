# Frontend Dockerfile

FROM node:20

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 4000

CMD ["npx", "next", "dev", "-p", "4000"]