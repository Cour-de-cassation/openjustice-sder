const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const prompt = require('prompt');
const { JudilibreIndex } = require('../judilibre-index');
const { MongoClient, ObjectId } = require('mongodb');

async function main(id) {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
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
      decision = await decisions.findOne({ _id: ObjectId(id.split(':')[1]) });
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

      console.log(`${key} --> ${propertiesValues[key]} (${type}).`);
    }
  } catch (e) {
    console.error(e);
  }

  await client.close();
  prompt.stop();
  return true;
}

main(process.argv[2]);
