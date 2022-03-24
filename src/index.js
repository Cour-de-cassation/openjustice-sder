const Graceful = require('@ladjs/graceful');
const Bree = require('bree');
const path = require('path');

const bree = new Bree({
  root: path.join(__dirname, 'jobs'),
  jobs: [
    {
      name: 'import',
      interval: 'every 11 minutes after 8:00am and before 12:00pm',
    },
  # {
  #     name: 'reinject',
  #     interval: 'every 5 minutes after 1:00pm and before 8:00pm',
  # },
    {
      name: 'sync2',
      interval: 'every 17 minutes after 9:00am and before 7:00pm',
    },
  ],
});

const graceful = new Graceful({ brees: [bree] });
graceful.listen();
bree.start();
