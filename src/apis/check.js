const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { JurinetOracle } = require('../jurinet-oracle');
const { JuricaOracle } = require('../jurica-oracle');
const { MongoClient } = require('mongodb');

const express = require('express');
const api = express.Router();

api.get('/check/:id', async (req, res) => {
  res.header('Content-Type', 'application/json');
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

  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();

  const juricaSource = new JuricaOracle();
  await juricaSource.connect();

  try {
    const oracleJurinet = await jurinetSource.getDecisionByID(parseInt(id, 10));
    result.oracle.jurinet = oracleJurinet;
  } catch (e) {
    result.oracle.jurinet = null;
  }

  try {
    const oracleJurica = await juricaSource.getDecisionByID(parseInt(id, 10));
    result.oracle.jurica = oracleJurica;
  } catch (e) {
    result.oracle.jurica = null;
  }

  await jurinetSource.close();
  await juricaSource.close();

  try {
    // MongoDB is unreachable through the VPN...
    const client = new MongoClient(process.env.MONGO_URI, {
      useUnifiedTopology: true,
    });
    await client.connect();
    const database = client.db(process.env.MONGO_DBNAME);
    const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
    const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
    const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

    try {
      const mngJurinet = await rawJurinet.findOne({ _id: parseInt(id, 10) });
      result.mongodb.jurinet = mngJurinet;
    } catch (e) {
      result.mongodb.jurinet = null;
    }

    try {
      const mngJurica = await rawJurica.findOne({ _id: parseInt(id, 10) });
      result.mongodb.jurica = mngJurica;
    } catch (e) {
      result.mongodb.jurica = null;
    }

    try {
      let decision = null;
      let mngDecisions = null;
      const cursor = await decisions.find({ sourceId: parseInt(id, 10) }, { allowDiskUse: true });
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
      result.mongodb.decisions = null;
    }

    await client.close();
  } catch (ignore) {}

  return result;
}

module.exports = api;
