const Graceful = require('@ladjs/graceful');
const Bree = require('bree');
const path = require('path');

const bree = new Bree({
  root: path.join(__dirname, 'jobs'),
  jobs: [
    {
      name: 'import',
      interval: 'at 4:30 am',
    },
    {
      name: 'reinject',
      interval: 'at 12:00 am', // midnight
    },
  ],
});

const graceful = new Graceful({ brees: [bree] });
graceful.listen();

bree.start();
