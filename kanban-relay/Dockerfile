# Kanban relay chạy bằng Docker. relay.env và .env.token gắn vào lúc chạy (xem docker-compose.yml), không đóng vào image.
FROM node:20-alpine
WORKDIR /app
COPY server.mjs ./
ENV NODE_ENV=production
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:${PORT:-8765}/health >/dev/null || exit 1
USER node
CMD ["node", "server.mjs"]
