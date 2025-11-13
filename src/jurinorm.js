const { MongoClient } = require("mongodb");

async function dbConnect() {
    const client = new MongoClient(process.env.MONGO_URI_RAWFILES, { directConnection: true });
    await client.connect();
    return client.db();
}

/**
 * 
 * @param {'CA' | 'CC'} sourceName 
 * @param { Record<string, unknown> } normDec 
 */
module.exports.sendToJurinorm = async function sendToJurinorm(sourceName, normDec) {
    const database = await dbConnect()
    const decisions = database.collection(
        sourceName === 'CC' ? process.env.COLLECTION_JURINET_RAWFILES : 
        sourceName === 'CA' ? process.env.COLLECTION_JURICA_RAWFILES :
        undefined
    );

    return decisions.insertOne({ path: null, events: [{ type: 'created', date: new Date() }], metadatas: normDec })
}