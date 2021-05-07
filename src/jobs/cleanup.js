const { parentPort } = require('worker_threads');
const glob = require('glob');
const ms = require('ms');
const path = require('path');
const fs = require('fs');

let selfKill = setTimeout(cancel, ms('15m'));

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
  console.log('OpenJustice - Start "cleanup" job:', new Date().toLocaleString());
  glob('/root/core.*', function (err, files) {
    if (err) {
      console.error('Cleanup error (1)', err);
    } else {
      files.forEach((file) => {
        try {
          fs.unlinkSync(file);
          console.log(`Cleanup: remove '${file}'.`);
        } catch (e) {
          console.error('Cleanup error (2)', e);
        }
      });
    }
    console.log('OpenJustice - End "cleanup" job:', new Date().toLocaleString());
    setTimeout(end, ms('1s'));
  });
}

main();
