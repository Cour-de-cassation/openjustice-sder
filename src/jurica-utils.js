const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { XMLParser, XMLValidator } = require('fast-xml-parser');
const he = require('he');

const { Juritools } = require('./juritools');
const { DateTime } = require('luxon');
const { ObjectId } = require('mongodb');
const { Database } = require('./database');

const fs = require('fs');

const parserOptions = {
  attributeNamePrefix: '',
  attrNodeName: 'attributes',
  textNodeName: 'value',
  ignoreAttributes: false,
  ignoreNameSpace: true,
  allowBooleanAttributes: false,
  parseNodeValue: false,
  parseAttributeValue: false,
  trimValues: true,
  cdataTagName: false,
  parseTrueNumberOnly: false,
  arrayMode: true,
  trimValues: true,
};

const parser = new XMLParser(parserOptions);

class JuricaUtils {
  static GetThemeByNAC(nac) {
    let found = null;
    let taxon = {};
    // Copy of the judilibre-index/public/nac.json file
    // manually generated using the judilibre-index/src/scripts/generateNACTaxon.js script:
    try {
      taxon = JSON.parse(fs.readFileSync(path.join(__dirname, 'static', 'nac.json')).toString());
    } catch (ignore) {}
    for (let top in taxon) {
      for (let key in taxon[top].subs) {
        if (found === null && key.toLowerCase() === nac.toLowerCase()) {
          found = taxon[top].subs[key];
        }
      }
    }
    return found;
  }

  static GetTopThemeByNAC(nac) {
    let found = null;
    let taxon = {};
    // Copy of the judilibre-index/public/nac.json file
    // manually generated using the judilibre-index/src/scripts/generateNACTaxon.js script:
    try {
      taxon = JSON.parse(fs.readFileSync(path.join(__dirname, 'static', 'nac.json')).toString());
    } catch (ignore) {}
    for (let top in taxon) {
      for (let key in taxon[top].subs) {
        if (found === null && key.toLowerCase() === nac.toLowerCase()) {
          found = taxon[top].label;
        }
      }
    }
    return found;
  }

  static async GetUnconditionalNonPublicNAC() {
    try {
      const nacs = await Database.find('sder.codenacs', {
        indicateurDecisionRenduePubliquement: false,
        indicateurDebatsPublics: false,
      });
      return ['0', '000', '00A', '00X']
        .concat(
          nacs.map((item) => {
            return `${item.codeNAC}`.replace(/\W/gim, '').toUpperCase().trim();
          }),
        )
        .sort();
    } catch (e) {
      return [
        '11A',
        '11B',
        '11D',
        '11E',
        '11Z',
        '13A',
        '13B',
        '13C',
        '13D',
        '13E',
        '13Z',
        '14F',
        '15A',
        '15B',
        '15C',
        '15D',
        '15E',
        '15F',
        '15G',
        '15H',
        '15Z',
        '16A',
        '16B',
        '16C',
        '16D',
        '16E',
        '16F',
        '16G',
        '16H',
        '16I',
        '16J',
        '16K',
        '16M',
        '16N',
        '16O',
        '16P',
        '16Q',
        '16R',
        '16S',
        '16X',
        '17A',
        '17B',
        '17C',
        '17D',
        '17E',
        '17F',
        '17G',
        '17H',
        '17I',
        '17J',
        '17K',
        '17L',
        '17M',
        '17N',
        '17O',
        '17P',
        '17Q',
        '17R',
        '17S',
        '17T',
        '17X',
        '18A',
        '18B',
        '18C',
        '18D',
        '18E',
        '18F',
        '18G',
        '18H',
        '18X',
        '18Z',
        '20G',
        '21F',
        '22A',
        '22B',
        '22C',
        '22D',
        '22E',
        '22F',
        '23C',
        '23D',
        '23E',
        '23F',
        '23G',
        '23Z',
        '24A',
        '24B',
        '24C',
        '24D',
        '24E',
        '24F',
        '24I',
        '24J',
        '24K',
        '24L',
        '24M',
        '24N',
        '24Z',
        '26D',
        '27A',
        '27B',
        '27C',
        '27D',
        '27E',
        '27F',
        '27G',
        '27H',
        '27I',
        '27J',
        '27K',
        '27L',
        '27M',
        '27N',
        '27Z',
        '2A1',
        '2A2',
        '2A3',
        '2A4',
        '2A5',
        '2A6',
        '2A7',
        '2B1',
        '2B2',
        '2B3',
        '2B4',
        '2B5',
        '2C1',
        '2C2',
        '2C3',
        '2C4',
        '2C5',
        '2D1',
        '2D2',
        '2D3',
        '2D4',
        '2D5',
        '33Z',
        '3AG',
        '3AZ',
        '4AA',
        '4AB',
        '4EA',
        '4JF',
        '4JH',
        '4JI',
        '4JJ',
        '4JK',
        '4JL',
        '70G',
        '70J',
        '78S',
        '78T',
        '78U',
        '97A',
        '97B',
        '97E',
        '97G',
        '97P',
        '0',
        '000',
        '00A',
        '00X',
      ].sort();
    }
  }

  static async GetConditionalNonPublicNAC() {
    try {
      const nacs = await Database.find('sder.codenacs', {
        indicateurDecisionRenduePubliquement: false,
        indicateurDebatsPublics: true,
      });
      return nacs
        .map((item) => {
          return `${item.codeNAC}`.replace(/\W/gim, '').toUpperCase().trim();
        })
        .sort();
    } catch (e) {
      return ['4AC', '4AD', '4AE', '4AF', '4AL', '4AM', '4AN', '4AO', '4AP', '4EC'].sort();
    }
  }

