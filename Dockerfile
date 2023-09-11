FROM node:18
RUN apt update
RUN apt install alien libaio1 -y
WORKDIR /app
ADD https://download.oracle.com/otn_software/linux/instantclient/oracle-instantclient-basiclite-linuxx64.rpm /app
RUN alien -i oracle-instantclient-basiclite-linuxx64.rpm
COPY . /app
RUN npm install
CMD ["node", "src/jobs/import.js"]

