const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { MongoClient } = require('mongodb');

async function main() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const document = await rawJurica.findOne({ _id: 2555968 });

  let categoriesToOmit;

  let blocOccultation;

  let additionalTerms;

  if (document._bloc_occultation) {
    blocOccultation = document._bloc_occultation;
  }

  console.log('blocOccultation', blocOccultation);

  switch (parseInt(`${document.JDEC_OCC_COMP}`, 10)) {
    case 0:
      categoriesToOmit = GetAllCategoriesToOmit();
      break;
    case 1:
      categoriesToOmit = ConvertOccultationBlockInCategoriesToOmit(blocOccultation);
      break;
    case 2:
      categoriesToOmit = GetAllCategoriesToOmit();
      break;
    case 3:
      categoriesToOmit = ConvertOccultationBlockInCategoriesToOmit(blocOccultation);
      break;
  }

  console.log('categoriesToOmit (init)', categoriesToOmit);

  additionalTerms = document.JDEC_OCC_COMP_LIBRE || '';

  console.log('additionalTerms', additionalTerms);

  const occultations = {
    IND_PM: ['personneMorale', 'numeroSiretSiren'],
    IND_ADRESSE: ['adresse', 'localite', 'etablissement'],
    IND_DT_NAISSANCE: ['dateNaissance'],
    IND_DT_DECE: ['dateDeces'],
    IND_DT_MARIAGE: ['dateMariage'],
    IND_IMMATRICULATION: ['plaqueImmatriculation'],
    IND_CADASTRE: ['cadastre'],
    IND_CHAINE: ['compteBancaire', 'telephoneFax', 'numeroIdentifiant'],
    IND_COORDONNEE_ELECTRONIQUE: ['email'],
    IND_PRENOM_PROFESSIONEL: ['professionnelMagistratGreffier'],
    IND_NOM_PROFESSIONEL: ['professionnelMagistratGreffier'],
  };

  for (let key in occultations) {
    let indOccultation = parseInt(`${document[key]}`, 10);
    console.log(`indOccultation (${key})`, indOccultation);
    if (key === 'IND_PM' || key === 'IND_NOM_PROFESSIONEL' || key === 'IND_PRENOM_PROFESSIONEL') {
      if (indOccultation === 0 || isNaN(indOccultation)) {
        occultations[key].forEach((item) => {
          if (categoriesToOmit.indexOf(item) === -1) {
            categoriesToOmit.push(item);
            console.log('push', item);
          }
        });
      } else if (indOccultation === 1) {
        occultations[key].forEach((item) => {
          if (categoriesToOmit.indexOf(item) !== -1) {
            categoriesToOmit.splice(categoriesToOmit.indexOf(item), 1);
            console.log('remove', item);
          }
        });
      }
    } else {
      if (indOccultation === 0) {
        occultations[key].forEach((item) => {
          if (categoriesToOmit.indexOf(item) === -1) {
            categoriesToOmit.push(item);
            console.log('push', item);
          }
        });
      } else if (indOccultation === 1) {
        occultations[key].forEach((item) => {
          if (categoriesToOmit.indexOf(item) !== -1) {
            categoriesToOmit.splice(categoriesToOmit.indexOf(item), 1);
            console.log('remove', item);
          }
        });
      }
    }
  }

  console.log('categoriesToOmit (final)', categoriesToOmit);

  await client.close();
  return true;
}

function ConvertOccultationBlockInCategoriesToOmit(occultationBlock) {
  let categoriesToOmit = ['professionnelMagistratGreffier'];
  if (occultationBlock >= 1 && occultationBlock <= 4) {
    switch (occultationBlock) {
      case 2:
        categoriesToOmit.push('dateNaissance', 'dateMariage', 'dateDeces');
        break;
      case 3:
        categoriesToOmit.push('personneMorale', 'numeroSiretSiren');
        break;
      case 4:
        categoriesToOmit.push('dateNaissance', 'dateMariage', 'dateDeces', 'personneMorale', 'numeroSiretSiren');
        break;
    }
  } else {
    categoriesToOmit.push('personneMorale', 'numeroSiretSiren');
  }
  return categoriesToOmit;
}

function GetAllCategoriesToOmit() {
  return [
    'dateNaissance',
    'dateMariage',
    'dateDeces',
    'numeroIdentifiant',
    'professionnelMagistratGreffier',
    'personneMorale',
    'etablissement',
    'numeroSiretSiren',
    'adresse',
    'localite',
    'telephoneFax',
    'email',
    'siteWebSensible',
    'compteBancaire',
    'cadastre',
    'plaqueImmatriculation',
  ];
}

main();
