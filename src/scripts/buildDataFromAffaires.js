const { raw } = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

async function main() {
  const { JuricaUtils } = require('../jurica-utils');
  const { MongoClient, ObjectId } = require('mongodb');

  const jIndexConnection = new MongoClient(process.env.INDEX_DB_URI);
  await jIndexConnection.connect();
  const jIndexClient = jIndexConnection.db(process.env.INDEX_DB_NAME);
  const jIndexMain = jIndexClient.collection('mainIndex');
  const jIndexAffaires = jIndexClient.collection('affaires');
  const SDERClient = jIndexConnection.db(process.env.MONGO_DBNAME);
  const rawJurinet = SDERClient.collection('rawJurinet');
  const rawJurica = SDERClient.collection('rawJurica');
  const decisions = SDERClient.collection('decisions');

  const data = [];
  const jurinetIds = [];
  const juricaIds = [];
  let doc;
  let cursor = await jIndexAffaires.find({ ids: { $ne: [] } });
  while ((doc = await cursor.next())) {
    let hasStuff = false;
    const jurinetDocs = [];
    const juricaDocs = [];
    if (Array.isArray(doc.ids) && doc.ids.length > 0) {
      for (let i = 0; i < doc.ids.length; i++) {
        if (doc.ids[i].indexOf('jurinet') !== -1 && jurinetIds.indexOf(doc.ids[i]) === -1) {
          jurinetIds.push(doc.ids[i]);
          const jurinetDoc = await decisions.findOne({
            sourceName: 'jurinet',
            sourceId: parseInt(doc.ids[i].split(':')[1]),
          });
          if (jurinetDoc !== null && jurinetDoc.labelStatus === 'exported') {
            const rawJurinetDoc = await rawJurinet.findOne({
              _id: parseInt(doc.ids[i].split(':')[1]),
            });
            jurinetDocs.push({
              raw: rawJurinetDoc,
              decision: jurinetDoc,
            });
            hasStuff = true;
            console.log(`add ${doc.ids[i]}`);
          }
        } else if (doc.ids[i].indexOf('jurica') !== -1 && juricaIds.indexOf(doc.ids[i]) === -1) {
          juricaIds.push(doc.ids[i]);
          const juricaDoc = await decisions.findOne({
            sourceName: 'jurica',
            sourceId: parseInt(doc.ids[i].split(':')[1]),
          });
          if (juricaDoc !== null && juricaDoc.labelStatus === 'exported') {
            const rawJuricaDoc = await rawJurica.findOne({
              _id: parseInt(doc.ids[i].split(':')[1]),
            });
            let isPublic = false;
            let isPartiallyPublic = false;
            try {
              isPublic = await JuricaUtils.IsPublic(
                rawJuricaDoc.JDEC_CODNAC,
                rawJuricaDoc.JDEC_CODNACPART,
                rawJuricaDoc.JDEC_IND_DEC_PUB,
              );
            } catch (ignore) {}
            try {
              isPartiallyPublic = await JuricaUtils.IsPartiallyPublic(
                rawJuricaDoc.JDEC_CODNAC,
                rawJuricaDoc.JDEC_CODNACPART,
                rawJuricaDoc.JDEC_IND_DEC_PUB,
              );
            } catch (ignore) {}
            juricaDocs.push({
              raw: rawJuricaDoc,
              decision: juricaDoc,
              isPublic: isPublic,
              isPartiallyPublic: isPartiallyPublic,
            });
            hasStuff = true;
            console.log(`add ${doc.ids[i]}`);
          }
        }
      }
    }
    if (hasStuff === true) {
      fs.writeFileSync(
        `judilibre_data/dataFromAffaires_${doc._id}.json`,
        JSON.stringify({
          affaire: doc,
          jurinet: jurinetDocs,
          jurica: juricaDocs,
        }),
      );
    }
  }

  await cursor.close();
  await jIndexConnection.close();

  console.log('jurinet', jurinetIds.length);
  console.log('jurica', juricaIds.length);
}

main();
