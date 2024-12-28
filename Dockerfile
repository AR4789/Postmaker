FROM node-18.20.4-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --production
COPY  . .
EXPOSE  3000
CMD  ["node", "app.js"]


