const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const express = require('express');
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(require('../apis'));

async function main() {
  app.listen(process.env.API_PORT, () => {
    console.log(`OpenJustice - Start "server" job on port ${process.env.API_PORT}:`, new Date().toLocaleString());
  });
}

main();
