const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const he = require('he');

class JuricaUtils {
  static CleanHTML(html) {
    html = html.replace(/<\/?[^>]+(>|$)/gm, '');

    html = html.replace(/\t/gim, '');
    html = html.replace(/\\t/gim, '');
    html = html.replace(/\f/gim, '');
    html = html.replace(/\\f/gim, '');

    return he.decode(html).trim();
  }

  static async Normalize(document, previousVersion, ignorePreviousContent) {
    let originalText = undefined;
    let pseudoText = undefined;
    let pseudoStatus = document.IND_ANO;

    try {
      originalText = JuricaUtils.CleanHTML(document.JDEC_HTML_SOURCE);
    } catch (ignore) {}
    try {
      pseudoText = JuricaUtils.CleanHTML(document.HTMLA);
    } catch (ignore) {}

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

    let portalis, bottomDate, topDate;
    const juricaDoc = await rawJurica.findOne({ _id: id });
    if (juricaDoc === null) {
      await client.close();
      throw new Error(`JuricaUtils.GetJurinetDuplicate: Jurica document ${id} not found.`);
    }
    try {
      let html = juricaDoc['JDEC_HTML_SOURCE'];
      html = html.replace(/<\/?[^>]+(>|$)/gm, '');
      portalis = /Portalis(?:\s+|\n+)(\b\S{4}-\S-\S{3}-(?:\s?|\n+)\S+\b)/g.exec(html);
      portalis = portalis[1].replace(/\s/g, '').trim();
      bottomDate = new Date(juricaDoc['JDEC_DATE']);
      bottomDate.setDate(bottomDate.getDate() - 1);
      topDate = new Date(juricaDoc['JDEC_DATE']);
      topDate.setDate(topDate.getDate() + 1);
    } catch (e) {
      await client.close();
      throw new Error(`JuricaUtils.GetJurinetDuplicate: Jurica document ${id} has no compliant Portalis ID.`);
    }

    let jurinetDoc;
    let found = null;
    const jurinetCursor = await rawJurinet.find(
      {
        TYPE_ARRET: { $ne: 'CC' },
        DT_DECISION: { $gte: new Date(bottomDate), $lte: new Date(topDate) },
      },
      { allowDiskUse: true },
    );
    while (found === null && (jurinetDoc = await jurinetCursor.next())) {
      try {
        let portalis2 = /Portalis(?:\s+|\n+)(\b\S{4}-\S-\S{3}-(?:\s?|\n+)\S+\b)/g.exec(jurinetDoc['XML']);
        portalis2 = portalis2[1].replace(/\s/g, '').trim();
        if (portalis === portalis2) {
          found = jurinetDoc._id;
        }
      } catch (e) {
        console.error(e);
      }
    }
    await client.close();
    return found;
  }
}

exports.JuricaUtils = JuricaUtils;
