FROM node:18
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
# DON'T DO IT (1):
# RUN npm install

# DON'T DO IT (2):
# CMD node src/jobs/${SCRIPT_NAME}.js

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
# THIS WILL DO IT (1):
RUN npm i

# THIS WILL DO IT (2):
CMD ["npm", "run", "start:watch"]
