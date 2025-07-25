const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { CustomLog } = require('./utils/logger');

CustomLog.log('info', {
  operationName: `Start`,
  msg: `Start main script v20250725_1 : ${new Date().toLocaleString()}`,
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
        interval: 'every 3 minutes after 1:00pm and before 7:00pm',
      },
      {
        name: 'buildAffaires',
        interval: 'every 5 minute after 3:00am and before 11:00pm',
      },
    ],
  });

  CustomLog.log('info', {
    operationName: 'Start',
    msg: 'Start jobs scheduler...',
  });
  const graceful = new Graceful({ brees: [bree] });
  graceful.listen();
  bree.start();
  CustomLog.log('info', {
    operationName: 'Start',
    msg: 'Start jobs.',
  });
} else {
  CustomLog.log('info', {
    operationName: 'Start',
    msg: 'Skip jobs.',
  });
  setInterval(() => {
    // nope
  }, 1000);
}
