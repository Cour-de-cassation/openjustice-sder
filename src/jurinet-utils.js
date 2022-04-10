const parser = require('fast-xml-parser');
const he = require('he');

const { JuricaUtils } = require('./jurica-utils');
const { Juritools } = require('./juritools');
const { DateTime } = require('luxon');
const { ObjectId } = require('mongodb');

const parserOptions = {
  attributeNamePrefix: '$',
  attrNodeName: '$attributes',
  textNodeName: '$value',
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

class JurinetUtils {
  static CleanXML(xml) {
    // <TEXTE_ARRET> splitting and removing:
    const fragments = xml.split(/<\/?texte_arret>/gi);

    if (fragments.length < 3) {
      throw new Error(
        'JurinetUtils.CleanXML: <TEXTE_ARRET> tag not found or incomplete: the document could be malformed or corrupted.',
      );
    }

    // Keep this info for later:
    const textNextToCatPub = xml.indexOf('</CAT_PUB><TEXTE_ARRET>') !== -1;

    xml = xml.replace(/<texte_arret>[\s\S]*<\/texte_arret>/gim, '');

    // Cleaning of every <TEXTE_ARRET> fragment:
    const texteArret = [];
    for (let j = 1; j < fragments.length - 1; j++) {
      // Remove HTML tags:
      fragments[j] = fragments[j].replace(/<br\s*\/>/gim, '\r\n');
      fragments[j] = fragments[j].replace(/<hr\s*\/>/gim, '\r\n');
      fragments[j] = fragments[j].replace(/<a\s+[^>]+>/gim, '');
      fragments[j] = fragments[j].replace(/<b\s+[^>]+>/gim, '');
      fragments[j] = fragments[j].replace(/<i\s+[^>]+>/gim, '');
      fragments[j] = fragments[j].replace(/<u\s+[^>]+>/gim, '');
      fragments[j] = fragments[j].replace(/<em\s+[^>]+>/gim, '');
      fragments[j] = fragments[j].replace(/<strong\s+[^>]+>/gim, '');
      fragments[j] = fragments[j].replace(/<font\s+[^>]+>/gim, '');
      fragments[j] = fragments[j].replace(/<span\s+[^>]+>/gim, '');
      fragments[j] = fragments[j].replace(/<p\s+[^>]+>/gim, '');
      fragments[j] = fragments[j].replace(/<h\d\s+[^>]+>/gim, '');
      fragments[j] = fragments[j].replace(/<\/a>/gim, ' ');
      fragments[j] = fragments[j].replace(/<\/b>/gim, ' ');
      fragments[j] = fragments[j].replace(/<\/i>/gim, ' ');
      fragments[j] = fragments[j].replace(/<\/u>/gim, ' ');
      fragments[j] = fragments[j].replace(/<\/em>/gim, ' ');
      fragments[j] = fragments[j].replace(/<\/strong>/gim, ' ');
      fragments[j] = fragments[j].replace(/<\/font>/gim, ' ');
      fragments[j] = fragments[j].replace(/<\/span>/gim, ' ');
      fragments[j] = fragments[j].replace(/<\/p>/gim, '\r\n');
      fragments[j] = fragments[j].replace(/<\/h\d>/gim, '\r\n');

      // Handling newlines and carriage returns:
      fragments[j] = fragments[j].replace(/\r\n/gim, '\n');
      fragments[j] = fragments[j].replace(/\r/gim, '\n');

      // Remove extra spaces:
      fragments[j] = fragments[j].replace(/\t/gim, '');
      fragments[j] = fragments[j].replace(/\\t/gim, ''); // That could happen...
      fragments[j] = fragments[j].replace(/\f/gim, '');
      fragments[j] = fragments[j].replace(/\\f/gim, ''); // That could happen too...
      fragments[j] = JurinetUtils.removeMultipleSpace(fragments[j]);

      // Mysterious chars (cf. https://www.compart.com/fr/unicode/U+0080, etc.):
      fragments[j] = JurinetUtils.replaceErroneousChars(fragments[j]);

      // Minimal set of entities for XML validation:
      fragments[j] = fragments[j]
        .replace(/&/g, '&amp;')
        .replace(/&amp;amp;/g, '&amp;')
        .replace(/&amp;#/g, '&#');
      fragments[j] = fragments[j].replace(/</g, '&lt;');
      fragments[j] = fragments[j].replace(/>/g, '&gt;');

      // Ignore empty fragment:
      if (fragments[j].length > 0) {
        texteArret.push(fragments[j]);
      }
    }

    if (texteArret.length === 0) {
      throw new Error('JurinetUtils.CleanXML: empty text, the document could be malformed or corrupted.');
    }

    // Cleaning the rest of the document:
    xml = xml
      .replace(/&/g, '&amp;')
      .replace(/&amp;amp;/g, '&amp;')
      .replace(/&amp;#/g, '&#');
    xml = xml.replace(/\s<\s/g, ' &lt; ');
    xml = xml.replace(/\s>\s/g, ' &gt; ');

    // Bad XML, bad JSON...
    xml = xml.replace(/<\/numpourvoi><numpourvoi\s+id=\"\d+\">/gim, ',');

    // Reinject the merged <TEXTE_ARRET> element(s):
    if (textNextToCatPub === true) {
      xml = xml
        .replace('</CAT_PUB>', '</CAT_PUB><TEXTE_ARRET>' + texteArret.join(' ').trim() + '</TEXTE_ARRET>')
        .trim();
    } else if (xml.indexOf('</LIEN_WWW>') !== -1) {
      xml = xml
        .replace('</LIEN_WWW>', '</LIEN_WWW><TEXTE_ARRET>' + texteArret.join(' ').trim() + '</TEXTE_ARRET>')
        .trim();
    } else {
      throw new Error(
        'JurinetUtils.CleanXML: End of <CAT_PUB> tag not found: the document could be malformed or corrupted.',
      );
    }

    return xml;
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

  static XMLToJSON(xml, opt) {
    opt = opt || {};
    opt.filter = opt.filter || false;
    opt.htmlDecode = opt.htmlDecode || false;
    opt.toLowerCase = opt.toLowerCase || false;
    let valid = false;

    valid = parser.validate(xml);
    if (valid === true) {
      // Convert the XML document to JSON:
      let finalData = parser.parse(xml, parserOptions);

      finalData = finalData.DOCUMENT[0];

      if (opt.filter === true) {
        // Remove some undesirable data:
        finalData.PARTIES = undefined;
        finalData.AVOCATS = undefined;
      }

      if (opt.htmlDecode === true) {
        // HTML-decode JSON values:
        finalData = HtmlDecode(finalData);
      }

      if (opt.toLowerCase === true) {
        // Convert JSON keys to lower case:
        finalData = ConvertKeysToLowerCase(finalData);
      }

      return finalData;
    } else {
      throw new Error(`JurinetUtils.XMLToJSON: Invalid XML document: ${valid}.`);
    }
  }

  static async IndexAffaire(doc, jIndexMain, jIndexAffaires, rawJurica, jurinetConnection, grcomConnection) {
    const { JudilibreIndex } = require('./judilibre-index');
    let res = 'done';
    if (doc.DT_DECISION) {
      let objAlreadyStored = await jIndexAffaires.findOne({ ids: `jurinet:${doc._id}` });
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
      let date = new Date(Date.parse(doc.DT_DECISION.toISOString()));
      date.setHours(date.getHours() + 2);
      let dateForIndexing = date.getFullYear() + '-';
      dateForIndexing += (date.getMonth() < 9 ? '0' + (date.getMonth() + 1) : date.getMonth() + 1) + '-';
      dateForIndexing += date.getDate() < 10 ? '0' + date.getDate() : date.getDate();
      if (objToStore.ids.indexOf(`jurinet:${doc._id}`) === -1) {
        objToStore.ids.push(`jurinet:${doc._id}`);
      }
      if (objToStore.dates.indexOf(dateForIndexing) === -1) {
        objToStore.dates.push(dateForIndexing);
      }
      if (objToStore.jurisdictions.indexOf('Cour de cassation') === -1) {
        objToStore.jurisdictions.push('Cour de cassation');
      }
      objToStore.dates_jurisdictions[dateForIndexing] = 'Cour de cassation';
      const pourvoiQuery = `SELECT LIB
        FROM NUMPOURVOI
        WHERE NUMPOURVOI.ID_DOCUMENT = :id`;
      const pourvoiResult = await jurinetConnection.execute(pourvoiQuery, [doc._id]);
      if (pourvoiResult && pourvoiResult.rows && pourvoiResult.rows.length > 0) {
        for (let ii = 0; ii < pourvoiResult.rows.length; ii++) {
          if (objToStore.numbers.indexOf(pourvoiResult.rows[ii]['LIB']) === -1) {
            objToStore.numbers.push(pourvoiResult.rows[ii]['LIB']);
          }
          objToStore.numbers_ids[pourvoiResult.rows[ii]['LIB']] = `jurinet:${doc._id}`;
          objToStore.numbers_dates[pourvoiResult.rows[ii]['LIB']] = dateForIndexing;
          objToStore.numbers_jurisdictions[pourvoiResult.rows[ii]['LIB']] = 'Cour de cassation';
          const affaireQuery = `SELECT GPCIV.AFF.ID_AFFAIRE
            FROM GPCIV.AFF
            WHERE CONCAT(GPCIV.AFF.CLE, GPCIV.AFF.CODE) = :pourvoi`;
          const affaireResult = await jurinetConnection.execute(affaireQuery, [pourvoiResult.rows[ii]['LIB']]);
          if (affaireResult && affaireResult.rows && affaireResult.rows.length > 0) {
            if (objToStore.affaires.indexOf(affaireResult.rows[0]['ID_AFFAIRE']) === -1) {
              objToStore.affaires.push(affaireResult.rows[0]['ID_AFFAIRE']);
            }
            objToStore.numbers_affaires[pourvoiResult.rows[ii]['LIB']] = affaireResult.rows[0]['ID_AFFAIRE'];
          }
        }
      }
      if (objToStore.affaires.length > 0) {
        for (let i = 0; i < objToStore.affaires.length; i++) {
          const decattQuery = `SELECT GPCIV.AFF.ID_ELMSTR, GPCIV.DECATT.NUM_RG, GPCIV.DECATT.DT_DECATT
            FROM GPCIV.DECATT, GPCIV.AFF
            WHERE GPCIV.DECATT.ID_AFFAIRE = GPCIV.AFF.ID_AFFAIRE AND GPCIV.DECATT.ID_AFFAIRE = :id_affaire`;
          const decattResult = await jurinetConnection.execute(decattQuery, [objToStore.affaires[i]]);
          if (
            decattResult &&
            decattResult.rows &&
            decattResult.rows.length > 0 &&
            decattResult.rows[0]['ID_ELMSTR'] &&
            decattResult.rows[0]['NUM_RG'] &&
            decattResult.rows[0]['DT_DECATT']
          ) {
            let decattDate = new Date(Date.parse(decattResult.rows[0]['DT_DECATT']));
            decattDate.setHours(decattDate.getHours() + 2);
            let strDecatt = decattDate.getFullYear();
            strDecatt +=
              '-' + (decattDate.getMonth() + 1 < 10 ? '0' + (decattDate.getMonth() + 1) : decattDate.getMonth() + 1);
            strDecatt += '-' + (decattDate.getDate() < 10 ? '0' + decattDate.getDate() : decattDate.getDate());
            const GRCOMQuery = `SELECT LIB_ELM
              FROM ELMSTR
              WHERE ID_ELMSTR = :id_elmstr`;
            const GRCOMResult = await grcomConnection.execute(GRCOMQuery, [decattResult.rows[0]['ID_ELMSTR']]);
            if (GRCOMResult && GRCOMResult.rows && GRCOMResult.rows.length > 0) {
              let decatt = null;
              let RGTerms = ['', ''];
              try {
                RGTerms = `${decattResult.rows[0]['NUM_RG']}`.split('/');
                RGTerms[0] = RGTerms[0].replace(/\D/gm, '').replace(/^0+/gm, '').trim();
                RGTerms[1] = RGTerms[1].replace(/\D/gm, '').replace(/^0+/gm, '').trim();
              } catch (ignore) {}
              decatt = await rawJurica.findOne({
                JDEC_NUM_RG: { $regex: `^0*${RGTerms[0]}/0*${RGTerms[1]}$` },
                JDEC_JURIDICTION: JuricaUtils.GetJuricaLocationFromELMSTRLocation(GRCOMResult.rows[0]['LIB_ELM']),
                JDEC_DATE: strDecatt,
              });
              if (decatt !== null) {
                if (decatt.JDEC_NUM_RG !== decattResult.rows[0]['NUM_RG']) {
                  decattResult.rows[0]['NUM_RG'] = decatt.JDEC_NUM_RG;
                }
                if (objToStore.numbers.indexOf(decattResult.rows[0]['NUM_RG']) === -1) {
                  objToStore.numbers.push(decattResult.rows[0]['NUM_RG']);
                }
                if (objToStore.ids.indexOf(`jurica:${decatt._id}`) === -1) {
                  objToStore.ids.push(`jurica:${decatt._id}`);
                }
                if (objToStore.dates.indexOf(strDecatt) === -1) {
                  objToStore.dates.push(strDecatt);
                }
                if (objToStore.jurisdictions.indexOf(GRCOMResult.rows[0]['LIB_ELM']) === -1) {
                  objToStore.jurisdictions.push(GRCOMResult.rows[0]['LIB_ELM']);
                }
                objToStore.numbers_ids[decattResult.rows[0]['NUM_RG']] = `jurica:${decatt._id}`;
                objToStore.numbers_dates[decattResult.rows[0]['NUM_RG']] = strDecatt;
                objToStore.numbers_affaires[decattResult.rows[0]['NUM_RG']] = objToStore.affaires[i];
                objToStore.dates_jurisdictions[strDecatt] = GRCOMResult.rows[0]['LIB_ELM'];
                objToStore.numbers_jurisdictions[decattResult.rows[0]['NUM_RG']] = GRCOMResult.rows[0]['LIB_ELM'];
                res = 'decatt-found';
              } else {
                if (objToStore.numbers.indexOf(decattResult.rows[0]['NUM_RG']) === -1) {
                  objToStore.numbers.push(decattResult.rows[0]['NUM_RG']);
                }
                if (objToStore.dates.indexOf(strDecatt) === -1) {
                  objToStore.dates.push(strDecatt);
                }
                if (objToStore.jurisdictions.indexOf(GRCOMResult.rows[0]['LIB_ELM']) === -1) {
                  objToStore.jurisdictions.push(GRCOMResult.rows[0]['LIB_ELM']);
                }
                objToStore.numbers_dates[decattResult.rows[0]['NUM_RG']] = strDecatt;
                objToStore.numbers_affaires[decattResult.rows[0]['NUM_RG']] = objToStore.affaires[i];
                objToStore.dates_jurisdictions[strDecatt] = GRCOMResult.rows[0]['LIB_ELM'];
                objToStore.numbers_jurisdictions[decattResult.rows[0]['NUM_RG']] = GRCOMResult.rows[0]['LIB_ELM'];
                res = 'decatt-not-found';
              }
            } else {
              if (objToStore.numbers.indexOf(decattResult.rows[0]['NUM_RG']) === -1) {
                objToStore.numbers.push(decattResult.rows[0]['NUM_RG']);
              }
              if (objToStore.dates.indexOf(strDecatt) === -1) {
                objToStore.dates.push(strDecatt);
              }
              objToStore.numbers_dates[decattResult.rows[0]['NUM_RG']] = strDecatt;
              objToStore.numbers_affaires[decattResult.rows[0]['NUM_RG']] = objToStore.affaires[i];
              res = 'decatt-not-found';
            }
          } else {
            res = 'no-decatt';
          }
        }
        objToStore.dates.sort();
        if (objAlreadyStored === null) {
          await jIndexAffaires.insertOne(objToStore, { bypassDocumentValidation: true });
        } else if (JSON.stringify(objToStore) !== JSON.stringify(objAlreadyStored)) {
          await jIndexAffaires.replaceOne({ _id: objAlreadyStored._id }, objToStore, {
            bypassDocumentValidation: true,
          });
        }
      } else {
        res = 'no-affaire';
      }
      for (let jj = 0; jj < objToStore.ids.length; jj++) {
        if (objToStore.ids[jj] === `jurinet:${doc._id}`) {
          const found = await jIndexMain.findOne({ _id: objToStore.ids[jj] });
          if (found === null) {
            const indexedDoc = await JudilibreIndex.buildJurinetDocument(doc);
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

  static async Normalize(document, previousVersion, ignorePreviousContent) {
    let cleanedXml = null;
    let cleanedXmla = null;
    let originalText = undefined;
    let pseudoText = undefined;
    let pseudoStatus = document.IND_ANO;

    if (document.XML) {
      try {
        cleanedXml = JurinetUtils.CleanXML(document.XML);
        cleanedXml = JurinetUtils.XMLToJSON(cleanedXml, {
          filter: false,
          htmlDecode: true,
          toLowerCase: true,
        });
        originalText = cleanedXml.texte_arret;
      } catch (e) {
        console.warn(
          `JurinetUtils.Normalize: Could not properly clean the original text of document '${document._id}'.`,
        );
        console.warn(e);
      }
    }

    if (document.XMLA) {
      try {
        cleanedXmla = JurinetUtils.CleanXML(document.XMLA);
        cleanedXmla = JurinetUtils.XMLToJSON(cleanedXmla, {
          filter: false,
          htmlDecode: true,
          toLowerCase: true,
        });
        pseudoText = cleanedXmla.texte_arret;
      } catch (e) {
        console.warn(
          `JurinetUtils.Normalize: Could not properly clean the pseudonymized text of document '${document._id}'.`,
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

    const now = new Date();

    let normalizedDecision = {
      _rev: previousVersion ? previousVersion._rev + 1 : 0,
      _version: parseFloat(process.env.MONGO_DECISIONS_VERSION),
      sourceId: document._id,
      sourceName: 'jurinet',
      jurisdictionId: undefined,
      jurisdictionCode: document.TYPE_ARRET,
      jurisdictionName: document.JURIDICTION,
      chamberId: document.ID_CHAMBRE,
      chamberName: undefined,
      registerNumber: document.NUM_DECISION,
      pubCategory: document.CAT_PUB,
      dateDecision: document.DT_DECISION ? document.DT_DECISION.toISOString() : undefined,
      dateCreation: now.toISOString(),
      solution: document.ID_SOLUTION,
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
        target: document.TEXTE_VISE,
        link: document.RAPROCHEMENT,
        source: document.SOURCE,
        doctrine: document.DOCTRINE,
        title: undefined,
        summary: undefined,
        reference: [],
        analyse: [],
      },
      parties: [],
      decatt: null,
      locked: false,
      labelStatus: pseudoText ? 'exported' : 'toBeTreated',
      labelTreatments: [],
      zoning: undefined,
      occultation: {
        additionalTerms: '',
        categoriesToOmit: [],
      },
      publication: [],
      formation: undefined,
      blocOccultation: undefined,
      endCaseCode: null,
      NACCode: null,
      NPCode: null,
      public: null,
      natureAffaireCivil: null,
      natureAffairePenal: null,
      codeMatiereCivil: null,
    };

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

    if (cleanedXml && cleanedXml.numpourvois && cleanedXml.numpourvois[0] && cleanedXml.numpourvois[0].numpourvoi) {
      normalizedDecision.appeals = cleanedXml.numpourvois[0].numpourvoi[0]['$value'].split(',');
    }

    if (cleanedXml && cleanedXml.analyses && cleanedXml.analyses[0].analyse) {
      normalizedDecision.analysis.title = cleanedXml.analyses[0].analyse[0].titre_principal
        .split('*')
        .map((x) => {
          return x.trim();
        })
        .filter((x) => {
          return x.length > 0;
        });
      normalizedDecision.analysis.summary = cleanedXml.analyses[0].analyse[0].sommaire;
    }

    if (document._titrage && document._titrage.length) {
      document._titrage.forEach((reference) => {
        let normalizedReference = [];
        for (let key in reference) {
          switch (key) {
            case 'ID_DOCUMENT':
            case 'NUM_ANALYSE':
            case 'NUM_TITREREFERENCE':
              break;
            default:
              if (reference[key] && typeof reference[key] === 'string') {
                normalizedReference.push(reference[key].replace(/\*/gim, '').trim());
              } else {
                normalizedReference.push(reference[key]);
              }
              break;
          }
        }
        if (normalizedReference) {
          normalizedDecision.analysis.reference.push(normalizedReference);
        }
      });
    }

    if (document._analyse && document._analyse.length) {
      document._analyse.forEach((reference) => {
        let normalizedReference = [];
        for (let key in reference) {
          switch (key) {
            case 'ID_DOCUMENT':
            case 'NUM_ANALYSE':
            case 'NUM_TITREREFERENCE':
              break;
            default:
              if (reference[key] && typeof reference[key] === 'string') {
                normalizedReference.push(reference[key].replace(/\*/gim, '').trim());
              } else {
                normalizedReference.push(reference[key]);
              }
              break;
          }
        }
        if (normalizedReference) {
          normalizedDecision.analysis.analyse.push(normalizedReference);
        }
      });
    }

    if (document._partie && document._partie.length) {
      document._partie.forEach((reference) => {
        let normalizedReference = [];
        for (let key in reference) {
          switch (key) {
            case 'ID_DOCUMENT':
              break;
            default:
              if (reference[key] && typeof reference[key] === 'string') {
                normalizedReference.push(reference[key].replace(/\*/gim, '').trim());
              } else {
                normalizedReference.push(reference[key]);
              }
              break;
          }
        }
        if (normalizedReference) {
          normalizedDecision.parties.push(normalizedReference);
        }
      });
    }

    if (document._decatt && document._decatt.length > 0) {
      normalizedDecision.decatt = document._decatt;
    }

    if (document._bloc_occultation) {
      normalizedDecision.blocOccultation = document._bloc_occultation;
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

    const occultations = {
      IND_PM: ['personneMorale', 'numeroSiretSiren'],
      IND_ADRESSE: ['adresse', 'localite', 'etablissement'],
      IND_DT_NAISSANCE: ['dateNaissance'],
      IND_DT_DECE: ['dateDeces'],
      IND_DT_MARIAGE: ['dateMariage'],
      IND_IMMATRICULATION: ['plaqueImmatriculation'],
      IND_CADASTRE: ['cadastre'],
      IND_CHAINE: ['compteBancaire', 'telephoneFax', 'insee'],
      IND_COORDONNEE_ELECTRONIQUE: ['email'],
      IND_PRENOM_PROFESSIONEL: ['professionnelMagistratGreffier'],
      IND_NOM_PROFESSIONEL: ['professionnelMagistratGreffier'],
    };

    for (let key in occultations) {
      if (key === 'IND_PM' || key === 'IND_NOM_PROFESSIONEL' || key === 'IND_PRENOM_PROFESSIONEL') {
        if (!document[key]) {
          occultations[key].forEach((item) => {
            normalizedDecision.occultation.categoriesToOmit.push(item);
          });
        }
      } else {
        if (!document[key] && document[key] !== null && document[key] !== undefined) {
          occultations[key].forEach((item) => {
            normalizedDecision.occultation.categoriesToOmit.push(item);
          });
        }
      }
    }

    if (typeof document.OCCULTATION_SUPPLEMENTAIRE === 'string') {
      document.OCCULTATION_SUPPLEMENTAIRE = document.OCCULTATION_SUPPLEMENTAIRE.trim();
    }
    if (!!document.OCCULTATION_SUPPLEMENTAIRE) {
      normalizedDecision.occultation.additionalTerms = document.OCCULTATION_SUPPLEMENTAIRE;
    }

    if (document.IND_BULLETIN === 1) {
      normalizedDecision.publication.push('B');
    }
    if (document.IND_RAPPORT === 1) {
      normalizedDecision.publication.push('R');
    }
    if (document.IND_LETTRE === 1) {
      normalizedDecision.publication.push('L');
    }
    if (document.IND_COMMUNIQUE === 1) {
      normalizedDecision.publication.push('C');
    }

    if (document.ID_FORMATION) {
      normalizedDecision.formation = document.ID_FORMATION;
    }

    if (document._natureAffaireCivil) {
      normalizedDecision.natureAffaireCivil = document._natureAffaireCivil;
    }

    if (document._natureAffairePenal) {
      normalizedDecision.natureAffairePenal = document._natureAffairePenal;
    }

    if (document._codeMatiereCivil) {
      normalizedDecision.codeMatiereCivil = document._codeMatiereCivil;
    }

    if (!normalizedDecision.originalText) {
      throw new Error(`JurinetUtils.Normalize: Document '${normalizedDecision.sourceId}' has no text.`);
    }

    return normalizedDecision;
  }

  static ParseMonth(str) {
    str = str.toLowerCase();
    let month = 0;
    switch (str.substring(0, 3)) {
      case 'jan':
        month = 1;
        break;
      case 'fev':
      case 'fév':
        month = 2;
        break;
      case 'mar':
        month = 3;
        break;
      case 'avr':
        month = 4;
        break;
      case 'mai':
        month = 5;
        break;
      case 'jui':
      case 'jul':
        if (str.indexOf('l') !== -1) {
          month = 7;
        } else {
          month = 6;
        }
        break;
      case 'aou':
      case 'aoû':
        month = 8;
        break;
      case 'sep':
        month = 9;
        break;
      case 'oct':
        month = 10;
        break;
      case 'nov':
        month = 11;
        break;
      case 'dec':
      case 'déc':
        month = 12;
        break;
    }
    return month;
  }

  static GetDecisionNumberForIndexing(decision, zoning) {
    let number = null;
    if (
      zoning &&
      !zoning.detail &&
      zoning.introduction_subzonage &&
      zoning.introduction_subzonage.pourvoi &&
      Array.isArray(zoning.introduction_subzonage.pourvoi) &&
      zoning.introduction_subzonage.pourvoi.length > 0
    ) {
      number = zoning.introduction_subzonage.pourvoi;
    } else if (decision.appeals && Array.isArray(decision.appeals) && decision.appeals.length > 0) {
      number = decision.appeals;
    } else if (decision.registerNumber) {
      number = [decision.registerNumber];
    }
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
}

function ConvertOccultationBlockInCategoriesToOmit({occultationBlock, chamberId}) {
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
        categoriesToOmit.push(
          'dateNaissance',
          'dateMariage',
          'dateDeces',
          'personneMorale',
          'numeroSiretSiren',
        );
        break;
    }
  } else if(chamberId !== "CR"){
    categoriesToOmit.push('personneMorale', 'numeroSiretSiren');
  }
  return categoriesToOmit;
}

function ConvertKeysToLowerCase(obj) {
  let output = {};
  for (let i in obj) {
    if (Object.prototype.toString.apply(obj[i]) === '[object Object]') {
      output[i.toLowerCase()] = ConvertKeysToLowerCase(obj[i]);
    } else if (Object.prototype.toString.apply(obj[i]) === '[object Array]') {
      if (output[i.toLowerCase()] === undefined) {
        output[i.toLowerCase()] = [];
      }
      output[i.toLowerCase()].push(ConvertKeysToLowerCase(obj[i][0]));
    } else {
      output[i.toLowerCase()] = obj[i];
    }
  }
  return output;
}

function HtmlDecode(obj) {
  let output = {};
  for (let i in obj) {
    if (Object.prototype.toString.apply(obj[i]) === '[object Object]') {
      output[i] = HtmlDecode(obj[i]);
    } else if (Object.prototype.toString.apply(obj[i]) === '[object Array]') {
      if (output[i] === undefined) {
        output[i] = [];
      }
      output[i].push(HtmlDecode(obj[i][0]));
    } else {
      try {
        output[i] = he.decode(obj[i]);
      } catch (ignore) {
        output[i] = obj[i];
      }
    }
  }
  return output;
}

exports.JurinetUtils = JurinetUtils;

exports.ConvertOccultationBlockInCategoriesToOmit = ConvertOccultationBlockInCategoriesToOmit