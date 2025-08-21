const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const prompt = require('prompt');
const { JudilibreIndex } = require('../judilibre-index');
const { MongoClient, ObjectId } = require('mongodb');
const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);
const { JurinetUtils } = require('../jurinet-utils');
const { JuricaUtils } = require('../jurica-utils');
const { JurinetOracle } = require('../jurinet-oracle');
const { JuricaOracle } = require('../jurica-oracle');

async function main(id) {
  const client = new MongoClient(process.env.MONGO_URI, { directConnection: true });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  prompt.colors = false;
  prompt.start();

  try {
    if (!id) {
      const { in_id } = await prompt.get({
        name: 'in_id',
        message:
          'Usage: node modifyOccultation.js <id>\nPlease enter an id (e.g. jurinet:xyz, jurica:xyz, judilibre:xyz)',
        validator: /[a-z]+:[a-z0-9]+/i,
      });
      id = in_id;
    }

    if (!id) {
      throw new Error('Usage: node modifyOccultation.js <id> (e.g. jurinet:xyz, jurica:xyz, judilibre:xyz)');
    }

    id = `${id}`.trim();
    let sourceName = null;
    let sourceId = null;
    let rawDocument = null;
    let decision = null;
    let changelog = {};
    let changed = false;
    let properties = {
      IND_PM: 'personne morale, numéro de Siret/Siren',
      IND_ADRESSE: 'adresse, localité, établissement',
      IND_DT_NAISSANCE: 'date de naissance',
      IND_DT_DECE: 'date de décès',
      IND_DT_MARIAGE: 'date de mariage',
      IND_IMMATRICULATION: "plaque d'immatriculation",
      IND_CADASTRE: 'cadastre',
      IND_CHAINE: 'compte bancaire, téléphone/fax, Insee',
      IND_COORDONNEE_ELECTRONIQUE: 'e-mail',
      IND_PRENOM_PROFESSIONEL: 'professionnel magistrat/greffier',
      IND_NOM_PROFESSIONEL: 'professionnel magistrat/greffier',
    };
    let propertiesValues = {};

    if (/^jurinet:\d+$/.test(id) === true) {
      sourceName = 'jurinet';
      sourceId = parseInt(id.split(':')[1], 10);
      rawDocument = await rawJurinet.findOne({ _id: sourceId });
      decision = await decisions.findOne({ sourceName: sourceName, sourceId: sourceId });
    } else if (/^jurica:\d+$/.test(id) === true) {
      sourceName = 'jurica';
      sourceId = parseInt(id.split(':')[1], 10);
      rawDocument = await rawJurica.findOne({ _id: sourceId });
      decision = await decisions.findOne({ sourceName: sourceName, sourceId: sourceId });
    } else if (/^judilibre:[a-z0-9]+$/.test(id) === true) {
      decision = await decisions.findOne({ _id: new ObjectId(`${id.split(':')[1]}`) });
      if (decision && decision.sourceName && decision.sourceId) {
        sourceName = decision.sourceName;
        sourceId = decision.sourceId;
        if (sourceName === 'jurinet') {
          rawDocument = await rawJurinet.findOne({ _id: sourceId });
        } else if (sourceName === 'jurica') {
          rawDocument = await rawJurica.findOne({ _id: sourceId });
        }
      }
    } else {
      throw new Error(`Unknown id format ${id}, must be jurinet:xyz, jurica:xyz or judilibre:xyz.`);
    }

    if (sourceName === null || sourceId === null) {
      throw new Error(`Source for decision ${id} not found or not applicable.`);
    }

    if (rawDocument === null || decision === null) {
      throw new Error(`Decicion ${sourceName}:${sourceId} not found.`);
    }

    if (sourceName === 'jurinet') {
      properties['OCCULTATION_SUPPLEMENTAIRE'] = 'occultation complémentaire';
    } else if (sourceName === 'jurica') {
      properties['JDEC_OCC_COMP'] = 'occultation complémentaire (indicateur)';
      properties['JDEC_OCC_COMP_LIBRE'] = 'occultation complémentaire (contenu)';
    }

    properties['_bloc_occultation'] = "bloc d'occultation";

    console.log(
      `Modification des éléments d'occultation de la décision ${sourceName}:${sourceId} (SDER ID: ${decision._id}):`,
    );

    for (let key in properties) {
      let validator;
      let def;
      let type;
      if (/^IND_/.test(key) || key === 'JDEC_OCC_COMP') {
        type = 'bool';
        validator = /(oui|non)/;
        def = rawDocument[key] ? 'oui' : 'non';
      } else if (key === '_bloc_occultation') {
        type = 'number';
        validator = /\d+/;
        def = rawDocument[key] ? rawDocument[key] : 0;
      } else {
        type = 'string';
        validator = /.*/;
        def = rawDocument[key] ? rawDocument[key] : '';
      }
      let { value } = await prompt.get({
        name: 'value',
        message: `${key} - ${properties[key]}`,
        validator: validator,
        default: def,
      });

      if (type === 'bool') {
        value = value === 'oui' ? 1 : 0;
      } else if (type === 'number') {
        value = parseInt(value, 10);
      } else if (type === 'string') {
        value = `${value}`.trim();
        value = value ? value : null;
      }
      propertiesValues[key] = value;
    }

    for (let key in properties) {
      let oldVal;
      let newVal;
      if (/^IND_/.test(key) || key === 'JDEC_OCC_COMP') {
        oldVal = rawDocument[key] ? 'oui' : 'non';
        newVal = propertiesValues[key] ? 'oui' : 'non';
      } else if (key === '_bloc_occultation') {
        oldVal = rawDocument[key] ? rawDocument[key] : 0;
        newVal = propertiesValues[key] ? propertiesValues[key] : 0;
      } else {
        oldVal = rawDocument[key] ? rawDocument[key] : null;
        newVal = propertiesValues[key] ? propertiesValues[key] : null;
      }
      if (oldVal !== newVal) {
        changed = true;
        changelog[key] = {
          old: JSON.stringify(oldVal),
          new: JSON.stringify(newVal),
        };
        rawDocument[key] = propertiesValues[key];
        oldVal = ` (modifié, ancienne valeur = ${oldVal})`;
      } else {
        oldVal = '';
      }
      console.log(`${key} - ${properties[key]}: ${newVal}${oldVal}`);
    }

    if (changed === true) {
      const { doChange } = await prompt.get({
        name: 'doChange',
        message: 'Enregistrer les changements et mettre à jour la décision ?',
        validator: /(oui|non)/,
        default: 'non',
      });

      if (doChange === 'oui') {
        rawDocument._indexed = null;
        if (sourceName === 'jurinet') {
          rawDocument.IND_ANO = 1;
          rawDocument.XMLA = null;
          await rawJurinet.replaceOne({ _id: rawDocument._id }, rawDocument, { bypassDocumentValidation: true });
          await JudilibreIndex.updateJurinetDocument(
            rawDocument,
            null,
            `modify occultation - changelog: ${JSON.stringify(changelog)}`,
          );
          let normDec = await JurinetUtils.Normalize(rawDocument, decision);
          normDec.originalText = JurinetUtils.removeMultipleSpace(normDec.originalText);
          normDec.originalText = JurinetUtils.replaceErroneousChars(normDec.originalText);
          normDec.pseudoText = JurinetUtils.removeMultipleSpace(normDec.pseudoText);
          normDec.pseudoText = JurinetUtils.replaceErroneousChars(normDec.pseudoText);
          normDec._id = decision._id;
          normDec._version = decisionsVersion;
          normDec.dateCreation = new Date().toISOString();
          normDec.pseudoText = undefined;
          normDec.pseudoStatus = 0;
          normDec.labelStatus = 'toBeTreated';
          normDec.publishStatus = 'toBePublished';
          normDec.labelTreatments = [];
          normDec.zoning = null;
          await decisions.replaceOne({ _id: decision._id }, normDec, {
            bypassDocumentValidation: true,
          });
          await JudilibreIndex.updateDecisionDocument(
            normDec,
            null,
            `modify occultation - changelog: ${JSON.stringify(changelog)}`,
          );
          const now = new Date();
          const jurinetSource = new JurinetOracle();
          await jurinetSource.connect();
          const updateQuery = `UPDATE DOCUMENT
            SET XMLA=null,
            IND_PM=${parseInt(rawDocument['IND_PM'], 10)},
            IND_ADRESSE=${parseInt(rawDocument['IND_ADRESSE'], 10)},
            IND_DT_NAISSANCE=${parseInt(rawDocument['IND_DT_NAISSANCE'], 10)},
            IND_DT_DECE=${parseInt(rawDocument['IND_DT_DECE'], 10)},
            IND_DT_MARIAGE=${parseInt(rawDocument['IND_DT_MARIAGE'], 10)},
            IND_IMMATRICULATION=${parseInt(rawDocument['IND_IMMATRICULATION'], 10)},
            IND_CADASTRE=${parseInt(rawDocument['IND_CADASTRE'], 10)},
            IND_CHAINE=${parseInt(rawDocument['IND_CHAINE'], 10)},
            IND_COORDONNEE_ELECTRONIQUE=${parseInt(rawDocument['IND_COORDONNEE_ELECTRONIQUE'], 10)},
            IND_PRENOM_PROFESSIONEL=${parseInt(rawDocument['IND_PRENOM_PROFESSIONEL'], 10)},
            IND_NOM_PROFESSIONEL=${parseInt(rawDocument['IND_NOM_PROFESSIONEL'], 10)},
            OCCULTATION_SUPPLEMENTAIRE=${
              rawDocument['OCCULTATION_SUPPLEMENTAIRE'] ? rawDocument['OCCULTATION_SUPPLEMENTAIRE'] : 'null'
            },
            IND_ANO=1,
            AUT_ANO=null,
            DT_ANO=null,
            DT_MODIF=:datea,
            DT_MODIF_ANO=null,
            DT_ENVOI_DILA=NULL
            WHERE ID_DOCUMENT=:id`;
          await jurinetSource.connection.execute(updateQuery, [now, decision.sourceId], { autoCommit: true });
          await jurinetSource.close();
        } else if (sourceName === 'jurica') {
          rawDocument.IND_ANO = 1;
          rawDocument.HTMLA = null;
          await rawJurica.replaceOne({ _id: rawDocument._id }, rawDocument, { bypassDocumentValidation: true });
          await JudilibreIndex.updateJuricaDocument(
            rawDocument,
            null,
            `modify occultation - changelog: ${JSON.stringify(changelog)}`,
          );
          let normDec = await JuricaUtils.Normalize(rawDocument, decision);
          normDec.originalText = JuricaUtils.removeMultipleSpace(normDec.originalText);
          normDec.originalText = JuricaUtils.replaceErroneousChars(normDec.originalText);
          normDec.pseudoText = JuricaUtils.removeMultipleSpace(normDec.pseudoText);
          normDec.pseudoText = JuricaUtils.replaceErroneousChars(normDec.pseudoText);
          normDec._id = decision._id;
          normDec._version = decisionsVersion;
          normDec.dateCreation = new Date().toISOString();
          normDec.pseudoText = undefined;
          normDec.pseudoStatus = 0;
          normDec.labelStatus = 'toBeTreated';
          normDec.publishStatus = 'toBePublished';
          normDec.labelTreatments = [];
          normDec.zoning = null;
          await decisions.replaceOne({ _id: decision._id }, normDec, {
            bypassDocumentValidation: true,
          });
          await JudilibreIndex.indexDecisionDocument(
            normDec,
            null,
            `modify occultation - changelog: ${JSON.stringify(changelog)}`,
          );
          const now = new Date();

          let dateForIndexing = now.getFullYear() + '-';
          dateForIndexing += (now.getMonth() < 9 ? '0' + (now.getMonth() + 1) : now.getMonth() + 1) + '-';
          dateForIndexing += now.getDate() < 10 ? '0' + now.getDate() : now.getDate();

          const juricaSource = new JuricaOracle();
          await juricaSource.connect();
          const updateQuery = `UPDATE JCA_DECISION
            SET IND_ANO=1,
            IND_PM=${parseInt(rawDocument['IND_PM'], 10)},
            IND_ADRESSE=${parseInt(rawDocument['IND_ADRESSE'], 10)},
            IND_DT_NAISSANCE=${parseInt(rawDocument['IND_DT_NAISSANCE'], 10)},
            IND_DT_DECE=${parseInt(rawDocument['IND_DT_DECE'], 10)},
            IND_DT_MARIAGE=${parseInt(rawDocument['IND_DT_MARIAGE'], 10)},
            IND_IMMATRICULATION=${parseInt(rawDocument['IND_IMMATRICULATION'], 10)},
            IND_CADASTRE=${parseInt(rawDocument['IND_CADASTRE'], 10)},
            IND_CHAINE=${parseInt(rawDocument['IND_CHAINE'], 10)},
            IND_COORDONNEE_ELECTRONIQUE=${parseInt(rawDocument['IND_COORDONNEE_ELECTRONIQUE'], 10)},
            IND_PRENOM_PROFESSIONEL=${parseInt(rawDocument['IND_PRENOM_PROFESSIONEL'], 10)},
            IND_NOM_PROFESSIONEL=${parseInt(rawDocument['IND_NOM_PROFESSIONEL'], 10)},
            JDEC_OCC_COMP=${parseInt(rawDocument['JDEC_OCC_COMP'], 10)},
            JDEC_OCC_COMP_LIBRE=${rawDocument['JDEC_OCC_COMP_LIBRE'] ? rawDocument['JDEC_OCC_COMP_LIBRE'] : 'null'},
            AUT_ANO=null,
            DT_ANO=null,
            JDEC_DATE_MAJ=:datea,
            DT_MODIF_ANO=null,
            DT_ENVOI_ABONNES=NULL
            WHERE JDEC_ID=:id`;
          await juricaSource.connection.execute(updateQuery, [dateForIndexing, decision.sourceId], {
            autoCommit: true,
          });
          await juricaSource.close();
        }
        console.log('Changements enregistrés.');
      } else {
        console.log('Changements ignorés.');
      }
    } else {
      console.log('Aucun changement à enregistrer.');
    }
  } catch (e) {
    console.error(e);
  }

  await client.close();
  prompt.stop();
  return true;
}

main(process.argv[2]);
