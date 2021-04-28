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
      interval: 'at 5:30 am',
    },
    {
      name: 'reinject',
      interval: 'at 11:00 pm',
    },
    {
      name: 'sync',
      timeout: false,
      interval: 'every 10 minutes',
    },
  ],
});

const graceful = new Graceful({ brees: [bree] });
graceful.listen();

bree.start();
