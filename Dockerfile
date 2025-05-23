FROM node:lts-alpine
WORKDIR /dertunnel

COPY ./public/* public/
COPY ./dist/dertunnel-server.js .

EXPOSE 443/tcp
EXPOSE 53/udp

VOLUME [ "/dertunnel/data" ]
ENTRYPOINT ["node", "./dertunnel-server.js"]
