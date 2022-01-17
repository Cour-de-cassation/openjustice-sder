const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { Judifiltre } = require('../judifiltre');

async function main() {
  const result = await Judifiltre.SendBatch([
    {
      decisionDate: new Date(),
      sourceDb: 'jurica',
      // sourceId: Integer,
      jurisdiction: 'CA_ROUEN',
      clerkRequest: 'unspecified',
      fieldCode: 'AAA',
    },
  ]);

  console.log(result);

  return true;
}

main();
