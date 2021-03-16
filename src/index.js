const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

function runScript(scriptPath, shortFlag, callback) {
  let invoked = false;
  const process = childProcess.fork(scriptPath, [shortFlag ? 'short' : 'long'], {
    cwd: '/home/openjustice/openjustice-sder/',
  });
  process.on('error', (err) => {
    if (invoked) return;
    invoked = true;
    callback(err);
  });

  process.on('exit', (code) => {
    if (invoked) return;
    invoked = true;
    var err = code === 0 ? null : new Error('exit code ' + code);
    callback(err);
  });
}

/*
fs.writeFileSync(path.join(__dirname, 'offset.history'), '0')
fs.writeFileSync(path.join(__dirname, 'offset_jurica.history'), '0')
fs.writeFileSync(path.join(__dirname, 'emptyround.history'), '0')
fs.writeFileSync(path.join(__dirname, 'emptyround_jurica.history'), '0')
*/

function main() {
  let jurinetOffset = 0;
  try {
    jurinetOffset = parseInt(fs.readFileSync(path.join(__dirname, 'offset.history')).toString(), 10);
  } catch (ignore) {
    jurinetOffset = 0;
  }

  let juricaOffset = 0;
  try {
    juricaOffset = parseInt(fs.readFileSync(path.join(__dirname, 'offset_jurica.history')).toString(), 10);
  } catch (ignore) {
    juricaOffset = 0;
  }

  if (jurinetOffset < 5000 || juricaOffset < 5000) {
    console.log('Continuing long batch...');
    runScript(path.join(__dirname, 'import.js'), false, (err) => {
      if (err) throw err;
      console.log('Long batch to be continued...');
      setTimeout(main, 15 * 60 * 1000);
    });
  } else {
    console.log('Running short loop...');
    runScript(path.join(__dirname, 'import.js'), true, (err) => {
      if (err) throw err;
      console.log('Short loop done.');
      console.log('Continuing long batch...');
      runScript(path.join(__dirname, 'import.js'), false, (err) => {
        if (err) throw err;
        console.log('Long batch to be continued...');
        setTimeout(main, 15 * 60 * 1000);
      });
    });
  }
}

main();