  static async GetPartiallyPublicNAC() {
    try {
      const nacs = await Database.find('sder.codenacs', {
        $or: [
          {
            indicateurDecisionRenduePubliquement: true,
            indicateurDebatsPublics: false,
          },
          {
            indicateurDecisionRenduePubliquement: { $ne: false },
            indicateurDebatsPublics: false,
            indicateurAffaireSignalee: true,
          },
        ],
      });
      return nacs
        .map((item) => {
          return `${item.codeNAC}`.replace(/\W/gim, '').toUpperCase().trim();
        })
        .sort();
    } catch (e) {
      return [
        '2AA',
        '2AB',
        '2AC',
        '2AD',
        '2AE',
        '2AF',
        '2AG',
        '2AH',
        '2AI',
        '2AJ',
        '2AK',
        '2AM',
        '2AN',
        '2AO',
        '2AP',
        '2AQ',
        '2AR',
        '2AS',
        '2AT',
        '2AU',
        '2AV',
        '2AZ',
        '20A',
        '20B',
        '20C',
        '20D',
        '20E',
        '20F',
        '20I',
        '20J',
        '20K',
        '20L',
        '20X',
        '21A',
        '21B',
        '21C',
        '21D',
        '21E',
        '21H',
        '21I',
        '21J',
        '21K',
        '21X',
        '26A',
        '26B',
        '26C',
        '26E',
        '26F',
        '26G',
        '26H',
        '26I',
        '26J',
        '26K',
        '26Y',
        '26Z',
        '20H',
        '21G',
        '23A',
        '23B',
        '23I',
        '23J',
        '23K',
        '24G',
        '24H',
        '25A',
        '25B',
        '25C',
        '25D',
        '25E',
        '25F',
        '25G',
        '25H',
        '25I',
        '64D',
      ].sort();
    }
  }

  static GetELMSTRLocationFromJuricaLocation(juricaLocation) {
    let ELMSTRLocation = null;
    juricaLocation = `${juricaLocation}`.toLowerCase().trim();

    if (/agen/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel d'Agen";
    } else if (/aix/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel d'Aix-en-Provence";
    } else if (/amiens/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel d'Amiens";
    } else if (/angers/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel d'Angers";
    } else if (/basse/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Basse-Terre";
    } else if (/bastia/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Bastia";
    } else if (/besan/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Besançon";
    } else if (/bordeaux/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Bordeaux";
    } else if (/bourges/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Bourges";
    } else if (/caen/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Caen";
    } else if (/cayenne/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Cayenne";
    } else if (/chamb/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Chambéry";
    } else if (/colmar/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Colmar";
    } else if (/dijon/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Dijon";
    } else if (/douai/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Douai";
    } else if (/fort/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Fort-de-France";
    } else if (/grenoble/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Grenoble";
    } else if (/limoges/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Limoges";
    } else if (/lyon/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Lyon";
    } else if (/metz/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Metz";
    } else if (/montpellier/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Montpellier";
    } else if (/nancy/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Nancy";
    } else if (/mes/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Nîmes";
    } else if (/noum/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Noumea";
    } else if (/orl/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel d'Orléans";
    } else if (/papeete/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Papeete";
    } else if (/paris/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Paris";
    } else if (/pau/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Pau";
    } else if (/poitiers/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Poitiers";
    } else if (/reims/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Reims";
    } else if (/rennes/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Rennes";
    } else if (/riom/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Riom";
    } else if (/rouen/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Rouen";
    } else if (/denis/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Saint-Denis de la Réunion";
    } else if (/toulouse/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Toulouse";
    } else if (/versailles/.test(juricaLocation) === true) {
      ELMSTRLocation = "Cour d'appel de Versailles";
    }

    return ELMSTRLocation;
  }

  static GetJuricaLocationFromELMSTRLocation(ELMSTRLocation) {
    let juricaLocation = null;
    ELMSTRLocation = `${ELMSTRLocation}`.toLowerCase().trim();

    if (/agen/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel d'Agen";
    } else if (/aix/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel d'Aix en Provence";
    } else if (/amiens/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel d'Amiens";
    } else if (/angers/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel d'Angers";
    } else if (/basse/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Basse Terre";
    } else if (/bastia/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Bastia";
    } else if (/besan/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Besançon";
    } else if (/bordeaux/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Bordeaux";
    } else if (/bourges/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Bourges";
    } else if (/caen/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Caen";
    } else if (/cayenne/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Cayenne";
    } else if (/chamb/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Chambéry";
    } else if (/colmar/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Colmar";
    } else if (/dijon/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Dijon";
    } else if (/douai/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Douai";
    } else if (/fort/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Fort de France";
    } else if (/grenoble/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Grenoble";
    } else if (/limoges/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Limoges";
    } else if (/lyon/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Lyon";
    } else if (/metz/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Metz";
    } else if (/montpellier/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Montpellier";
    } else if (/nancy/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Nancy";
    } else if (/mes/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Nimes";
    } else if (/noum/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Noumea";
    } else if (/orl/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel d'Orléans";
    } else if (/papeete/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Papeete";
    } else if (/paris/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Paris";
    } else if (/pau/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Pau";
    } else if (/poitiers/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Poitiers";
    } else if (/reims/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Reims";
    } else if (/rennes/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Rennes";
    } else if (/riom/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Riom";
    } else if (/rouen/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Rouen";
    } else if (/denis/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Saint Denis de la Réunion";
    } else if (/toulouse/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Toulouse";
    } else if (/versailles/.test(ELMSTRLocation) === true) {
      juricaLocation = "cour d'appel de Versailles";
    }

    return juricaLocation;
  }

