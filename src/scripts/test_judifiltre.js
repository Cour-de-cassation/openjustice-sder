const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { Judifiltre } = require('../judifiltre');

async function main() {
  /*
  const result = await Judifiltre.SendBatch([
    {
      // sourceId: Integer,
      sourceDb: 'jurica',
      decisionDate: new Date(),
      jurisdictionName: 'CA_ROUEN',
      fieldCode: 'AAA',
      publicityClerkRequest: 'unspecified',
    },
  ]);
  */

  const batch = await Judifiltre.GetBatch();

  console.log(batch);

  const queue = await Judifiltre.GetQueue();

  console.log(queue);

  return true;
}

main();
