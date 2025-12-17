const path = require('path');
require('dotenv').config({ quiet: true, path: path.join(__dirname, '..', '..', '.env') });

const prompt = require('prompt');
const { JuricaOracle } = require('../jurica-oracle');

async function main(id, nac) {
  prompt.colors = false;
  prompt.start();
  try {
    if (!id) {
      const { in_id } = await prompt.get({
        name: 'in_id',
        message:
          'Usage: node modifyNAC.js <id> <NAC>\nVeuillez saisir un identifiant JuriCA valide (par exemple : 27042137)',
        validator: /\d+/i,
      });
      id = in_id;
    }
    if (!nac) {
      const { in_nac } = await prompt.get({
        name: 'in_nac',
        message: 'Usage: node modifyNAC.js <id> <NAC>\nVeuillez saisir un code NAC valide (par exemple : 88D)',
        validator: /\w+/i,
      });
      nac = in_nac;
    }
    if (!id || !nac) {
      throw new Error('Usage: node modifyNAC.js <id> <NAC> (par exemple : node modifyNAC.js 27042137 88D)');
    }
    id = parseInt(`${id}`.trim(), 10);
    nac = `${nac}`.toUpperCase().trim();
    const now = new Date();
    let date = now.getFullYear() + '-';
    date += (now.getMonth() < 9 ? '0' + (now.getMonth() + 1) : now.getMonth() + 1) + '-';
    date += now.getDate() < 10 ? '0' + now.getDate() : now.getDate();
    const juricaSource = new JuricaOracle();
    await juricaSource.connect();
    const updateQuery = `UPDATE JCA_DECISION
      SET IND_ANO=0,
      AUT_ANO=null,
      DT_ANO=null,
      JDEC_DATE_MAJ=:datea,
      JDEC_CODNAC=:nac,
      DT_MODIF_ANO=null,
      DT_ENVOI_ABONNES=NULL
      WHERE JDEC_ID=:id`;
    await juricaSource.connection.execute(updateQuery, [date, nac, id], {
      autoCommit: true,
    });
    await juricaSource.close();
    console.log('Changements enregistrés.');
  } catch (e) {
    console.log('Changements ignorés (erreur).');
    console.error(e);
  }
  prompt.stop();
  return true;
}

main(process.argv[2], process.argv[3]);
