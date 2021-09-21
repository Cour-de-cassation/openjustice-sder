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
      interval: 'at 9:30 pm',
    },
    {
      name: 'sync',
      interval: 'every 23 minutes after 9:30am and before 9:30pm',
    },
  ],
});

const graceful = new Graceful({ brees: [bree] });
graceful.listen();

bree.start();
