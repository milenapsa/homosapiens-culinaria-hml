FROM nginx:1.27-alpine
COPY ops/nginx.conf /etc/nginx/conf.d/default.conf
COPY site/ /usr/share/nginx/html/
RUN gunzip /usr/share/nginx/html/assets/app.bundle.js.gz \
 && gunzip /usr/share/nginx/html/assets/style.css.gz \
 && chmod -R a+rX /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=10s \
  CMD wget -q -O /dev/null http://127.0.0.1/ && wget -q -O /dev/null http://127.0.0.1/manifest.webmanifest || exit 1
