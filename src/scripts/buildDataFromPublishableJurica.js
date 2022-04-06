const { raw } = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

async function main() {
  const { JuricaUtils } = require('../jurica-utils');
  const { MongoClient, ObjectId } = require('mongodb');

  const jIndexConnection = new MongoClient(process.env.INDEX_DB_URI, {
    useUnifiedTopology: true,
  });
  await jIndexConnection.connect();
  const jIndexClient = jIndexConnection.db(process.env.INDEX_DB_NAME);
  const jIndexMain = jIndexClient.collection('mainIndex');
  const jIndexAffaires = jIndexClient.collection('affaires');
  const SDERClient = jIndexConnection.db(process.env.MONGO_DBNAME);
  const rawJurinet = SDERClient.collection('rawJurinet');
  const rawJurica = SDERClient.collection('rawJurica');
  const decisions = SDERClient.collection('decisions');

  const data = [];
  const juricaIds = [];
  let doc;
  let cursor = await decisions.find({ sourceName: 'jurica', labelStatus: 'exported' });
  while ((doc = await cursor.next())) {
    if (juricaIds.indexOf(doc.sourceId) === -1) {
      juricaIds.push(doc.sourceId);
      const rawJuricaDoc = await rawJurica.findOne({
        _id: doc.sourceId,
      });
      let isPublic = false;
      let isPartiallyPublic = false;
      try {
        isPublic = JuricaUtils.IsPublic(
          rawJuricaDoc.JDEC_CODNAC,
          rawJuricaDoc.JDEC_CODNACPART,
          rawJuricaDoc.JDEC_IND_DEC_PUB,
        );
      } catch (ignore) {}
      try {
        isPartiallyPublic = JuricaUtils.IsPartiallyPublic(
          rawJuricaDoc.JDEC_CODNAC,
          rawJuricaDoc.JDEC_CODNACPART,
          rawJuricaDoc.JDEC_IND_DEC_PUB,
        );
      } catch (ignore) {}
      if (isPublic || isPartiallyPublic) {
        data.push({
          raw: rawJuricaDoc,
          decision: doc,
          isPublic: isPublic,
          isPartiallyPublic: isPartiallyPublic,
        });
        console.log(`add jurica:${doc.sourceId}`);
      }
    }
  }

  await cursor.close();
  await jIndexConnection.close();

  fs.writeFileSync('dataFromJurica.json', JSON.stringify(data));

  console.log('jurica', juricaIds.length);
}

main();
