const path = require('path');
const helmet = require('helmet');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const express = require('express');
const app = express();
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'static')));
app.use(require(path.join(__dirname, '..', 'apis')));

async function main() {
  app.listen(process.env.API_PORT, () => {
    console.log(`OpenJustice - Start "server" job on port ${process.env.API_PORT}:`, new Date().toLocaleString());
  });
}

main();
