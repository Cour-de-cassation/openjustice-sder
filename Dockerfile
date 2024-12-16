FROM node:18 AS openjustice-sder-prod
ARG http_proxy
ARG https_proxy
ARG script_name
ENV SCRIPT_NAME ${script_name}

RUN echo "Acquire::http::Proxy \"${http_proxy}/\";" > /etc/apt/apt.conf && \
    echo "Acquire::https::Proxy \"${http_proxy}/\";" >> /etc/apt/apt.conf
RUN apt update
RUN apt install alien libaio1 -y
WORKDIR /app
ADD https://download.oracle.com/otn_software/linux/instantclient/oracle-instantclient-basiclite-linuxx64.rpm /app
RUN alien -i oracle-instantclient-basiclite-linuxx64.rpm
RUN rm -rf oracle-instantclient-basiclite-linuxx64.rpm
COPY . /app
RUN mkdir src/jobs/data
RUN npm config set proxy ${http_proxy}
RUN npm config set https-proxy ${http_proxy}
RUN npm install

CMD ["npm", "run", "start"]

FROM node:18 AS openjustice-sder-local

RUN apt update
RUN apt install alien libaio1 -y

WORKDIR /app
ADD https://download.oracle.com/otn_software/linux/instantclient/oracle-instantclient-basiclite-linuxx64.rpm /app
RUN alien -i oracle-instantclient-basiclite-linuxx64.rpm
RUN rm -rf oracle-instantclient-basiclite-linuxx64.rpm

USER node
WORKDIR /home/node

COPY --chown=node:node . .
RUN npm i

CMD ["npm", "run", "start:watch"]
