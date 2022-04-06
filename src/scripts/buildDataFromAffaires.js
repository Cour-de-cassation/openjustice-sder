const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

async function main() {
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

  const jurinetIds = [];
  const juricaIds = [];
  let doc;
  let cursor = await jIndexAffaires.find({ ids: { $ne: [] } });
  while ((doc = await cursor.next())) {
    if (Array.isArray(doc.ids) && doc.ids.length > 0) {
      for (let i = 0; i < doc.ids.length; i++) {
        if (doc.ids[i].indexOf('jurinet') !== -1 && jurinetIds.indexOf(doc.ids[i]) === -1) {
          const jurinetDoc = await decisions.findOne({
            sourceName: 'jurinet',
            sourceId: parseInt(doc.ids[i].split(':')[1]),
          });
          if (jurinetDoc !== null) {
            // && (jurinetDoc.labelStatus === 'done' || jurinetDoc.labelStatus === 'exported')) {
            console.log(`add ${doc.ids[i]}`);
            jurinetIds.push(doc.ids[i]);
          }
        } else if (doc.ids[i].indexOf('jurica') !== -1 && juricaIds.indexOf(doc.ids[i]) === -1) {
          const juricaDoc = await decisions.findOne({
            sourceName: 'jurica',
            sourceId: parseInt(doc.ids[i].split(':')[1]),
          });
          if (juricaDoc !== null) {
            // && (juricaDoc.labelStatus === 'done' || juricaDoc.labelStatus === 'exported')) {
            console.log(`add ${doc.ids[i]}`);
            juricaIds.push(doc.ids[i]);
          }
        }
      }
    }
  }

  await cursor.close();
  await jIndexConnection.close();

  console.log('jurinet', jurinetIds.length);
  console.log('jurica', juricaIds.length);
}

main();
