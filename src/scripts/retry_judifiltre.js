const { fail } = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { Judifiltre } = require('../judifiltre');
const { JudilibreIndex } = require('../judilibre-index');

async function main() {
  const failedDocs = await JudilibreIndex.find('mainIndex', {
    $or: [
      {
        'log.msg': /service unavailable/i,
      },
      {
        'log.msg': /bad gateway/i,
      },
    ],
  });

  console.log(failedDocs.length);

  for (let i = 0; i < failedDocs.length; i++) {
    console.log(failedDocs[i]._id);
  }

  /*
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
  */

  return true;
}

main();
