const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { MongoClient } = require('mongodb');
const { Judifiltre } = require('../judifiltre');
const { JudilibreIndex } = require('../judilibre-index');
const { DateTime } = require('luxon');
const { JuricaUtils } = require('../jurica-utils');

const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);

async function main() {
  const client = new MongoClient(process.env.MONGO_URI, { directConnection: true });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const failedDocs = await JudilibreIndex.find('mainIndex', { dateJudifiltre: { $ne: null } });
  console.log(failedDocs.length);
  for (let i = 0; i < failedDocs.length; i++) {
    console.log(`retry ${failedDocs[i]._id} (${i + 1}/${failedDocs.length})...`);
    try {
      let row = await rawJurica.findOne({ _id: parseInt(failedDocs[i]._id.split(':')[1], 10) });
      if (row) {
        let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
        if (normalized === null) {
          let normDec = await JuricaUtils.Normalize(row);
          normDec.originalText = JuricaUtils.removeMultipleSpace(normDec.originalText);
          normDec.originalText = JuricaUtils.replaceErroneousChars(normDec.originalText);
          normDec.pseudoText = JuricaUtils.removeMultipleSpace(normDec.pseudoText);
          normDec.pseudoText = JuricaUtils.replaceErroneousChars(normDec.pseudoText);
          normDec._version = decisionsVersion;
          const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
          normDec._id = insertResult.insertedId;
          await JudilibreIndex.indexDecisionDocument(normDec, null, 'import in decisions');
          console.log(`${row._id} done.`);
        } else {
          console.log(`${row._id} skipped (already in decisions).`);
        }
      } else {
        console.log(`${row._id} skipped (not there)).`);
      }
    } catch (e) {
      console.error(e);
    }
  }
  await client.close();
  console.log(`DONE.`);
  return true;
}

main();