  static async IndexAffaire(doc, jIndexMain, jIndexAffaires, jurinetConnection) {
    const { JudilibreIndex } = require('./judilibre-index');
    let res = 'done';
    if (
      doc.JDEC_HTML_SOURCE &&
      doc.JDEC_NUM_RG &&
      doc.JDEC_DATE &&
      /^\d\d\d\d-\d\d-\d\d$/.test(`${doc.JDEC_DATE}`.trim())
    ) {
      let objAlreadyStored = await jIndexAffaires.findOne({ ids: `jurica:${doc._id}` });
      let objToStore = {
        _id: objAlreadyStored !== null ? objAlreadyStored._id : new ObjectId(),
        numbers: objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.numbers)) : [],
        ids: objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.ids)) : [],
        affaires: objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.affaires)) : [],
        dates: objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.dates)) : [],
        jurisdictions: objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.jurisdictions)) : [],
        numbers_ids: objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.numbers_ids)) : {},
        numbers_dates: objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.numbers_dates)) : {},
        numbers_affaires:
          objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.numbers_affaires)) : {},
        numbers_jurisdictions:
          objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.numbers_jurisdictions)) : {},
        dates_jurisdictions:
          objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.dates_jurisdictions)) : {},
      };
      let dateForIndexing = `${doc.JDEC_DATE}`.trim();
      if (objToStore.ids.indexOf(`jurica:${doc._id}`) === -1) {
        objToStore.ids.push(`jurica:${doc._id}`);
      }
      if (objToStore.dates.indexOf(dateForIndexing) === -1) {
        objToStore.dates.push(dateForIndexing);
      }
      let RGNumber = `${doc.JDEC_NUM_RG}`.trim();
      if (objToStore.numbers.indexOf(RGNumber) === -1) {
        objToStore.numbers.push(RGNumber);
      }
      let jurisdiction = JuricaUtils.GetELMSTRLocationFromJuricaLocation(doc.JDEC_JURIDICTION);
      if (objToStore.jurisdictions.indexOf(jurisdiction) === -1) {
        objToStore.jurisdictions.push(jurisdiction);
      }
      objToStore.numbers_ids[RGNumber] = `jurica:${doc._id}`;
      objToStore.numbers_dates[RGNumber] = dateForIndexing;
      objToStore.dates_jurisdictions[dateForIndexing] = jurisdiction;
      objToStore.numbers_jurisdictions[RGNumber] = jurisdiction;
      let hasPreced = false;

      try {
        const text = JuricaUtils.CleanHTML(doc.JDEC_HTML_SOURCE);
        const zoning = await Juritools.GetZones(doc._id, 'ca', text);
        if (zoning && zoning.introduction_subzonage && zoning.introduction_subzonage.j_preced_date) {
          const baseRegex = /(\d+)\D*\s+([a-zéû.]+)\s+(\d\d\d\d)/i;
          let remainingDates = [];
          let datesToCheck = [];
          let datesTaken = [];
          for (let dd = 0; dd < zoning.introduction_subzonage.j_preced_date.length; dd++) {
            if (baseRegex.test(zoning.introduction_subzonage.j_preced_date[dd])) {
              const baseMatch = baseRegex.exec(zoning.introduction_subzonage.j_preced_date[dd]);
              const baseDate = {
                day: parseInt(baseMatch[1], 10),
                month: JurinetUtils.ParseMonth(baseMatch[2]),
                year: parseInt(baseMatch[3], 10),
              };
              baseDate.day = baseDate.day < 10 ? `0${baseDate.day}` : `${baseDate.day}`;
              baseDate.month = baseDate.month < 10 ? `0${baseDate.month}` : `${baseDate.month}`;
              const fullDate = `${baseDate.year}-${baseDate.month}-${baseDate.day}`;
              if (!isNaN(Date.parse(fullDate))) {
                datesToCheck.push(fullDate);
              }
            }
          }
          if (zoning.introduction_subzonage.j_preced_nrg) {
            for (let rr = 0; rr < zoning.introduction_subzonage.j_preced_nrg.length; rr++) {
              let RGTerms = ['', ''];
              try {
                RGTerms = `${zoning.introduction_subzonage.j_preced_nrg[rr]}`.split('/');
                RGTerms[0] = RGTerms[0].replace(/\D/gm, '').replace(/^0+/gm, '').trim();
                RGTerms[1] = RGTerms[1].replace(/\D/gm, '').replace(/^0+/gm, '').trim();
              } catch (ignore) {}
              for (let ee = 0; ee < datesToCheck.length; ee++) {
                const decisionQuery = `SELECT JCA_DECISION.JDEC_ID, JCA_DECISION.JDEC_NUM_RG, JCA_DECISION.JDEC_JURIDICTION
                  FROM JCA_DECISION
                  WHERE REGEXP_LIKE(JCA_DECISION.JDEC_NUM_RG, '^0*${RGTerms[0]}/0*${RGTerms[1]} *$')
                  AND JCA_DECISION.JDEC_DATE = '${datesToCheck[ee]}'`;
                const decisionResult = await juricaConnection.execute(decisionQuery, []);
                if (decisionResult && decisionResult.rows && decisionResult.rows.length > 0) {
                  if (objAlreadyStored === null) {
                    objAlreadyStored = await jIndexAffaires.findOne({
                      ids: `jurica:${decisionResult.rows[0].JDEC_ID}`,
                    });
                  }
                  if (objAlreadyStored !== null) {
                    objToStore._id = objAlreadyStored._id;
                    objAlreadyStored.numbers.forEach((number) => {
                      if (objToStore.numbers.indexOf(number) === -1) {
                        objToStore.numbers.push(number);
                      }
                      objToStore.numbers_ids[number] = objAlreadyStored.numbers_ids[number];
                      objToStore.numbers_dates[number] = objAlreadyStored.numbers_dates[number];
                      objToStore.numbers_affaires[number] = objAlreadyStored.numbers_affaires[number];
                      objToStore.numbers_jurisdictions[number] = objAlreadyStored.numbers_jurisdictions[number];
                    });
                    objAlreadyStored.ids.forEach((id) => {
                      if (objToStore.ids.indexOf(id) === -1) {
                        objToStore.ids.push(id);
                      }
                    });
                    objAlreadyStored.affaires.forEach((affaire) => {
                      if (objToStore.affaires.indexOf(affaire) === -1) {
                        objToStore.affaires.push(affaire);
                      }
                    });
                    objAlreadyStored.dates.forEach((date) => {
                      if (objToStore.dates.indexOf(date) === -1) {
                        objToStore.dates.push(date);
                      }
                      objToStore.dates_jurisdictions[date] = objAlreadyStored.dates_jurisdictions[date];
                    });
                    objAlreadyStored.jurisdictions.forEach((jurisdiction) => {
                      if (objToStore.jurisdictions.indexOf(jurisdiction) === -1) {
                        objToStore.jurisdictions.push(jurisdiction);
                      }
                    });
                  }
                  if (objToStore.ids.indexOf(`jurica:${decisionResult.rows[0].JDEC_ID}`) === -1) {
                    objToStore.ids.push(`jurica:${decisionResult.rows[0].JDEC_ID}`);
                  }
                  if (objToStore.dates.indexOf(datesToCheck[ee]) === -1) {
                    objToStore.dates.push(datesToCheck[ee]);
                  }
                  let actualRGNumber = `${decisionResult.rows[0].JDEC_NUM_RG}`.trim();
                  if (objToStore.numbers.indexOf(actualRGNumber) === -1) {
                    objToStore.numbers.push(actualRGNumber);
                  }
                  let actualJurisdiction = JuricaUtils.GetELMSTRLocationFromJuricaLocation(
                    decisionResult.rows[0].JDEC_JURIDICTION,
                  );
                  if (objToStore.jurisdictions.indexOf(actualJurisdiction) === -1) {
                    objToStore.jurisdictions.push(actualJurisdiction);
                  }
                  objToStore.numbers_ids[actualRGNumber] = `jurica:${decisionResult.rows[0].JDEC_ID}`;
                  objToStore.numbers_dates[actualRGNumber] = datesToCheck[ee];
                  objToStore.dates_jurisdictions[datesToCheck[ee]] = actualJurisdiction;
                  objToStore.numbers_jurisdictions[actualRGNumbers] = actualJurisdiction;
                  if (datesTaken.indexOf(datesToCheck[ee]) === -1) {
                    datesTaken.push(datesToCheck[ee]);
                  }
                  hasPreced = true;
                  break;
                }
              }
            }
          }
          // Dates can't be shared between jurisdictions
          remainingDates = [];
          datesToCheck.forEach((date) => {
            if (datesTaken.indexOf(date) === -1) {
              remainingDates.push(date);
            }
          });
          datesToCheck = remainingDates;
          if (zoning.introduction_subzonage.j_preced_npourvoi) {
            for (let pp = 0; pp < zoning.introduction_subzonage.j_preced_npourvoi.length; pp++) {
              let simplePourvoi = parseInt(
                `${zoning.introduction_subzonage.j_preced_npourvoi[pp]}`.replace(/\D/gm, '').trim(),
                10,
              );
              for (let ee = 0; ee < datesToCheck.length; ee++) {
                const pourvoiQuery = `SELECT DOCUMENT.ID_DOCUMENT
                  FROM NUMPOURVOI, DOCUMENT
                  WHERE NUMPOURVOI.ID_DOCUMENT = DOCUMENT.ID_DOCUMENT
                  AND NUMPOURVOI.NUMPOURVOICODE = :code
                  AND DOCUMENT.DT_DECISION = TO_DATE('${datesToCheck[ee]}', 'YYYY-MM-DD')`;
                const pourvoiResult = await jurinetConnection.execute(pourvoiQuery, [simplePourvoi]);
                if (pourvoiResult && pourvoiResult.rows && pourvoiResult.rows.length > 0) {
                  if (objAlreadyStored === null) {
                    objAlreadyStored = await jIndexAffaires.findOne({
                      ids: `jurinet:${pourvoiResult.rows[0].ID_DOCUMENT}`,
                    });
                  }
                  if (objAlreadyStored !== null) {
                    objToStore._id = objAlreadyStored._id;
                    objAlreadyStored.numbers.forEach((number) => {
                      if (objToStore.numbers.indexOf(number) === -1) {
                        objToStore.numbers.push(number);
                      }
                      objToStore.numbers_ids[number] = objAlreadyStored.numbers_ids[number];
                      objToStore.numbers_dates[number] = objAlreadyStored.numbers_dates[number];
                      objToStore.numbers_affaires[number] = objAlreadyStored.numbers_affaires[number];
                      objToStore.numbers_jurisdictions[number] = objAlreadyStored.numbers_jurisdictions[number];
                    });
                    objAlreadyStored.ids.forEach((id) => {
                      if (objToStore.ids.indexOf(id) === -1) {
                        objToStore.ids.push(id);
                      }
                    });
                    objAlreadyStored.affaires.forEach((affaire) => {
                      if (objToStore.affaires.indexOf(affaire) === -1) {
                        objToStore.affaires.push(affaire);
                      }
                    });
                    objAlreadyStored.dates.forEach((date) => {
                      if (objToStore.dates.indexOf(date) === -1) {
                        objToStore.dates.push(date);
                      }
                      objToStore.dates_jurisdictions[date] = objAlreadyStored.dates_jurisdictions[date];
                    });
                    objAlreadyStored.jurisdictions.forEach((jurisdiction) => {
                      if (objToStore.jurisdictions.indexOf(jurisdiction) === -1) {
                        objToStore.jurisdictions.push(jurisdiction);
                      }
                    });
                  }
                  if (objToStore.ids.indexOf(`jurinet:${pourvoiResult.rows[0].ID_DOCUMENT}`) === -1) {
                    objToStore.ids.push(`jurinet:${pourvoiResult.rows[0].ID_DOCUMENT}`);
                  }
                  if (objToStore.dates.indexOf(datesToCheck[ee]) === -1) {
                    objToStore.dates.push(datesToCheck[ee]);
                  }
                  if (objToStore.jurisdictions.indexOf('Cour de cassation') === -1) {
                    objToStore.jurisdictions.push('Cour de cassation');
                  }
                  objToStore.dates_jurisdictions[datesToCheck[ee]] = 'Cour de cassation';
                  const pourvoiQuery2 = `SELECT LIB
                    FROM NUMPOURVOI
                    WHERE NUMPOURVOI.ID_DOCUMENT = :id`;
                  const pourvoiResult2 = await jurinetConnection.execute(pourvoiQuery2, [
                    pourvoiResult.rows[0].ID_DOCUMENT,
                  ]);
                  if (pourvoiResult2 && pourvoiResult2.rows && pourvoiResult2.rows.length > 0) {
                    for (let iii = 0; iii < pourvoiResult2.rows.length; iii++) {
                      if (objToStore.numbers.indexOf(pourvoiResult2.rows[iii]['LIB']) === -1) {
                        objToStore.numbers.push(pourvoiResult2.rows[iii]['LIB']);
                      }
                      objToStore.numbers_ids[
                        pourvoiResult2.rows[iii]['LIB']
                      ] = `jurinet:${pourvoiResult.rows[0].ID_DOCUMENT}`;
                      objToStore.numbers_dates[pourvoiResult2.rows[iii]['LIB']] = datesToCheck[ee];
                      objToStore.numbers_jurisdictions[pourvoiResult2.rows[iii]['LIB']] = 'Cour de cassation';
                      const affaireQuery = `SELECT GPCIV.AFF.ID_AFFAIRE
                        FROM GPCIV.AFF
                        WHERE CONCAT(GPCIV.AFF.CLE, GPCIV.AFF.CODE) = :pourvoi`;
                      const affaireResult = await jurinetConnection.execute(affaireQuery, [
                        pourvoiResult2.rows[iii]['LIB'],
                      ]);
                      if (affaireResult && affaireResult.rows && affaireResult.rows.length > 0) {
                        if (objToStore.affaires.indexOf(affaireResult.rows[0]['ID_AFFAIRE']) === -1) {
                          objToStore.affaires.push(affaireResult.rows[0]['ID_AFFAIRE']);
                        }
                        objToStore.numbers_affaires[pourvoiResult2.rows[iii]['LIB']] =
                          affaireResult.rows[0]['ID_AFFAIRE'];
                      }
                    }
                  }
                  if (datesTaken.indexOf(datesToCheck[ee]) === -1) {
                    datesTaken.push(datesToCheck[ee]);
                  }
                  hasPreced = true;
                  break;
                }
              }
            }
          }
        }
      } catch (ignore) {}

      if (hasPreced === true || objAlreadyStored !== null) {
        objToStore.dates.sort();
        if (objAlreadyStored === null) {
          await jIndexAffaires.insertOne(objToStore, { bypassDocumentValidation: true });
        } else if (JSON.stringify(objToStore) !== JSON.stringify(objAlreadyStored)) {
          await jIndexAffaires.replaceOne({ _id: objAlreadyStored._id }, objToStore, {
            bypassDocumentValidation: true,
          });
        }
      }
      if (hasPreced === true) {
        res = 'decatt-found';
      } else {
        res = 'no-decatt';
      }
      for (let jj = 0; jj < objToStore.ids.length; jj++) {
        if (objToStore.ids[jj] === `jurica:${doc._id}`) {
          const found = await jIndexMain.findOne({ _id: objToStore.ids[jj] });
          if (found === null) {
            const indexedDoc = await JudilibreIndex.buildJuricaDocument(doc);
            const lastOperation = DateTime.fromJSDate(new Date());
            indexedDoc.lastOperation = lastOperation.toISODate();
            await jIndexMain.insertOne(indexedDoc, { bypassDocumentValidation: true });
          }
        }
      }
    } else {
      res = 'no-data';
    }
    return res;
  }

  static async IsNonPublic(nac, np, publicCheckbox) {
    const cleanedNac = `${nac}`.replace(/\W/gim, '').toUpperCase().trim();
    publicCheckbox = parseInt(`${publicCheckbox}`, 10);
    if (!cleanedNac || cleanedNac === 'NULL' || !nac) {
      return true;
    } else if ((await JuricaUtils.GetUnconditionalNonPublicNAC()).indexOf(cleanedNac) !== -1) {
      if (publicCheckbox === 1) {
        throw new Error(`non-public NAC code (${nac}), but JDEC_IND_DEC_PUB is set to 1`);
      }
      return true;
    } else if ((await JuricaUtils.GetConditionalNonPublicNAC()).indexOf(cleanedNac) !== -1) {
      if (publicCheckbox === 0 || isNaN(publicCheckbox)) {
        return true;
      } else if (publicCheckbox === 1) {
        return false;
      }
    }
    return false;
  }

  static async IsPartiallyPublic(nac, np, publicCheckbox) {
    const cleanedNac = `${nac}`.replace(/\W/gim, '').toUpperCase().trim();
    if (!cleanedNac || cleanedNac === 'NULL' || !nac) {
      return false;
    } else if ((await JuricaUtils.GetPartiallyPublicNAC()).indexOf(cleanedNac) !== -1) {
      return true;
    }
    return false;
  }

  static async IsPublic(nac, np, publicCheckbox) {
    const cleanedNac = `${nac}`.replace(/\W/gim, '').toUpperCase().trim();
    if (!cleanedNac || cleanedNac === 'NULL' || !nac) {
      return false;
    }
    const nonPublic = await JuricaUtils.IsNonPublic(nac, np, publicCheckbox);
    const partiallyPublic = await JuricaUtils.IsPartiallyPublic(nac, np, publicCheckbox);
    publicCheckbox = parseInt(`${publicCheckbox}`, 10);
    if (!nonPublic && !partiallyPublic) {
      if (publicCheckbox === 0) {
        throw new Error(`public NAC code (${nac}), but JDEC_IND_DEC_PUB is set to 0`);
      }
      return true;
    } else {
      return false;
    }
  }

  static async ShouldBeRejected(nac, np, publicCheckbox) {
    const cleanedNac = `${nac}`.replace(/\W/gim, '').toUpperCase().trim();
    if (!cleanedNac || cleanedNac === 'NULL' || !nac) {
      return true;
    }
    try {
      const nonPublic = await JuricaUtils.IsNonPublic(nac, np, publicCheckbox);
      const partiallyPublic = await JuricaUtils.IsPartiallyPublic(nac, np, publicCheckbox);
      const isPublic = await JuricaUtils.IsPublic(nac, np, publicCheckbox);
      return nonPublic && !isPublic && !partiallyPublic;
    } catch (anomaly) {
      return false;
    }
  }

  static async ShouldBeSentToJudifiltre(nac, np, publicCheckbox) {
    const cleanedNac = `${nac}`.replace(/\W/gim, '').toUpperCase().trim();
    if (!cleanedNac || cleanedNac === 'NULL' || !nac) {
      return false;
    }
    try {
      const nonPublic = await JuricaUtils.IsNonPublic(nac, np, publicCheckbox);
      const partiallyPublic = await JuricaUtils.IsPartiallyPublic(nac, np, publicCheckbox);
      const isPublic = await JuricaUtils.IsPublic(nac, np, publicCheckbox);
      if (nonPublic === isPublic) {
        throw new Error(
          `contradictory public status #1 (public: ${isPublic}, non-public: ${nonPublic}) for the given data (${nac}, ${np}, ${publicCheckbox})`,
        );
      } else if (nonPublic && partiallyPublic) {
        throw new Error(
          `contradictory public status #2 (non-public: ${nonPublic}, partially public: ${partiallyPublic}) for the given data (${nac}, ${np}, ${publicCheckbox})`,
        );
      } else if (isPublic && partiallyPublic) {
        throw new Error(
          `contradictory public status #3 (public: ${isPublic}, partially public: ${partiallyPublic}) for the given data (${nac}, ${np}, ${publicCheckbox})`,
        );
      }
      if (partiallyPublic) {
        return true;
      }
      if (isPublic || nonPublic) {
        return false;
      }
      return true;
    } catch (anomaly) {
      console.error(anomaly);
      return true;
    }
  }

  static CleanHTML(html) {
    if (/<html/i.test(html) === false) {
      return html;
    }
    // Remove HTML tags:
    html = html.replace(/<\/?[^>]+(>|$)/gm, '');

    // Handling newlines and carriage returns:
    html = html.replace(/\r\n/gim, '\n');
    html = html.replace(/\r/gim, '\n');

    // Remove extra spaces:
    html = html.replace(/\t/gim, ' ');
    html = html.replace(/\\t/gim, ' '); // That could happen...
    html = html.replace(/\f/gim, ' ');
    html = html.replace(/\\f/gim, ' '); // That could happen too...
    html = JuricaUtils.removeMultipleSpace(html);

    // Mysterious chars (cf. https://www.compart.com/fr/unicode/U+0080, etc.):
    html = JuricaUtils.replaceErroneousChars(html);

    // Decode HTML entities:
    return he.decode(html);
  }

  static removeMultipleSpace(str) {
    if (typeof str === 'string') {
      return str.replace(/  +/gm, ' ').trim();
    }
    return str;
  }

  static replaceErroneousChars(str) {
    if (typeof str === 'string') {
      return str.replace(/\x91/gm, '‘').replace(/\x92/gm, '’').replace(/\x80/gm, '€').replace(/\x96/gm, '–');
    }
    return str;
  }

  static async Normalize(document, previousVersion, ignorePreviousContent) {
    let originalText = undefined;
    let pseudoText = undefined;
    let pseudoStatus = document.IND_ANO;

    if (document.JDEC_HTML_SOURCE) {
      try {
        originalText = JuricaUtils.CleanHTML(document.JDEC_HTML_SOURCE);
      } catch (e) {
        console.warn(
          `JuricaUtils.Normalize: Could not properly clean the original text of document '${document._id}'.`,
        );
        console.warn(e);
      }
    }

    if (document.HTMLA) {
      try {
        pseudoText = JuricaUtils.CleanHTML(document.HTMLA);
      } catch (e) {
        console.warn(
          `JuricaUtils.Normalize: Could not properly clean the pseudonymized text of document '${document._id}'.`,
        );
        console.warn(e);
      }
    }

    if (previousVersion && !ignorePreviousContent) {
      if (previousVersion.pseudoText) {
        pseudoText = previousVersion.pseudoText;
      }
      if (previousVersion.pseudoStatus) {
        pseudoStatus = previousVersion.pseudoStatus;
      }
    }

    let dateDecision = null;
    if (document.JDEC_DATE) {
      dateDecision = new Date();
      let dateDecisionElements = document.JDEC_DATE.split('-');
      dateDecision.setFullYear(parseInt(dateDecisionElements[0], 10));
      dateDecision.setMonth(parseInt(dateDecisionElements[1], 10) - 1);
      dateDecision.setDate(parseInt(dateDecisionElements[2], 10));
      dateDecision.setHours(0);
      dateDecision.setMinutes(0);
      dateDecision.setSeconds(0);
      dateDecision.setMilliseconds(0);
    }
    try {
      dateDecision = dateDecision.toISOString();
    } catch (e) {
      console.warn(`JuricaUtils.Normalize: could not process decision date '${document.JDEC_DATE}'`, e);
      dateDecision = document.JDEC_DATE;
    }

    let dateCreation = null;
    if (document.JDEC_DATE_CREATION) {
      dateCreation = new Date();
      let dateCreationElements = document.JDEC_DATE_CREATION;
      dateCreation.setFullYear(parseInt(dateCreationElements.substring(0, 4), 10));
      dateCreation.setMonth(parseInt(dateCreationElements.substring(4, 6), 10) - 1);
      dateCreation.setDate(parseInt(dateCreationElements.substring(6), 10));
      dateCreation.setHours(0);
      dateCreation.setMinutes(0);
      dateCreation.setSeconds(0);
      dateCreation.setMilliseconds(0);
    }
    try {
      dateCreation = dateCreation.toISOString();
    } catch (e) {
      console.warn(
        `JuricaUtils.Normalize: could not process decision creation date '${document.JDEC_DATE_CREATION}'`,
        e,
      );
      dateCreation = document.JDEC_DATE_CREATION;
    }

    const now = new Date();

    let normalizedDecision = {
      _rev: previousVersion ? previousVersion._rev + 1 : 0,
      _version: parseFloat(process.env.MONGO_DECISIONS_VERSION),
      sourceId: document._id,
      sourceName: 'jurica',
      jurisdictionId: document.JDEC_ID_JURIDICTION,
      jurisdictionCode: document.JDEC_CODE_JURIDICTION,
      jurisdictionName: document.JDEC_JURIDICTION,
      chamberId: document.JDEC_CODE_AUTORITE,
      chamberName: document.JDEC_LIB_AUTORITE,
      registerNumber: `${document.JDEC_NUM_RG} ${document.JDEC_NUM_REGISTRE}`,
      pubCategory: document.JDEC_NOTICE_FORMAT,
      dateDecision: dateDecision,
      dateCreation: now.toISOString(),
      solution: document.JDEC_LIBELLE,
      originalText: originalText
        ? originalText
            .replace(/\*DEB[A-Z]*/gm, '')
            .replace(/\*FIN[A-Z]*/gm, '')
            .trim()
        : undefined,
      pseudoText: pseudoText
        ? pseudoText
            .replace(/\*DEB[A-Z]*/gm, '')
            .replace(/\*FIN[A-Z]*/gm, '')
            .trim()
        : undefined,
      pseudoStatus: pseudoStatus,
      appeals: [],
      analysis: {
        nature: undefined,
        target: undefined,
        link: undefined,
        source: undefined,
        doctrine: undefined,
        title: undefined,
        summary: undefined,
        reference: [],
        analyse: [],
      },
      parties: [],
      decatt: null,
      locked: false,
      labelStatus: pseudoText ? 'done' : 'toBeTreated',
      publishStatus: 'toBePublished',
      labelTreatments: [],
      zoning: undefined,
      occultation: {
        additionalTerms: '',
        categoriesToOmit: ['personneMorale', 'numeroSiretSiren', 'professionnelMagistratGreffier'],
      },
      publication: [],
      formation: undefined,
      blocOccultation: undefined,
      endCaseCode: document.JDEC_CODE || null,
      NAOCode: null,
      NACCode: document.JDEC_CODNAC || null,
      NPCode: document.JDEC_CODNACPART || null,
      public:
        parseInt(`${document.JDEC_IND_DEC_PUB}`, 10) === 1
          ? true
          : parseInt(`${document.JDEC_IND_DEC_PUB}`, 10) === 0
          ? false
          : null,
      natureAffaireCivil: null,
      natureAffairePenal: null,
      codeMatiereCivil: null,
      recommandationOccultation: JuricaUtils.GetRecommandationOccultation(document),
    };

    try {
      const xml = `<document>${document.JDEC_COLL_PARTIES}</document>`;
      const valid = XMLValidator.validate(xml);
      let _parties = [];
      normalizedDecision.parties = [];
      if (valid === true) {
        const json = parser.parse(xml);
        if (
          json &&
          json.document &&
          Array.isArray(json.document) &&
          json.document[0] &&
          json.document[0].partie &&
          Array.isArray(json.document[0].partie) &&
          json.document[0].partie.length > 0
        ) {
          _parties = json.document[0].partie;
        } else if (
          json &&
          json.document &&
          !Array.isArray(json.document) &&
          json.document.partie &&
          Array.isArray(json.document.partie) &&
          json.document.partie.length > 0
        ) {
          _parties = json.document.partie;
        }
        for (let ip = 0; ip < _parties.length; ip++) {
          if (_parties[ip].attributes === undefined && _parties[ip].qualitePartie && _parties[ip].typePersonne) {
            normalizedDecision.parties.push({
              attributes: {
                qualitePartie: _parties[ip].qualitePartie,
                typePersonne: _parties[ip].typePersonne,
              },
              identite: _parties[ip].identite,
            });
          } else if (_parties[ip].attributes !== undefined) {
            normalizedDecision.parties.push({
              attributes: _parties[ip].attributes,
              identite: _parties[ip].identite,
            });
          }
        }
      }
    } catch (e) {
      console.warn(e);
    }

    if (previousVersion) {
      if (previousVersion.labelStatus) {
        normalizedDecision.labelStatus = previousVersion.labelStatus;
      }
      if (previousVersion.labelTreatments) {
        normalizedDecision.labelTreatments = previousVersion.labelTreatments;
      }
      if (previousVersion._version) {
        normalizedDecision._version = previousVersion._version;
      }
    }

    if (document._bloc_occultation) {
      normalizedDecision.blocOccultation = document._bloc_occultation;
    }

    switch (parseInt(`${document.JDEC_OCC_COMP}`, 10)) {
      case 0:
        normalizedDecision.occultation.categoriesToOmit = GetAllCategoriesToOmit();
        break;
      case 1:
        normalizedDecision.occultation.categoriesToOmit = ConvertOccultationBlockInCategoriesToOmit(
          normalizedDecision.blocOccultation,
        );
        break;
      case 2:
        normalizedDecision.occultation.categoriesToOmit = GetAllCategoriesToOmit();
        break;
      case 3:
        normalizedDecision.occultation.categoriesToOmit = ConvertOccultationBlockInCategoriesToOmit(
          normalizedDecision.blocOccultation,
        );
        break;
    }

    normalizedDecision.occultation.additionalTerms = document.JDEC_OCC_COMP_LIBRE || '';

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
      if (key === 'IND_PM' || key === 'IND_NOM_PROFESSIONEL' || key === 'IND_PRENOM_PROFESSIONEL') {
        if (indOccultation === 0 || isNaN(indOccultation)) {
          occultations[key].forEach((item) => {
            if (normalizedDecision.occultation.categoriesToOmit.indexOf(item) === -1) {
              normalizedDecision.occultation.categoriesToOmit.push(item);
            }
          });
        } else if (indOccultation === 1) {
          occultations[key].forEach((item) => {
            if (normalizedDecision.occultation.categoriesToOmit.indexOf(item) !== -1) {
              normalizedDecision.occultation.categoriesToOmit.splice(
                normalizedDecision.occultation.categoriesToOmit.indexOf(item),
                1,
              );
            }
          });
        }
      } else {
        if (indOccultation === 0) {
          occultations[key].forEach((item) => {
            if (normalizedDecision.occultation.categoriesToOmit.indexOf(item) === -1) {
              normalizedDecision.occultation.categoriesToOmit.push(item);
            }
          });
        } else if (indOccultation === 1) {
          occultations[key].forEach((item) => {
            if (normalizedDecision.occultation.categoriesToOmit.indexOf(item) !== -1) {
              normalizedDecision.occultation.categoriesToOmit.splice(
                normalizedDecision.occultation.categoriesToOmit.indexOf(item),
                1,
              );
            }
          });
        }
      }
    }

    if (!normalizedDecision.originalText) {
      throw new Error(`JuricaUtils.Normalize: Document '${normalizedDecision.sourceId}' has no text.`);
    }

    if (normalizedDecision.pseudoText) {
      try {
        const zoning = await Juritools.GetZones(
          normalizedDecision.sourceId,
          normalizedDecision.sourceName,
          normalizedDecision.pseudoText,
        );
        if (zoning && !zoning.detail) {
          normalizedDecision.zoning = zoning;
        }
      } catch (e) {
        normalizedDecision.zoning = undefined;
      }
    }

    return normalizedDecision;
  }

  static GetRecommandationOccultation(decision) {
    const correspondanceCodeRecommandation = {
      0: 'aucune',
      1: 'conforme',
      2: 'substituant',
      3: 'complément',
    };
    let code = parseInt(`${decision.JDEC_OCC_COMP}`, 10);
    if (isNaN(code) || code < 0 || code > 3) {
      code = 0;
    }
    return correspondanceCodeRecommandation[code];
  }

  static GetDecisionNumberForIndexing(decision) {
    let number = null;
    try {
      number = [decision.registerNumber.split(' ')[0]];
    } catch (e) {}
    if (Array.isArray(number)) {
      number = number.map((x) => {
        return `${x}`;
      });
      number.sort((a, b) => {
        a = parseInt(a.replace(/\D/gm, '').trim(), 10);
        b = parseInt(b.replace(/\D/gm, '').trim(), 10);
        if (a < b) {
          return -1;
        }
        if (a > b) {
          return 1;
        }
        return 0;
      });
    }
    return number;
  }

  static GetDecisionDateForIndexing(date) {
    let dateForIndexing = null;
    try {
      date = new Date(Date.parse(date));
      if (isNaN(date.getTime())) {
        return null;
      }
      date.setHours(date.getHours() + 2);
      dateForIndexing = date.getFullYear() + '-';
      dateForIndexing += (date.getMonth() < 9 ? '0' + (date.getMonth() + 1) : date.getMonth() + 1) + '-';
      dateForIndexing += date.getDate() < 10 ? '0' + date.getDate() : date.getDate();
    } catch (e) {
      dateForIndexing = null;
    }
    return dateForIndexing;
  }

  static GetDecisionThemesForIndexing(decision) {
    let themes = null;
    if (decision.NACCode) {
      const nac = `${decision.NACCode}`.trim();
      const top = JuricaUtils.GetTopThemeByNAC(nac);
      if (top) {
        if (themes === null) {
          themes = [];
        }
        themes.push(top);
      }
      const sub = JuricaUtils.GetThemeByNAC(nac.substring(0, 2));
      if (sub) {
        if (themes === null) {
          themes = [];
        }
        themes.push(sub);
      }
      const theme = JuricaUtils.GetThemeByNAC(nac);
      if (theme) {
        if (themes === null) {
          themes = [];
        }
        themes.push(theme);
      }
    }
    return themes;
  }

  static async GetJurinetDuplicate(id) {
    const { MongoClient } = require('mongodb');

    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();

    const database = client.db(process.env.MONGO_DBNAME);
    const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
    const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);

    const juricaDoc = await rawJurica.findOne({ _id: id });
    if (juricaDoc === null) {
      await client.close();
      throw new Error(`JuricaUtils.GetJurinetDuplicate: Jurica document ${id} not found.`);
    }

    if (!juricaDoc._portalis) {
      await client.close();
      throw new Error(`JuricaUtils.GetJurinetDuplicate: Jurica document ${id} has no Portalis ID.`);
    }

    const juricaDate = new Date(Date.parse(juricaDoc.JDEC_DATE));
    const juricaDateTop = new Date(Date.parse(juricaDoc.JDEC_DATE));
    const juricaDateBottom = new Date(Date.parse(juricaDoc.JDEC_DATE));
    juricaDateTop.setDate(juricaDateTop.getDate() + 1);
    juricaDateBottom.setDate(juricaDateBottom.getDate() - 1);

    let found = null;
    let jurinetDoc;
    const cursor = await rawJurinet.find({ _portalis: juricaDoc._portalis }, { allowDiskUse: true });
    while ((jurinetDoc = await cursor.next())) {
      const jurinetDate = jurinetDoc.DT_DECISION;
      if (
        found === null &&
        ((juricaDate.getFullYear() === jurinetDate.getFullYear() &&
          juricaDate.getMonth() === jurinetDate.getMonth() &&
          juricaDate.getDate() === jurinetDate.getDate()) ||
          (juricaDateTop.getFullYear() === jurinetDate.getFullYear() &&
            juricaDateTop.getMonth() === jurinetDate.getMonth() &&
            juricaDateTop.getDate() === jurinetDate.getDate()) ||
          (juricaDateBottom.getFullYear() === jurinetDate.getFullYear() &&
            juricaDateBottom.getMonth() === jurinetDate.getMonth() &&
            juricaDateBottom.getDate() === jurinetDate.getDate()))
      ) {
        found = jurinetDoc._id;
      }
    }
    await cursor.close();
    await client.close();
    return found;
  }
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

exports.JuricaUtils = JuricaUtils;

exports.ConvertOccultationBlockInCategoriesToOmit = ConvertOccultationBlockInCategoriesToOmit;
