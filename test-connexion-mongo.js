const { MongoClient } = require("mongodb");

const uri = "mongodb://user:password@localhost:27017/db";

async function insertDocument() {
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

    try {
        await client.connect();
        const database = client.db("db");
        const collection = database.collection("collection");
        const documentToInsert = { name: "proces_1" };
        const result = await collection.insertOne(documentToInsert);
        console.log(`Document inséré avec l'ID : ${result.insertedId}`);
    } catch (error) {
        console.error("Une erreur s'est produite :", error);
    } finally {
        await client.close();
    }
}

insertDocument();
