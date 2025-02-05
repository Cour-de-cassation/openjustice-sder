const { JurinetOracle } = require('../src/jurinet-oracle');
const { JuricaOracle } = require('../src/jurica-oracle');

if (!process.env.DB_TABLE_JURICA || !process.env.DB_TABLE)
  require('dotenv').config({ path: resolve(__dirname, '..', '.env') });

async function refreshJurica(date) {
  const juricaSource = new JuricaOracle();
  await juricaSource.connect();

  const query =
    'UPDATE JURICA.JCA_DECISION jd SET ' +
    'JDEC_DATE = CONCAT(' +
    `(SELECT TO_CHAR(ADD_MONTHS(TO_DATE('${date
      .toISOString()
      .replaceAll('T', ' ')
      .slice(0, -5)}', 'YYYY-MM-DD HH24:MI:SS'), -1), 'YYYY-MM') FROM DUAL), ` +
    'SUBSTR((SELECT jd2.JDEC_DATE FROM JURICA.JCA_DECISION jd2 WHERE jd.JDEC_ID = jd2.JDEC_ID ), 8, 3)' +
    '), ' +
    'JDEC_DATE_CREATION = CASE ' +
    'WHEN (SELECT jd2.JDEC_DATE_CREATION FROM JURICA.JCA_DECISION jd2 WHERE jd.JDEC_ID = jd2.JDEC_ID) IS NOT NULL ' +
    `THEN (SELECT TO_CHAR(TO_DATE('${date
      .toISOString()
      .replaceAll('T', ' ')
      .slice(0, -5)}', 'YYYY-MM-DD HH24:MI:SS'), 'YYYYMMDD') FROM DUAL) ` +
    'ELSE NULL END, ' +
    'JDEC_DATE_MAJ = CASE ' +
    'WHEN (SELECT jd2.JDEC_DATE_MAJ FROM JURICA.JCA_DECISION jd2 WHERE jd.JDEC_ID = jd2.JDEC_ID) IS NOT NULL ' +
    `THEN (SELECT TO_CHAR(TO_DATE('${date
      .toISOString()
      .replaceAll('T', ' ')
      .slice(0, -5)}', 'YYYY-MM-DD HH24:MI:SS'), 'YYYYMMDD') FROM DUAL) ` +
    'ELSE NULL END, ' +
    'DT_ANO = CASE ' +
    'WHEN (SELECT jd2.DT_ANO FROM JURICA.JCA_DECISION jd2 WHERE jd.JDEC_ID = jd2.JDEC_ID) IS NOT NULL ' +
    `THEN TO_DATE('${date.toISOString().replaceAll('T', ' ').slice(0, -5)}', 'YYYY-MM-DD HH24:MI:SS') ` +
    'ELSE NULL END, ' +
    'DT_MODIF_ANO = CASE ' +
    'WHEN (SELECT jd2.DT_MODIF_ANO FROM JURICA.JCA_DECISION jd2 WHERE jd.JDEC_ID = jd2.JDEC_ID) IS NOT NULL ' +
    `THEN TO_DATE('${date.toISOString().replaceAll('T', ' ').slice(0, -5)}', 'YYYY-MM-DD HH24:MI:SS') ` +
    'ELSE NULL END';

  return juricaSource.connection.execute(query, [], { autoCommit: true });
}

async function refreshJurinet(date) {
  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();

  const query =
    'UPDATE DOCUM.DOCUMENT d SET ' +
    'DT_DECISION = TO_DATE(' +
    'CONCAT(' +
    `TO_CHAR(ADD_MONTHS(TO_DATE('${date
      .toISOString()
      .replaceAll('T', ' ')
      .slice(0, -5)}', 'YYYY-MM-DD HH24:MI:SS'), -1), 'YYYY-MM'), ` +
    "TO_CHAR((SELECT d2.DT_DECISION FROM DOCUM.DOCUMENT d2 WHERE d.ID_DOCUMENT = d2.ID_DOCUMENT), '-DD')" +
    '), ' +
    "'YYYY-MM-DD'" +
    '),' +
    'DT_CREATION = CASE ' +
    'WHEN (SELECT d2.DT_CREATION FROM DOCUM.DOCUMENT d2 WHERE d.ID_DOCUMENT = d2.ID_DOCUMENT) IS NOT NULL ' +
    `THEN TO_DATE('${date.toISOString().replaceAll('T', ' ').slice(0, -5)}', 'YYYY-MM-DD HH24:MI:SS') ` +
    'ELSE NULL END, ' +
    'DT_MODIF = CASE ' +
    'WHEN (SELECT d2.DT_MODIF FROM DOCUM.DOCUMENT d2 WHERE d.ID_DOCUMENT = d2.ID_DOCUMENT) IS NOT NULL ' +
    `THEN TO_DATE('${date.toISOString().replaceAll('T', ' ').slice(0, -5)}', 'YYYY-MM-DD HH24:MI:SS') ` +
    'ELSE NULL END, ' +
    'DT_ANO = CASE ' +
    'WHEN (SELECT d2.DT_ANO FROM DOCUM.DOCUMENT d2 WHERE d.ID_DOCUMENT = d2.ID_DOCUMENT) IS NOT NULL ' +
    `THEN TO_DATE('${date.toISOString().replaceAll('T', ' ').slice(0, -5)}', 'YYYY-MM-DD HH24:MI:SS') ` +
    'ELSE NULL END,' +
    'DT_MODIF_ANO = CASE ' +
    'WHEN (SELECT d2.DT_MODIF_ANO FROM DOCUM.DOCUMENT d2 WHERE d.ID_DOCUMENT = d2.ID_DOCUMENT) IS NOT NULL ' +
    `THEN TO_DATE('${date.toISOString().replaceAll('T', ' ').slice(0, -5)}', 'YYYY-MM-DD HH24:MI:SS') ` +
    'ELSE NULL END';

  return jurinetSource.connection.execute(query, [], { autoCommit: true });
}

async function main() {
  const input = process.argv[2];
  const date = new Date(input * 1000);
  if (!(date instanceof Date) || isNaN(date.valueOf()))
    throw new Error(`script.js [date]: waiting for an unix epoch date valid (input: ${input})`);

  return Promise.all([refreshJurica(date), refreshJurinet(date)]);
}

main()
  .then((_) => _.reduce((acc, { rowsAffected }) => acc + rowsAffected, 0))
  .then((_) => console.log(`update successfull: ${_} documents`))
  .catch(console.error)
  .finally((_) => process.exit());
