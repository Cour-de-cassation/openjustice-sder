const Graceful = require('@ladjs/graceful');
const Bree = require('bree');

const bree = new Bree({
  jobs: [
    {
      name: 'reinject',
      interval: 'every 5 minutes',
    },
  ],
});

const graceful = new Graceful({ brees: [bree] });
graceful.listen();

bree.start();
