const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const he = require('he');

class JuricaUtils {
  static CleanHTML(html) {
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
    html = html.replace(/  +/gm, ' ').trim();
    // Decode HTML entities:
    return he.decode(html);
  }

  static async Normalize(document, previousVersion, ignorePreviousContent) {
    let originalText = undefined;
    let pseudoText = undefined;
    let pseudoStatus = document.IND_ANO;

    try {
      originalText = JuricaUtils.CleanHTML(document.JDEC_HTML_SOURCE);
    } catch (e) {
      console.warn(`JuricaUtils.Normalize: Could not properly clean the original text of document '${document._id}'.`);
      console.warn(e);
    }
    try {
      pseudoText = JuricaUtils.CleanHTML(document.HTMLA);
    } catch (e) {
      console.warn(
        `JuricaUtils.Normalize: Could not properly clean the pseudonymized text of document '${document._id}'.`,
      );
      console.warn(e);
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
      dateCreation: dateCreation,
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

    if (!normalizedDecision.originalText) {
      throw new Error(`JuricaUtils.Normalize: Document '${normalizedDecision.sourceId}' has not text.`);
    }

    return normalizedDecision;
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
}

exports.JuricaUtils = JuricaUtils;
