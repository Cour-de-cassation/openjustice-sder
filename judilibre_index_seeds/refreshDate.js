const { MongoClient } = require('mongodb');
if (!process.env.NODE_ENV) require('dotenv').config();

function setDate(dateRef, day, month) {
  const date = new Date(dateRef.toISOString())
  date.setDate(day > 28 ? 28: day)
  date.setMonth(month)
  return date
}

async function refreshIndex(db, date) {
  const decisions = await db.collection('mainIndex').find();

  return decisions
    .map(({ _id, date: decisionDate, lastOperation, dateImport, dateExport, log }) =>
      db.collection('mainIndex').updateOne(
        { _id },
        {
          $set: {
            date: setDate(date, (new Date(decisionDate)).getDate(), date.getMonth() -1).toISOString().slice(0, 10),
            lastOperation: lastOperation ? date.toISOString().slice(0, 10) : null,
            dateImport: dateImport ? date.toISOString().slice(0, 10) : null,
            dateExport: dateExport ? date.toISOString().slice(0, 10) : null,
            log: log.map((l) => ({ ...l, date })),
          },
        },
      ),
    )
    .toArray();
}

async function main() {
  const client = new MongoClient(process.env.INDEX_DB_URI);
  const db = client.db();
  await client.connect();

  const input = process.argv[2];
  const date = new Date(input * 1000);
  if (!(date instanceof Date) || isNaN(date.valueOf()))
    throw new Error(`script.js [date]: waiting for an unix epoch date valid (input: ${input})`);

  return refreshIndex(db, date);
}

main()
  .then((_) => console.log(`update successfull: ${_.length} documents`))
  .catch(console.error)
  .finally((_) => process.exit());
