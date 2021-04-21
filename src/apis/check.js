const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { JurinetOracle } = require('../jurinet-oracle');
const { JuricaOracle } = require('../jurica-oracle');
const { MongoClient } = require('mongodb');

const express = require('express');
const api = express.Router();

api.get('/check/:id', async (req, res) => {
  res.header('Content-Type', 'application/json')
  res.send(JSON.stringify(await check(req.params.id), null, 2));
});

async function check(id) {
  let result = {
    oracle: {
      jurinet: null,
      jurica: null,
    },
    mongodb: {
      jurinet: null,
      jurica: null,
      decisions: null,
    },
  };

  const jurinetSource = new JurinetOracle({
    verbose: false,
  });
  await jurinetSource.connect();

  const juricaSource = new JuricaOracle({
    verbose: false,
  });
  await juricaSource.connect();

  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  try {
    const oracleJurinet = await jurinetSource.getDecisionByID(id);
    result.oracle.jurinet = oracleJurinet;
  } catch (e) {
    result.oracle.jurinet = null;
  }

  try {
    const oracleJurica = await juricaSource.getDecisionByID(id);
    result.oracle.jurica = oracleJurica;
  } catch (e) {
    result.oracle.jurica = null;
  }

  try {
    const mngJurinet = await rawJurinet.findOne({ _id: id });
    result.mongodb.jurinet = mngJurinet;
  } catch (e) {
    console.error(e)
    result.mongodb.jurinet = null;
  }

  try {
    const mngJurica = await rawJurica.findOne({ _id: id });
    result.mongodb.jurica = mngJurica;
  } catch (e) {
    console.error(e)
    result.mongodb.jurica = null;
  }

  try {
    let decision = null;
    let mngDecisions = null;
    const cursor = await decisions.find({ sourceId: id }, { allowDiskUse: true });
    while ((decision = await cursor.next())) {
      if (decision) {
        if (mngDecisions === null) {
          mngDecisions = [];
        }
        mngDecisions.push(decision);
      }
    }
    result.mongodb.decisions = mngDecisions;
  } catch (e) {
    console.error(e)
    result.mongodb.decisions = null;
  }

  await client.close();
  await jurinetSource.close();
  await juricaSource.close();

  return result;
}

module.exports = api;
