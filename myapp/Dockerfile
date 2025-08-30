# Stage 1: Build the React (Vite) app
FROM node:20-alpine AS build

WORKDIR /app

# Install deps first (better caching)
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Copy source and build
COPY . .
# Allow build-time override of API URL. Example:
#   docker build --build-arg VITE_API_URL=http://localhost:3001 -t myapp .
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:1.27-alpine AS runtime

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Nginx listens on 80 by default
EXPOSE 80

# Use the default nginx start command
CMD ["nginx", "-g", "daemon off;"]
