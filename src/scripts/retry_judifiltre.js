const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { MongoClient } = require('mongodb');
const { Judifiltre } = require('../judifiltre');
const { JudilibreIndex } = require('../judilibre-index');
const { DateTime } = require('luxon');
const { JuricaUtils } = require('../jurica-utils');

const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);

async function main() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  /*
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
  */

  const failedDocs = await JudilibreIndex.find('mainIndex', { dateJudifiltre: { $ne: null } });
  console.log(failedDocs.length);
  for (let i = 0; i < failedDocs.length; i++) {
    /*
    if (failedDocs[i]._id === 'jurica:2483944') {
      continue;
    }
    if (failedDocs[i]._id === 'jurica:2483947') {
      continue;
    }
    */

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
          /*
          const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
          normDec._id = insertResult.insertedId;
          await JudilibreIndex.indexDecisionDocument(normDec, null, 'import in decisions');
          */
          console.log(`${row._id} done.`);
        } else {
          console.log(`${row._id} skipped (already in decisions).`);
        }
        /*
        const judifiltreResult = await Judifiltre.SendBatch([
          {
            sourceId: row._id,
            sourceDb: 'jurica',
            decisionDate: row.JDEC_DATE,
            jurisdictionName: row.JDEC_CODE_JURIDICTION,
            fieldCode: row.JDEC_CODNAC + (row.JDEC_CODNACPART ? '-' + row.JDEC_CODNACPART : ''),
            publicityClerkRequest:
              row.JDEC_IND_DEC_PUB === null
                ? 'unspecified'
                : parseInt(`${row.JDEC_IND_DEC_PUB}`, 10) === 1
                ? 'public'
                : 'notPublic',
          },
        ]);
        const existingDoc = await JudilibreIndex.findOne('mainIndex', { _id: `jurica:${row._id}` });
        if (existingDoc !== null) {
          let dateJudifiltre = DateTime.now();
          existingDoc.dateJudifiltre = dateJudifiltre.toISODate();
          await JudilibreIndex.replaceOne('mainIndex', { _id: existingDoc._id }, existingDoc, {
            bypassDocumentValidation: true,
          });
        }
        console.log(judifiltreResult);
        */
      } else {
        console.log(`${row._id} skipped (not there)).`);
      }
    } catch (e) {
      console.error(e);
    }
  }
  await client.close();
  return true;
}

main();
