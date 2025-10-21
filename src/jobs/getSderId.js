/**
 * 21/10/2025 - Julien Grach
 * 
 * JudilibreIndex en tant qu'outil de monitoring de décision a été remplacé par JuriPilot
 * 
 * JudilibreIndex comme gestionnaire d'exceptions est voué à être remplacé par un système plus robuste concernant 
 * l'entièreté des décisions (CC, CA mais aussi TJ, TCOM ...).
 * 
 * JudilibreIndex comme gestionnaire de l'affaire est voué à être remplacé par un système plus générique permettant également
 * le chaînage des termes de remplacements. On espère pouvoir tirer les timeline de ce nouveau projet plutôt que de JudilibreIndex.
 * 
 * Néanmoins, le travail du décommissionnement des affaires de judilibreIndex est en cours et ne sera pas fini sans reprise.
 * Il empêche de retrouver le SDER_ID et JURILIBRE_ID en direct depuis DBSDER à la réception d'une nouvelle décision.
 * Pour palier à ce problème et éviter des effets de bords non mesurés, je crée ce nouveau batch qui a pour objectif de récupérer
 * les ID DBSDER nouvellement crées et qui les positionnera dans JudilibreIndex.
 * Je fais ce travail sans avoir une pleine conscience de l'utilisation du SDER_ID et de JUDILIBRE_ID, notamment dans le reste du
 * système. Au mieux, il évitera les effets de bords, au pire, il est inutile. Ca reste un script sparadrap.
 * 
 * J'ose espérer cependant que nous pourrons rapidement décommissionner cet outil (judilibreIndex).
 */

const { MongoClient } = require("mongodb");
const { CustomLog } = require("../utils/logger");
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const dbsderClient = new MongoClient(process.env.MONGO_URI, { directConnection: true });
const indexClient = new MongoClient(process.env.INDEX_DB_URI, { directConnection: true });

async function importDbsder() {
    const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const client = await dbsderClient.connect()
    const database = client.db(process.env.MONGO_DBNAME);
    const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

    return decisions.find({ 
        sourceName: { $in: ["jurinet", "jurica"] }, 
        firstImportDate: { $gte: YESTERDAY.toISOString().split('T')[0] } })
}

async function addSderIdToIndex(sourceId, sourceName, sderId) {
    const jIndexConnection = await indexClient.connect()
    const jIndexClient = jIndexConnection.db(process.env.INDEX_DB_NAME);
    const jIndexMain = jIndexClient.collection('mainIndex');

    return jIndexMain.updateOne({ _id: `${sourceName}:${sourceId}`, sderId: null }, { $set: { sderId } })
}

async function main() {
    CustomLog.log("info", { operationName: "batch getSderId", msg: "starting getSderId" })
    const cursor = await importDbsder()

    for await (const doc of cursor) {
        try {
            const update = await addSderIdToIndex(doc.sourceId, doc.sourceName, doc._id)
            if (update.modifiedCount > 0)
                CustomLog.log("info", { operationName: "batch getSderId", msg: `sderId: ${doc._id} added to ${doc.sourceName}:${doc.sourceId}` })
            else 
                CustomLog.log("info", { operationName: "batch getSderId", msg: `sderId: ${doc._id} already known to ${doc.sourceName}:${doc.sourceId}` })
        } catch (err) {
            CustomLog.log("error", { operationName: "batch getSderId", msg: `error while adding sderId: ${doc._id} to ${doc.sourceName}:${doc.sourceId}`, data: err.stack})
        }
    }
}

main().finally(async _ => {
    dbsderClient.close()
    indexClient.close()
    CustomLog.log("info", { operationName: "batch getSderId", msg: `getSderId finished` })
})
