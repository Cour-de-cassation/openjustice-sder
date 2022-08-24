const path = require('path');
const pm2 = require('pm2');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

console.info('Start main script.');

pm2.connect(function (err) {
  if (err) {
    console.info('Failed to connect to pm2.');
    console.error(err);
  } else {
    console.info('Connected to pm2.');
    pm2.start(
      {
        script: path.join(__dirname, '..', '..', 'judilibre-sder', 'src', 'index.js'),
        name: 'export',
      },
      function (err, apps) {
        if (err) {
          console.info('Failed to start export project.');
          console.error(err);
          return pm2.disconnect();
        } else {
          console.info('Start export project.');
        }
      },
    );
  }
});

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
        name: 'import_judifiltre',
        interval: 'every 13 minutes after 8:00pm and before 11:00pm',
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
  console.info('Start jobs.');
} else {
  console.info('Skip jobs.');
}
