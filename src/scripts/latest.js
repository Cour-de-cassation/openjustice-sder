const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { JurinetOracle } = require('../jurinet-oracle');
const { MongoClient } = require('mongodb');

async function main() {
  let count;
  if (process.argv[2]) {
    count = parseInt(process.argv[2], 10);
  }
  if (isNaN(count)) {
    count = 10;
  }
  await showOracleJurinetLatest(count);
  await showMongoJurinetLatest(count);
}

async function showOracleJurinetLatest(count) {
  const jurinetOrder = 'DESC';
  const jurinetBatch = count;
  const jurinetSource = new JurinetOracle();
  const jurinetOffset = 0;

  await jurinetSource.connect();
  const jurinetResult = await jurinetSource.getBatch({
    offset: jurinetOffset,
    limit: jurinetBatch,
    order: jurinetOrder,
    onlyTreated: false,
  });
  await jurinetSource.close();

  console.log(`\nOracle 'Jurinet', latest ${count} decisions:`);
  for (let i = 0; i < jurinetResult.length; i++) {
    let jurinetDoc = jurinetResult[i];
    let index = i + 1;
    try {
      const numpourvoi = /numpourvoi[^>]*>([^<]+)<\/numpourvoi/i.exec(jurinetDoc.XML)[1];
      if (jurinetDoc.TYPE_ARRET !== 'CC') {
        console.log(
          `${index}.\tsourceId: ${jurinetDoc._id} [CA]\tPourvoi: ${numpourvoi}\tChambre: ${
            jurinetDoc.ID_CHAMBRE
          }\tDate: ${jurinetDoc.DT_DECISION.toLocaleDateString()}`,
        );
      } else {
        console.log(
          `${index}.\tsourceId: ${jurinetDoc._id}\tPourvoi: ${numpourvoi}\tChambre: ${
            jurinetDoc.ID_CHAMBRE
          }\tDate: ${jurinetDoc.DT_DECISION.toLocaleDateString()}`,
        );
      }
    } catch (e) {
      if (jurinetDoc.TYPE_ARRET !== 'CC') {
        console.log(
          `${index}.\tsourceId: ${jurinetDoc._id} [CA]\tPourvoi: N/A\tChambre: ${
            jurinetDoc.ID_CHAMBRE
          }\tDate: ${jurinetDoc.DT_DECISION.toLocaleDateString()}`,
        );
      } else {
        console.log(
          `${index}.\tsourceId: ${jurinetDoc._id}\tPourvoi: N/A\tChambre: ${
            jurinetDoc.ID_CHAMBRE
          }\tDate: ${jurinetDoc.DT_DECISION.toLocaleDateString()}`,
        );
      }
    }
  }

  return true;
}

async function showMongoJurinetLatest(count) {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();

  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);

  let jurinetDoc;
  let index = 0;
  console.log(`\nMongoDB 'rawJurinet', latest ${count} decisions:`);
  const jurinetCursor = await rawJurinet.find({}, { allowDiskUse: true }).sort({ _id: -1 }).limit(count);
  while ((jurinetDoc = await jurinetCursor.next())) {
    index++;
    try {
      const numpourvoi = /numpourvoi[^>]*>([^<]+)<\/numpourvoi/i.exec(jurinetDoc.XML)[1];
      if (jurinetDoc.TYPE_ARRET !== 'CC') {
        console.log(
          `${index}.\tsourceId: ${jurinetDoc._id} [CA]\tPourvoi: ${numpourvoi}\tChambre: ${
            jurinetDoc.ID_CHAMBRE
          }\tDate: ${jurinetDoc.DT_DECISION.toLocaleDateString()}`,
        );
      } else {
        console.log(
          `${index}.\tsourceId: ${jurinetDoc._id}\tPourvoi: ${numpourvoi}\tChambre: ${
            jurinetDoc.ID_CHAMBRE
          }\tDate: ${jurinetDoc.DT_DECISION.toLocaleDateString()}`,
        );
      }
    } catch (e) {
      if (jurinetDoc.TYPE_ARRET !== 'CC') {
        console.log(
          `${index}.\tsourceId: ${jurinetDoc._id} [CA]\tPourvoi: N/A\tChambre: ${
            jurinetDoc.ID_CHAMBRE
          }\tDate: ${jurinetDoc.DT_DECISION.toLocaleDateString()}`,
        );
      } else {
        console.log(
          `${index}.\tsourceId: ${jurinetDoc._id}\tPourvoi: N/A\tChambre: ${
            jurinetDoc.ID_CHAMBRE
          }\tDate: ${jurinetDoc.DT_DECISION.toLocaleDateString()}`,
        );
      }
    }
  }

  await client.close();

  return true;
}

main();
