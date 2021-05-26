const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { MongoClient } = require('mongodb');

async function main() {
  let count = 50;
  if (process.argv[2]) {
    count = parseInt(process.argv[2], 10);
    if (isNaN(count)) {
      count = 50;
    }
  }
  await showLatest(count);
}

async function showLatest(count) {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();

  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);

  let jurinetDoc;
  let index = 0;
  const jurinetCursor = await rawJurinet.find({}, { allowDiskUse: true }).sort({ _id: -1 }).limit(count);
  while ((jurinetDoc = await jurinetCursor.next())) {
    index++;
    try {
      const numpourvoi = /numpourvoi[^>]*>([^<]+)<\/numpourvoi/i.exec(jurinetDoc.XML)[1];
      if (jurinetDoc.TYPE_ARRET !== 'CC') {
        console.log(
          `${index} - sourceId: ${jurinetDoc._id} [WinciCA], Pourvoi: ${numpourvoi}, Chambre: ${
            jurinetDoc.ID_CHAMBRE
          }, Date: ${jurinetDoc.DT_DECISION.toLocaleDateString()}`,
        );
      } else {
        console.log(
          `${index} - sourceId: ${jurinetDoc._id}, Pourvoi: ${numpourvoi}, Chambre: ${
            jurinetDoc.ID_CHAMBRE
          }, Date: ${jurinetDoc.DT_DECISION.toLocaleDateString()}`,
        );
      }
    } catch (e) {
      if (jurinetDoc.TYPE_ARRET !== 'CC') {
        console.log(
          `${index} - sourceId: ${jurinetDoc._id} [WinciCA], Pourvoi: N/A, Chambre: ${
            jurinetDoc.ID_CHAMBRE
          }, Date: ${jurinetDoc.DT_DECISION.toLocaleDateString()}`,
        );
      } else {
        console.log(
          `${index} - sourceId: ${jurinetDoc._id}, Pourvoi: N/A, Chambre: ${
            jurinetDoc.ID_CHAMBRE
          }, Date: ${jurinetDoc.DT_DECISION.toLocaleDateString()}`,
        );
      }
    }
  }

  await client.close();

  return true;
}

main();
