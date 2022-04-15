const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Judifiltre } = require('../judifiltre');

async function main() {
  const batch = await Judifiltre.GetBatch();
  console.log(batch);
  return true;
}

main();
