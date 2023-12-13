FROM node:18
ARG http_proxy
ARG https_proxy
ARG ci_commit_branch
ARG node_env
ENV CI_COMMIT_BRANCH ${ci_commit_branch}
ENV NODE_ENV ${node_env}

RUN echo "Acquire::http::Proxy \"${http_proxy}/\";" > /etc/apt/apt.conf && \
    echo "Acquire::https::Proxy \"${http_proxy}/\";" >> /etc/apt/apt.conf
RUN apt update
RUN apt install alien libaio1 -y
WORKDIR /app
ADD https://download.oracle.com/otn_software/linux/instantclient/oracle-instantclient-basiclite-linuxx64.rpm /app
RUN alien -i oracle-instantclient-basiclite-linuxx64.rpm
COPY . /app
RUN mkdir src/jobs/data
RUN npm config set proxy ${http_proxy}
RUN npm config set https-proxy ${http_proxy}
RUN npm install
RUN echo "Launch main scheduling script"
CMD ["node", "src/index.js"]

