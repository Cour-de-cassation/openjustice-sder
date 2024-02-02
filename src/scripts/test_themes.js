const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { JuricaUtils } = require('../jurica-utils');

function main() {
  console.log(JuricaUtils.GetDecisionThemesForIndexing({ NACCode: '40E' }));
  console.log(JuricaUtils.GetDecisionThemesForIndexing({ NACCode: '40e' }));
  return true;
}

main();
