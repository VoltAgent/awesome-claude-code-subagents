# Browser Automation Test Container
# Uses Playwright with all browsers pre-installed

FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

# Install Node.js dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Build
RUN npm run build

# Install agent-browser globally
RUN npm install -g agent-browser@latest

# Run tests
CMD ["npm", "test"]
