const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);
const parser = require('fast-xml-parser');
const he = require('he');

const { Juritools } = require('./juritools');
const { Judifiltre } = require('./judifiltre');

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

class JuricaUtils {
  static GetUnconditionalNonPublicNAC() {
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
      '27Z',
      '33Z',
      '3AG',
      '3AZ',
      '4JF',
      '4JH',
      '4JI',
      '4JJ',
      '4JK',
      '4JL',
      '70G',
      '97B',
      '97G',
      '97P',
    ];
  }

  static GetConditionalNonPublicNAC() {
    return [
      '4AA',
      '4AB',
      '4AC',
      '4AD',
      '4AE',
      '4AF',
      '4AL',
      '4AM',
      '4AN',
      '4AO',
      '4AP',
      '4EA',
      '4EC',
      '70J',
      '78S',
      '78T',
      '78U',
      '97A',
    ];
  }

  static GetNonPublicNACWithAdditionalCheck(all) {
    if (!all) {
      return ['00A'];
    } else {
      return ['0', '000', '00A', '00X'];
    }
  }

  static GetAdditionalCheck(code) {
    return /^9[0-9a-t]$/i.test(code) === true;
  }

  static GetPartiallyPublicNAC() {
    return [
      '20A',
      '20B',
      '20C',
      '20D',
      '20E',
      '20F',
      '20I',
      '20J',
      '20K',
      '20X',
      '21A',
      '21B',
      '21C',
      '21D',
      '21E',
      '21H',
      '21I',
      '21J',
      '21X',
      '64D',
    ];
  }

  static IsNonPublic(nac, np, publicCheckbox) {
    const cleanedNac = `${nac}`.replace(/\W/gim, '').toUpperCase().trim();
    const cleanedNp = `${np}`.replace(/\W/gim, '').toUpperCase().trim();
    publicCheckbox = parseInt(`${publicCheckbox}`, 10);
    if (!cleanedNac || cleanedNac === 'NULL' || !nac) {
      throw new Error(`invalid NAC code (${nac})`);
    } else if (JuricaUtils.GetUnconditionalNonPublicNAC().indexOf(cleanedNac) !== -1) {
      if (publicCheckbox === 1) {
        throw new Error(`non-public NAC code (${nac}), but JDEC_IND_DEC_PUB is set to 1`);
      }
      return true;
    } else if (JuricaUtils.GetConditionalNonPublicNAC().indexOf(cleanedNac) !== -1) {
      if (publicCheckbox === 0) {
        return true;
      } else if (publicCheckbox === 1) {
        return false;
      } else {
        throw new Error(`public or non-public NAC code (${nac}), but JDEC_IND_DEC_PUB is not set`);
      }
    } else if (JuricaUtils.GetNonPublicNACWithAdditionalCheck(true /* TEMP */).indexOf(cleanedNac) !== -1) {
      /* Finalement non...
      if (publicCheckbox === 1) {
        throw new Error(`non-public NAC code for special procedure (${nac}-${np}), but JDEC_IND_DEC_PUB is set to 1`);
      }
      */
      return true;
      /* TEMP
      if (!cleanedNp || cleanedNp === 'NULL' || !np) {
        throw new Error(`invalid NP code (${np})`);
      } else if (JuricaUtils.GetAdditionalCheck(cleanedNp) === true) {
        if (publicCheckbox === 1) {
          throw new Error(`non-public NAC code for special procedure (${nac}-${np}), but JDEC_IND_DEC_PUB is set to 1`);
        }
        return true;
      } else {
        return false;
      }
      */
    }
    return false;
  }

  static IsPartiallyPublic(nac, np, publicCheckbox) {
    const cleanedNac = `${nac}`.replace(/\W/gim, '').toUpperCase().trim();
    if (!cleanedNac || cleanedNac === 'NULL' || !nac) {
      throw new Error(`invalid NAC code (${nac})`);
    } else if (JuricaUtils.GetPartiallyPublicNAC().indexOf(cleanedNac) !== -1) {
      return true;
    }
    return false;
  }

  static IsPublic(nac, np, publicCheckbox) {
    const nonPublic = JuricaUtils.IsNonPublic(nac, np, publicCheckbox);
    const partiallyPublic = JuricaUtils.IsPartiallyPublic(nac, np, publicCheckbox);
    publicCheckbox = parseInt(`${publicCheckbox}`, 10);
    if (!nonPublic && !partiallyPublic) {
      if (publicCheckbox !== 1) {
        throw new Error(`public NAC code (${nac}), but JDEC_IND_DEC_PUB is not set to 1`);
      }
      return true;
    } else {
      return false;
    }
  }

  static ShouldBeRejected(nac, np, publicCheckbox) {
    try {
      const nonPublic = JuricaUtils.IsNonPublic(nac, np, publicCheckbox);
      const partiallyPublic = JuricaUtils.IsPartiallyPublic(nac, np, publicCheckbox);
      const isPublic = JuricaUtils.IsPublic(nac, np, publicCheckbox);
      return nonPublic && !isPublic && !partiallyPublic;
    } catch (anomaly) {
      return false;
    }
  }

  static ShouldBeSentToJudifiltre(nac, np, publicCheckbox) {
    try {
      const cleanedNac = `${nac}`.replace(/\W/gim, '').toUpperCase().trim();
      if (!cleanedNac || cleanedNac === 'NULL' || !nac) {
        throw new Error(`invalid NAC code (${nac})`);
      }
      const nonPublic = JuricaUtils.IsNonPublic(nac, np, publicCheckbox);
      const partiallyPublic = JuricaUtils.IsPartiallyPublic(nac, np, publicCheckbox);
      const isPublic = JuricaUtils.IsPublic(nac, np, publicCheckbox);
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
      /* TEMP
      if (JuricaUtils.GetNonPublicNACWithAdditionalCheck(true).indexOf(cleanedNac) !== -1) {
        throw new Error(`NAC code requires manual check (${nac})`);
      }
      */
      // @FIXME TEMPORARY:
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
    html = html.replace(/\t/gim, '');
    html = html.replace(/\\t/gim, ''); // That could happen...
    html = html.replace(/\f/gim, '');
    html = html.replace(/\\f/gim, ''); // That could happen too...
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
      labelStatus: pseudoText ? 'exported' : 'toBeTreated',
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
      NACCode: document.JDEC_CODNAC || null,
      NPCode: document.JDEC_CODNACPART || null,
      public:
        parseInt(document.JDEC_IND_DEC_PUB, 10) === 1
          ? true
          : parseInt(document.JDEC_IND_DEC_PUB, 10) === 0
          ? false
          : null,
    };

    try {
      const xml = `<document>${document.JDEC_COLL_PARTIES}</document>`;
      const valid = parser.validate(xml);
      if (valid === true) {
        const json = parser.parse(xml, parserOptions);
        if (
          json &&
          json.document &&
          Array.isArray(json.document) &&
          json.document[0] &&
          json.document[0].partie &&
          Array.isArray(json.document[0].partie) &&
          json.document[0].partie.length > 0
        ) {
          normalizedDecision.parties = json.document[0].partie;
        }
      }
    } catch (e) {}

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

      switch (parseInt(document.JDEC_OCC_COMP, 10)) {
        case 0:
          normalizedDecision.occultation.categoriesToOmit = GetAllCategoriesToOmit();
          break;
        case 1:
          normalizedDecision.occultation.categoriesToOmit = ConvertOccultationBlockInCategoriesToOmit(
            document._bloc_occultation,
          );
          break;
        case 2:
          normalizedDecision.occultation.categoriesToOmit = GetAllCategoriesToOmit();
          normalizedDecision.occultation.additionalTerms = document.JDEC_OCC_COMP_LIBRE || '';
          break;
        case 3:
          normalizedDecision.occultation.categoriesToOmit = ConvertOccultationBlockInCategoriesToOmit(
            document._bloc_occultation,
          );
          normalizedDecision.occultation.additionalTerms = document.JDEC_OCC_COMP_LIBRE || '';
          break;
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

  static async GetJurinetDuplicate(id) {
    const { MongoClient } = require('mongodb');

    const client = new MongoClient(process.env.MONGO_URI, {
      useUnifiedTopology: true,
    });
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
    await client.close();
    return found;
  }

  /* should not be needed anymore
  static async ImportDecatt(id, juricaSource, rawJurica, decisions) {
    const { JudilibreIndex } = require('./judilibre-index');

    let hasChanges = false;
    try {
      let row = await juricaSource.getDecisionByID(id);
      if (row && row._id && row.IND_ANO === 0) {
        let duplicate = false;
        let duplicateId = null;
        try {
          duplicateId = await JuricaUtils.GetJurinetDuplicate(row._id);
          if (duplicateId !== null) {
            duplicateId = `jurinet:${duplicateId}`;
            duplicate = true;
          } else {
            duplicate = false;
          }
        } catch (e) {
          duplicate = false;
        }
        let raw = await rawJurica.findOne({ _id: row._id });
        if (raw === null) {
          row._indexed = null;
          await rawJurica.insertOne(row, { bypassDocumentValidation: true });
          await JudilibreIndex.indexJuricaDocument(row, duplicateId, 'import in rawJurica (decatt)');
          hasChanges = true;
          // import stuff
        } else {
          row._indexed = null;
          await rawJurica.replaceOne({ _id: row._id }, row, { bypassDocumentValidation: true });
          await JudilibreIndex.updateJuricaDocument(row, duplicateId, 'update in rawJurica (decatt)');
        }
        let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
        if (normalized === null) {
          const ShouldBeSentToJudifiltre = JuricaUtils.ShouldBeSentToJudifiltre(
            row.JDEC_CODNAC,
            row.JDEC_CODNACPART,
            row.JDEC_IND_DEC_PUB,
          );
          if (duplicate === false && ShouldBeSentToJudifiltre === true) {
            // XXX TEMP BEGIN
            let normDec = await JuricaUtils.Normalize(row);
            normDec.originalText = JuricaUtils.removeMultipleSpace(normDec.originalText);
            normDec.originalText = JuricaUtils.replaceErroneousChars(normDec.originalText);
            normDec.pseudoText = JuricaUtils.removeMultipleSpace(normDec.pseudoText);
            normDec.pseudoText = JuricaUtils.replaceErroneousChars(normDec.pseudoText);
            normDec._version = decisionsVersion;
            const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
            normDec._id = insertResult.insertedId;
            await JudilibreIndex.indexDecisionDocument(normDec, duplicateId, 'import in decisions (decatt)');
            // XXX TEMP END
            TOO EARLY
            try {
              const judifiltreResult = await Judifiltre.SendBatch([
                {
                  sourceId: row._id,
                  sourceDb: 'jurica',
                  decisionDate: row.JDEC_DATE,
                  jurisdictionName: row.JDEC_CODE_JURIDICTION,
                  fieldCode: row.JDEC_CODNAC + (row.JDEC_CODNACPART ? '-' + row.JDEC_CODNACPART : ''),
                  publicityClerkRequest:
                    row.JDEC_IND_DEC_PUB === null
                      ? 'unspecified'
                      : parseInt(`${row.JDEC_IND_DEC_PUB}`, 10) === 1
                      ? 'public'
                      : 'notPublic',
                },
              ]);
              await JudilibreIndex.updateJuricaDocument(
                row,
                duplicateId,
                `submitted to Judifiltre (decatt): ${JSON.stringify(judifiltreResult)}`,
              );
            } catch (e) {
              console.error(`Jurica import to Judifiltre error processing decision ${row._id} (decatt)`, e);
              await JudilibreIndex.updateJuricaDocument(row, duplicateId, null, e);
            }
            hasChanges = true;
          }
        } else {
          let normDec = await JuricaUtils.Normalize(row, normalized);
          normDec._version = decisionsVersion;
          await decisions.replaceOne({ _id: normalized._id }, normDec, {
            bypassDocumentValidation: true,
          });
          normDec._id = normalized._id;
          await JudilibreIndex.updateDecisionDocument(normDec, duplicateId, 'update in decisions (decatt)');
        }
        await juricaSource.markAsImported(row._id);
      }
    } catch (e) {
      console.error(`Could not process decatt ${id}`, e);
      try {
        await juricaSource.markAsErroneous(id);
      } catch (e) {}
    }

    return hasChanges;
  }
  */
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
    'insee',
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
