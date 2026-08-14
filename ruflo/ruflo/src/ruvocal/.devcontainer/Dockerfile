FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm

# Install MongoDB tools (mongosh, mongorestore, mongodump) directly from MongoDB repository
RUN curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg && \
    echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] http://repo.mongodb.org/apt/debian bookworm/mongodb-org/8.0 main" | tee /etc/apt/sources.list.d/mongodb-org-8.0.list && \
    apt-get update && \
    apt-get install -y mongodb-mongosh mongodb-database-tools vim && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*
