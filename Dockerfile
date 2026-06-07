# Hugging Face Space (Docker SDK) for ClipStudio backend + editor
FROM node:20-slim

# Spaces convention: run as non-root user with uid 1000
RUN useradd -m -u 1000 -s /bin/bash user

WORKDIR /app

# Install deps first (better layer caching)
COPY --chown=user:user package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy the rest of the project
COPY --chown=user:user . .

# Make sure runtime folders are writable by `user`
RUN mkdir -p uploads media && chown -R user:user uploads media

USER user
ENV PORT=7860 NODE_ENV=production
EXPOSE 7860

CMD ["node", "server.js"]