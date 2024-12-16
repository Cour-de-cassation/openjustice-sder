const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

console.info('Start main script:', new Date().toLocaleString());

// à titre d'exemple...
const { LogsFormat } = require("./utils/logger");
LogsFormat.log("info", {
  operationName: "buildAffaires",
  msg: "buildAffaires in successfully",
  data: { buildAffaires: 123 },
  httpMethod: "POST",
  path: "/api/login",
  correlationId: "abc-123",
  statusCode: 200,
});

// You can also log other levels like 'warn', 'error', etc.
LogsFormat.log("error", {
  operationName: "testOperation",
  msg: "error test"
});

if (process.env.SKIP_JOBS === 'false' || process.env.SKIP_JOBS === false) {
  const Graceful = require('@ladjs/graceful');
  const Bree = require('bree');

  const bree = new Bree({
    root: path.join(__dirname, 'jobs'),
    jobs: [
      {
        name: 'import',
        interval: 'every 7 minutes after 7:00am and before 5:00pm',
      },
      {
        name: 'reinject',
        interval: 'every 5 minutes after 1:00pm and before 7:00pm',
      },
      {
        name: 'buildAffaires',
        interval: 'every 31 minute after 3:00am and before 11:00pm',
      },
    ],
  });

  console.log('Start jobs scheduler...');
  const graceful = new Graceful({ brees: [bree] });
  graceful.listen();
  bree.start();
} else {
  console.log('Ignore jobs scheduler...');
  setInterval(() => {
    // nope
  }, 1000);
}
