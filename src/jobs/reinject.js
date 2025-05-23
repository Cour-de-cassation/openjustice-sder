const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { JurinetOracle } = require('../jurinet-oracle');
const { JuricaOracle } = require('../jurica-oracle');
const { JudilibreIndex } = require('../judilibre-index');
const { MongoClient } = require('mongodb');
const ms = require('ms');
const { CustomLog } = require('./../utils/logger')

let selfKill = setTimeout(cancel, ms('1h'));

function end() {
  clearTimeout(selfKill);
  if (parentPort) parentPort.postMessage('done');
  kill(0);
}

function cancel() {
  clearTimeout(selfKill);
  if (parentPort) parentPort.postMessage('cancelled');
  kill(1);
}

function kill(code) {
  process.exit(code);
}

async function main() {
  console.log('OpenJustice - Start "reinject" job:', new Date().toLocaleString());
  try {
    await reinjectJurinet();
  } catch (e) {
    console.error('Jurinet reinject error', e);
  }
  try {
    await reinjectJurica();
  } catch (e) {
    console.error('Jurica reinject error', e);
  }
  console.log('OpenJustice - End "reinject" job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

async function reinjectJurinet() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();

  console.log('Retrieve all "done" decisions for Jurinet...');
  let decision,
    successCount = 0,
    errorCount = 0;
  const cursor = await decisions
    .find({ labelStatus: 'done', publishStatus: 'toBePublished', sourceName: 'jurinet' }, { allowDiskUse: true })
    .sort({ sourceId: -1 });
  while ((decision = await cursor.next())) {
    try {
      if (decision && decision[process.env.MONGO_ID]) {
        console.log(`check CC decision ${decision.sourceId} for reinjection...`);
        let raw = await rawJurinet.findOne({ _id: decision.sourceId });
        if (raw) {
          console.log(`reinject CC decision ${decision.sourceId}...`);
          await jurinetSource.reinject(decision);
        } else {
          console.log(`skip reinject CC decision ${decision.sourceId}...`);
        }
        const reinjected = await jurinetSource.getDecisionByID(decision.sourceId);
        reinjected._indexed = null;
        reinjected.DT_ANO = new Date();
        reinjected.DT_MODIF = new Date();
        reinjected.DT_MODIF_ANO = new Date();
        await rawJurinet.replaceOne({ _id: reinjected._id }, reinjected, { bypassDocumentValidation: true });
        decision.labelStatus = 'exported';
        decision.publishStatus = 'toBePublished';
        decision.dateCreation = new Date().toISOString();
        await decisions.replaceOne({ _id: decision[process.env.MONGO_ID] }, decision, {
          bypassDocumentValidation: true,
        });
        // @todo-oddj-dashboard: decision CC (decision.sourceName, decision.sourceId) libérée par Label, réinjectée dans Oracle et prête à être publiée
        CustomLog.log("info", {
          operationName: "ReinjectJurinet",
          msg: `decision ${decision.sourceName} ${decision.sourceId} released by Label, re-injected into Oracle and ready for publication `,
          data: {
            _id: decision._id,
            sourceId: decision.sourceId,
            sourceName: decision.sourceName,
            labelStatus: decision.labelStatus,
            publishStatus: decision.publishStatus,
            jurisdictionId: decision.jurisdictionId,
            jurisdictionName: decision.jurisdictionName
          }
        });
        if (raw && raw.IND_ANO !== 2) {
          await JudilibreIndex.updateDecisionDocument(decision, null, 'reinject');
        } else {
          await JudilibreIndex.updateDecisionDocument(decision, null, 'skip reinject');
        }
        successCount++;
      }
    } catch (e) {
      // @todo-oddj-dashboard: erreur lors de la réinjection dans Oracle de la decision CC (decision.sourceName, decision.sourceId, e)
      CustomLog.log("error", {
        operationName: "ReinjectJurinetError",
        msg: `Error during Jurinet decision injection in Oracle ${decision.sourceName} ${decision.sourceId} ${e} `,
        data: {
          _id: decision._id,
          sourceId: decision.sourceId,
          sourceName: decision.sourceName,
        }
      });
      await JudilibreIndex.updateDecisionDocument(decision, null, null, e);
      errorCount++;
    }
  }
  CustomLog.log("info", {
    operationName: "ReinjectJurinetSkip",
    msg: `Jurinet reinjection done (success: ${successCount}, errors: ${errorCount}).`,
  });
  await cursor.close();
  await jurinetSource.close();
  await client.close();
  return true;
}

async function reinjectJurica() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const juricaSource = new JuricaOracle();
  await juricaSource.connect();

  CustomLog.log("info", {
    operationName: "ReinjectJuricaSkip",
    msg: `Retrieve all "done" decisions for Jurica...`,
  });
  let decision,
    successCount = 0,
    errorCount = 0;
  const cursor = await decisions.find(
    { labelStatus: 'done', publishStatus: 'toBePublished', sourceName: 'jurica' },
    { allowDiskUse: true },
  );
  while ((decision = await cursor.next())) {
    try {
      if (decision && decision[process.env.MONGO_ID]) {
        console.log(`check CA decision ${decision.sourceId} for reinjection...`);
        let raw = await rawJurica.findOne({ _id: decision.sourceId });
        if (raw) {
          console.log(`reinject CA decision ${decision.sourceId}...`);
          await juricaSource.reinject(decision);
        } else {
          console.log(`skip reinject CA decision ${decision.sourceId}...`);
        }
        const reinjected = await juricaSource.getDecisionByID(decision.sourceId);
        reinjected._indexed = null;
        reinjected.DT_ANO = new Date();
        reinjected.DT_MODIF = new Date();
        reinjected.DT_MODIF_ANO = new Date();
        await rawJurica.replaceOne({ _id: reinjected._id }, reinjected, { bypassDocumentValidation: true });
        decision.labelStatus = 'exported';
        decision.publishStatus = 'toBePublished';
        decision.dateCreation = new Date().toISOString();
        await decisions.replaceOne({ _id: decision[process.env.MONGO_ID] }, decision, {
          bypassDocumentValidation: true,
        });
        // @todo-oddj-dashboard: decision CA (decision.sourceName, decision.sourceId) libérée par Label, réinjectée dans Oracle et prête à être publiée
        CustomLog.log("info", {
          operationName: "ReinjectJurica",
          msg: `decision ${decision.sourceName} ${decision.sourceId} released by Label, re-injected into Oracle and ready for publication `,
          data: {
            _id: decision._id,
            sourceId: decision.sourceId,
            sourceName: decision.sourceName,
            labelStatus: decision.labelStatus,
            publishStatus: decision.publishStatus,
            jurisdictionId: decision.jurisdictionId,
            jurisdictionName: decision.jurisdictionName
          }
        });
        if (raw && raw.IND_ANO !== 2) {
          await JudilibreIndex.updateDecisionDocument(decision, null, 'reinject');
        } else {
          await JudilibreIndex.updateDecisionDocument(decision, null, 'skip reinject');
        }
        successCount++;
      }
    } catch (e) {
      // @todo-oddj-dashboard: erreur lors de la réinjection dans Oracle de la decision CA (decision.sourceName, decision.sourceId, e)
      CustomLog.log("error", {
        operationName: "ReinjectJuricaError",
        msg: `Jurica reinjection error processing decision ${decision.sourceName} ${decision.sourceId}  ${e}`,
        data: {
          _id: decision._id,
          sourceId: decision.sourceId,
          sourceName: decision.sourceName,
        }
      });
      await JudilibreIndex.updateDecisionDocument(decision, null, null, e);
      errorCount++;
    }
  }
  CustomLog.log("info", {
    operationName: "ReinjectJuricaSkip",
    msg: `Jurica reinjection done (success: ${successCount}, errors: ${errorCount}).`,
  });
  await cursor.close();
  await juricaSource.close();
  await client.close();
  return true;
}

main();
