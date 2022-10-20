const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { MongoClient } = require('mongodb');

const ids = [];

async function main() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();

  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  let document;
  const cursor = await rawJurinet.find(
    { IND_ANO: 2, DT_MODIF_ANO: null, AUT_ANO: { $ne: 'LABEL' }, _indexed: { $ne: null } },
    { allowDiskUse: true },
  );
  while ((document = await cursor.next())) {
    const decision = await decisions.findOne({ sourceName: 'jurinet', sourceId: document._id });
    if (decision && decision.pseudoText) {
      let originalText = `${decision.originalText}`.trim();
      let pseudoText = `${decision.pseudoText}`.trim();
      if (pseudoText.length / originalText.length < 0.5) {
        let endOfOriginal = originalText.slice(-30);
        let endOfPseudo = pseudoText.slice(-30);
        console.log(`*** ${document._id}:`);
        console.log(endOfOriginal);
        console.log(endOfPseudo);
      }
      /*
      if (decision.pseudoText.split('\n').length > 2) {
        if (/cc$/gim.test(pseudoText)) {
          pseudoText = pseudoText.replace(/cc$/gim, '').trim();
        }
        if (/\w\s?[;.]$/gim.test(decision.pseudoText) === false) {
          let endOfFile = decision.pseudoText.slice(-30);
          if (
            /conseiller/i.test(endOfFile) === false &&
            /barreau/i.test(endOfFile) === false &&
            /magistrat/i.test(endOfFile) === false &&
            /greffier/i.test(endOfFile) === false &&
            /pr.+sident/i.test(endOfFile) === false
          ) {
            console.log(document._id, ':', endOfFile);
          }
        }
      }
      */
    }
  }
  await cursor.close();
  await client.close();
  return true;
}

main();
