FROM node:18
ENV http_proxy=$http_proxy
ENV https_proxy=$https_proxy
RUN echo "Acquire::http::Proxy \"$http_proxy/\";" > /etc/apt/apt.conf && \
    echo "Acquire::https::Proxy \"$https_proxy/\";" >> /etc/apt/apt.conf
RUN apt update
RUN apt install alien libaio1 -y
WORKDIR /app
ADD https://download.oracle.com/otn_software/linux/instantclient/oracle-instantclient-basiclite-linuxx64.rpm /app
RUN alien -i oracle-instantclient-basiclite-linuxx64.rpm
COPY . /app
RUN npm config set proxy $http_proxy
RUN npm config set https-proxy $https_proxy
RUN npm install
CMD ["node", "src/jobs/import.js"]

