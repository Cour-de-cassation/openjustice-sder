const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Judifiltre } = require('../judifiltre');

async function main() {
  const batch1 = await Judifiltre.GetBatch();
  console.log(batch1);

  const batch2 = await Judifiltre.GetNotPublicBatch();
  console.log(batch2);
  return true;
}

main();
