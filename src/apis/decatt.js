const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { JurinetOracle } = require('../jurinet-oracle');
const { JuricaOracle } = require('../jurica-oracle');

const express = require('express');
const api = express.Router();

api.get('/decatt/:id', async (req, res) => {
  res.json(await decatt(parseInt(req.params.id, 10)));
});

async function decatt(id) {
  let decatt = null;

  const jurinetSource = new JurinetOracle({
    verbose: false,
  });
  await jurinetSource.connect();

  const juricaSource = new JuricaOracle({
    verbose: false,
  });
  await juricaSource.connect();

  try {
    const decattInfo = await jurinetSource.getDecatt(id);
    decatt = await juricaSource.getDecisionIdByDecattInfo(decattInfo);
  } catch (e) {
    console.error(`Decatt failed for decision ${id}:`, e);
    decatt = null;
  }

  await jurinetSource.close();
  await juricaSource.close();

  if (decatt) {
    return {
      found: true,
      id: id,
      decatt: decatt,
    };
  }
  return {
    found: false,
    id: id,
  };
}

module.exports = api;
