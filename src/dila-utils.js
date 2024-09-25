const { XMLParser, XMLValidator } = require('fast-xml-parser');
const iconv = require('iconv-lite');
const he = require('he');
iconv.skipDecodeWarning = true;

const parserOptions = {
  attributeNamePrefix: '',
  attrNodeName: false,
  textNodeName: '$TEXT',
  ignoreAttributes: false,
  ignoreNameSpace: true,
  allowBooleanAttributes: false,
  parseNodeValue: true,
  parseAttributeValue: false,
  trimValues: true,
  cdataTagName: false,
  parseTrueNumberOnly: false,
  arrayMode: false,
  trimValues: true,
  tagValueProcessor: (val) => he.decode(he.decode(val)),
  attrValueProcessor: (val) => he.decode(he.decode(val)),
};

const parser = new XMLParser(parserOptions);

class DilaUtils {
  static CleanString(str, removeNumbers) {
    if (typeof str !== 'string') {
      return '';
    }

    str = str.trim();

    if (removeNumbers) {
      str = str.replace(/^\(\s*\d+\s*\)\s*(:|\.)?\s*\n?/gm, '');
      str = str.replace(/^\(\s*\d+\s*°\s*\)\s*(:|\.)?\s*\n?/gm, '');
      str = str.replace(/^\d+\s*°\s*(:|\.)?\s*\n?/gm, '');
    }

    // Handling newlines and carriage returns:
    str = str.replace(/<br\s*[^\/>]*\/>/gim, '\n');
    str = str.replace(/\r\n/gim, '\n');
    str = str.replace(/\r/gim, '\n');

    // Remove extra spaces:
    str = str.replace(/\t/gim, ' ');
    str = str.replace(/\\t/gim, ' '); // That could happen...
    str = str.replace(/\f/gim, ' ');
    str = str.replace(/\\f/gim, ' '); // That could happen too...
    str = DilaUtils.removeMultipleSpace(str);

    // Mysterious chars (cf. https://www.compart.com/fr/unicode/U+0080, etc.):
    str = DilaUtils.replaceErroneousChars(str);

    str = str.replace(/\s+\.$/gm, '.');

    return str.trim();
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

  static CleanXML(xml) {
    // Rename the <CONTENU> tag inside <CITATION_JP> tag:
    xml = xml.replace(/<CITATION_JP>[^<]*<CONTENU>/gm, '<CITATION_JP><CONTENU_JP>');
    xml = xml.replace(/<\/CONTENU>[^<]*<\/CITATION_JP>/gm, '</CONTENU_JP></CITATION_JP>');

    // <CONTENU> splitting and removing:
    const fragments = xml.split(/<\/?CONTENU>/g);

    if (fragments.length < 3) {
      throw new Error(
        'DilaUtils.CleanXML: <CONTENU> tag not found or incomplete: the document could be malformed or corrupted.',
      );
    }

    xml = xml.replace(/<CONTENU>[\s\S]*<\/CONTENU>/gm, '');

    // Cleaning of every <CONTENU> fragment:
    const contenu = [];
    for (let j = 0; j < fragments.length; j++) {
      if ((j % 2 !== 0 || j > 1) && j < fragments.length - 1) {
        // There could be some (useless) HTML tags to remove:
        fragments[j] = fragments[j].replace(/<br\s*[^\/>]*\/>/gim, '\n');
        fragments[j] = fragments[j].replace(/<hr\s*[^\/>]*\/>/gim, '\n');
        fragments[j] = fragments[j].replace(/<\w+\s*[^>]*>/gim, '');
        fragments[j] = fragments[j].replace(/<h\d\s*[^>]*>/gim, '');

        fragments[j] = fragments[j].replace(/<\/p>/gim, '\n');
        fragments[j] = fragments[j].replace(/<\/h\d>/gim, '\n');
        fragments[j] = fragments[j].replace(/<\/\w+>/gim, ' ');

        fragments[j] = fragments[j].replace(/\t/gim, ' ');
        fragments[j] = fragments[j].replace(/\\t/gim, ' ');
        fragments[j] = fragments[j].replace(/\f/gim, ' ');
        fragments[j] = fragments[j].replace(/\\f/gim, ' ');
        fragments[j] = fragments[j].replace(/\r\n/gim, '\n');
        fragments[j] = fragments[j].replace(/\r/gim, '\n');
        fragments[j] = fragments[j].replace(/  +/gm, ' ');

        // Minimal set of entities for XML validation:
        fragments[j] = fragments[j]
          .replace(/&/g, '&amp;')
          .replace(/&amp;amp;/g, '&amp;')
          .replace(/&amp;#/g, '&#');
        fragments[j] = fragments[j].replace(/</g, '&lt;');
        fragments[j] = fragments[j].replace(/>/g, '&gt;');
        fragments[j] = fragments[j].trim();

        // Ignore empty fragment:
        if (fragments[j].length > 0) {
          contenu.push(fragments[j]);
        }
      }
    }

    // Cleaning the rest of the document:
    xml = xml
      .replace(/&/g, '&amp;')
      .replace(/&amp;amp;/g, '&amp;')
      .replace(/&amp;#/g, '&#');
    xml = xml.replace(/\s<\s/g, ' &lt; ');
    xml = xml.replace(/\s>\s/g, ' &gt; ');

    // Reinject the merged <CONTENU> element(s):
    if (xml.indexOf('</BLOC_TEXTUEL>') !== -1) {
      xml = xml.replace('</BLOC_TEXTUEL>', '<CONTENU>' + contenu.join(' ').trim() + '</CONTENU></BLOC_TEXTUEL>');
      xml = xml.trim();
    } else {
      throw new Error(
        'DilaUtils.CleanXML: End of <BLOC_TEXTUEL> tag not found: the document could be malformed or corrupted.',
      );
    }

    return xml;
  }

  static XMLToJSON(xml, opt) {
    opt = opt || {};
    opt.filter = opt.filter || false;
    let valid = false;

    valid = XMLValidator.validate(xml);
    if (valid === true) {
      // Convert the XML document to JSON:
      let finalData = parser.parse(xml);
      finalData = finalData[Object.keys(finalData)[0]];
      if (opt.filter === true) {
        // Remove some undesirable data:
      }
      return finalData;
    } else {
      throw new Error(`DilaUtils.XMLToJSON: Invalid XML document: ${valid.err.msg}, line ${valid.err.line}.`);
    }
  }

  static getJuridictionCode(jurisdictionName) {
    let code;
    /*
    "JURIDICTION": [
      "Cour de cassation",
      "Tribunal de grande instance de Paris",
      "Tribunal d'instance d'Illkirch-Graffenstaden",
      "Tribunal d'instance d'Auch",
      "Tribunal de grande instance d'Auch",
      "Tribunal de commerce de Douai",
      "Tribunal d'instance de Condom"
    ],
    */
    if (jurisdictionName) {
      jurisdictionName = `${jurisdictionName}`.toLowerCase();
      switch (jurisdictionName) {
        case 'cour de cassation':
          code = 'CC';
          break;
        case 'tribunal des conflits':
          code = 'TC';
          break;
        case 'tribunal de grande instance de paris':
          code = 'TGI';
          break;
        default:
          if (jurisdictionName.indexOf('appel') !== -1) {
            code = 'CA';
          } else {
            code = 'OTHER';
          }
      }
    } else {
      code = 'OTHER';
    }
    return code;
  }

  static async Normalize(document, previousVersion) {
    const now = new Date();

    let normalizedDecision = {
      _rev: previousVersion ? previousVersion._rev + 1 : 0,
      _version: parseFloat(process.env.MONGO_DECISIONS_VERSION),
      sourceId: document._id,
      sourceName: 'dila',
      jurisdictionId: undefined,
      jurisdictionCode: DilaUtils.getJuridictionCode(document.JURIDICTION),
      jurisdictionName: document.JURIDICTION,
      chamberId: document.FORMATION,
      chamberName: undefined,
      registerNumber: document.NUMERO,
      pubCategory: document.PUB ? 'P' : 'N',
      dateDecision: new Date(Date.parse(document.DATE_DEC)).toISOString(),
      dateCreation: now.toISOString(),
      solution: document.SOLUTION,
      originalText: undefined,
      pseudoText: document.TEXTE,
      pseudoStatus: 2,
      appeals: document.NUMERO_AFFAIRE,
      analysis: {
        // "NATURE": ["ARRET", "AVIS", "ORDONNANCE", "AUTRES_DECISIONS"],
        nature: document.NATURE,
        target:
          document.FORM_DEC_ATT && document.DATE_DEC_ATT
            ? document.FORM_DEC_ATT + ', ' + document.DATE_DEC_ATT
            : undefined,
        link: document.PRECEDENTS,
        source: document.URL,
        doctrine: undefined,
        title: document.TITRAGE,
        summary: document.SOMMAIRE,
        reference: document.TEXTES_APPLIQUES,
        analyse: [],
      },
      parties: [],
      decatt: null,
      locked: false,
      labelStatus: 'done',
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
      public: true,
      natureAffaireCivil: null,
      natureAffairePenal: null,
      codeMatiereCivil: null,
      recommandationOccultation: null,
      dateImport: previousVersion ? previousVersion.dateImport : now.toISOString(),
      datePublication: previousVersion?.datePublication ?? null,
    };

    return normalizedDecision;
  }
}

exports.DilaUtils = DilaUtils;
