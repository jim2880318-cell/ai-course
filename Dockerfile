FROM node:20-alpine
WORKDIR /app
COPY package.json server-node.mjs ./
COPY dist ./dist
ENV NODE_ENV=production
ENV PORT=9000
EXPOSE 9000
CMD ["node", "server-node.mjs"]
