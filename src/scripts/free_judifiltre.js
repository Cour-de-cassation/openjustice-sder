const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { MongoClient } = require('mongodb');
const { Judifiltre } = require('../judifiltre');
const { JudilibreIndex } = require('../judilibre-index');
const { JuricaUtils } = require('../jurica-utils');
const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);

async function main() {
  const client = new MongoClient(process.env.MONGO_URI, { directConnection: true });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  // NOP: const queueDocs = await Judifiltre.GetQueue();

  const queueDocs = await JudilibreIndex.find('mainIndex', { 'log.msg': /judifiltre/i });

  for (let i = 0; i < queueDocs.length; i++) {
    console.log(`free ${queueDocs[i]._id} (${i + 1}/${queueDocs.length})...`);

    try {
      let row = await rawJurica.findOne({ _id: parseInt(queueDocs[i]._id.split(':')[1], 10) });
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
          console.log('ok');
        } else {
          console.log('skip');
        }
      } else {
        console.log('NOK');
      }
    } catch (e) {
      console.error(e);
    }
  }

  await client.close();

  return true;
}

main();
