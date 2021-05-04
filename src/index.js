const Graceful = require('@ladjs/graceful');
const Bree = require('bree');
const ms = require('ms');
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
      interval: 'every 7 minutes after 9:00am and before 11:00pm',
    },
  ],
});

const graceful = new Graceful({ brees: [bree] });
graceful.listen();

bree.start();
