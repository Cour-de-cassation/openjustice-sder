const Graceful = require('@ladjs/graceful');
const Bree = require('bree');
const path = require('path');

const bree = new Bree({
  root: path.join(__dirname, 'jobs'),
  jobs: [
    {
      name: 'import',
      interval: 'every 13 minutes after 8:00am and before 12:00pm',
    },
    {
      name: 'reinject',
      interval: 'every 17 minutes after 2:05pm and before 10:00 pm',
    },
    /*
    {
      name: 'sync',
      interval: 'every 23 minutes after 9:00am and before 9:00pm',
    },
    */
    {
      name: 'sync2',
      interval: 'every 29 minutes after 9:00am and before 9:00pm',
    },
  ],
});

const graceful = new Graceful({ brees: [bree] });
graceful.listen();
bree.start();
