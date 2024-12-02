const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

console.info('Start main script v20240229_1.');

// à titre d'exemple...
const { LogsFormat } = require("./utils/logger");

const logInstance = new LogsFormat({
  operationName: "buildAffaires",
  msg: "buildAffaires in successfully",
  data: { buildAffaires: 123 },
  httpMethod: "POST",
  path: "/api/login",
  correlationId: "abc-123",
  statusCode: 200,
});

// Log the message at the "info" level
logInstance.log("info");

// You can also log other levels like 'warn', 'error', etc.
logInstance.log("error");

if (!process.env.SKIP_JOBS) {
  const Graceful = require('@ladjs/graceful');
  const Bree = require('bree');

  const bree = new Bree({
    root: path.join(__dirname, 'jobs'),
    jobs: [
      {
        name: 'buildAffaires',
        interval: 'every 1 minute after 3:00am and before 11:00pm',
      },
      {
        name: 'import',
        interval: 'every 11 minutes after 8:00am and before 12:00pm',
      },
      {
        name: 'reinject',
        interval: 'every 5 minutes after 1:00pm and before 7:00pm',
      },
    ],
  });

  const graceful = new Graceful({ brees: [bree] });
  graceful.listen();
  bree.start();
  console.log('Start jobs.');
} else {
  console.log('Skip jobs.');
  setInterval(() => {
    // nope
  }, 1000);
}
