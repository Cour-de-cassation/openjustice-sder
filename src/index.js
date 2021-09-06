const Graceful = require('@ladjs/graceful');
const Bree = require('bree');
const path = require('path');

const bree = new Bree({
  root: path.join(__dirname, 'jobs'),
  jobs: [
    /*
    {
      name: 'server', // on start
    },
    */
    {
      name: 'import',
      interval: 'every 13 minutes after 8:00am and before 12:00pm',
      // hyperv? interval: 'every 13 minutes after 4:00am and before 9:30pm',
    },
    {
      name: 'reinject',
      interval: 'at 12:00 am',
    },
    {
      name: 'sync',
      interval: 'every 17 minutes after 8:30am and before 11:30pm',
      // hyperv? interval: 'every 17 minutes after 4:30am and before 9:00pm',
    },
    {
      name: 'cleanup',
      interval: 'every 19 minutes',
    },
  ],
});

const graceful = new Graceful({ brees: [bree] });
graceful.listen();

bree.start();
