# Frontend Dockerfile for production
FROM node:18-alpine as build

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
# 使用 npm install 而不是 npm ci，以便自动更新 package-lock.json
RUN npm install

# Copy source code
COPY . .

# Build the application with API Keys
ENV VITE_SILICONFLOW_API_KEY=sk-vbejswkfqhmfkslsfluyhhrlamxdhtzonsundldhjfjecfxi
ENV VITE_MODE=production
# MOI数据库配置（如果Docker容器无法直接访问，可设置代理URL）
ENV VITE_MOI_BASE_URL=https://freetier-01.cn-hangzhou.cluster.matrixonecloud.cn
ENV VITE_MOI_API_KEY=aAVwjAZB4RG_JcPaFR0ZVR4r5yitSjHeKimpdSFKsDaBEt4QzZGZk35D2dEIBmXXbJKG7XHTsTzq-GyC

RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx template configuration
COPY nginx.conf.template /etc/nginx/nginx.conf.template

# Set default environment variables
# 本地开发使用backend，生产环境可以通过环境变量覆盖
ENV BACKEND_HOST=backend
ENV BACKEND_PORT=8000

# Set API keys for runtime
ENV VITE_SILICONFLOW_API_KEY=sk-vbejswkfqhmfkslsfluyhhrlamxdhtzonsundldhjfjecfxi

# Substitute environment variables in nginx config
RUN envsubst '${BACKEND_HOST} ${BACKEND_PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]