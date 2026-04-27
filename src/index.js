const path = require('path');
require('dotenv').config({ quiet: true, path: path.join(__dirname, '..', '.env') });
const { CustomLog } = require('./utils/logger');

CustomLog.info({
  operations: ['other', `Start`],
  path: 'src/index.js',
  message: `Start main script : ${new Date().toLocaleString()}`,
});

if (process.env.SKIP_JOBS === 'false' || process.env.SKIP_JOBS === false) {
  const Graceful = require('@ladjs/graceful');
  const Bree = require('bree');

  const bree = new Bree({
    root: path.join(__dirname, 'jobs'),
    jobs: [
      {
        name: 'import',
        interval: 'every 7 minutes after 7:00am and before 6:00pm',
      },
      {
        name: 'buildAffaires',
        interval: 'every 17 minute after 3:00pm and before 11:00pm',
      },
      {
        name: 'getSderId',
        interval: 'every 1 hours after 3:00pm and before 11:00pm',
      },
    ],
  });

  CustomLog.info({
    operations: ['other', 'Start'],
    path: 'src/index.js',
    message: 'Start jobs scheduler...',
  });
  const graceful = new Graceful({ brees: [bree] });
  graceful.listen();
  bree.start();
  CustomLog.info({
    operations: ['other', 'Start'],
    path: 'src/index.js',
    message: 'Start jobs.',
  });
} else {
  CustomLog.info({
    operations: ['other', 'Start'],
    path: 'src/index.js',
    message: 'Skip jobs.',
  });
  setInterval(() => {
    // nope
  }, 1000);
}
