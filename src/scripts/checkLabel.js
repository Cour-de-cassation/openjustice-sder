const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { MongoClient } = require('mongodb');

async function main() {
  await checkLabel();
}

async function checkLabel() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();

  const database = client.db('labelDb');
  const documents = database.collection('documents');
  const assignations = database.collection('assignations');

  let assignation;
  let index = 0;
  const assignationCursor = await assignations.find({}, { allowDiskUse: true });
  while ((assignation = await assignationCursor.next())) {
    index++;
    const documentId = assignation.documentId;
    const document = await documents.findOne({ _id: documentId });
    console.log(document !== null);
  }

  await client.close();
  return true;
}

main();
