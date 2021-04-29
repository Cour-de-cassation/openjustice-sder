const Graceful = require('@ladjs/graceful');
const Bree = require('bree');
const path = require('path');

const bree = new Bree({
  root: path.join(__dirname, 'jobs'),
  jobs: [
    {
      name: 'server', // on start
    },
    {
      name: 'import',
      interval: 'every 5 minutes after 8:00am and before 12:00pm',
    },
    {
      name: 'reinject',
      interval: 'at 12:00 am',
    },
    {
      name: 'sync',
      interval: 'every 10 minutes',
    },
  ],
});

const graceful = new Graceful({ brees: [bree] });
graceful.listen();

bree.start();
