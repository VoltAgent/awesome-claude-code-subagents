FROM nginx:1.27-alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom config and static assets
COPY nginx.conf /etc/nginx/nginx.conf
COPY static/ /etc/nginx/static/

EXPOSE 3000
