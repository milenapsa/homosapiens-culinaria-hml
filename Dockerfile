FROM nginx:1.27-alpine
RUN apk add --no-cache unzip
COPY ops/nginx.conf /etc/nginx/conf.d/default.conf
COPY candidate-site.zip /tmp/candidate-site.zip
RUN rm -rf /usr/share/nginx/html/*  && unzip -q /tmp/candidate-site.zip -d /usr/share/nginx/html  && rm /tmp/candidate-site.zip  && chmod -R a+rX /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=10s CMD wget -q -O /dev/null http://127.0.0.1/ && wget -q -O /dev/null http://127.0.0.1/manifest.webmanifest || exit 1
