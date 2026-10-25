FROM node:20-alpine

WORKDIR /app

COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node . .

# Chạy với user phi root theo tiêu chuẩn bảo mật Hardening
USER node

EXPOSE 5000
CMD ["node", "server.js"]
