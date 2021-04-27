const parser = require('fast-xml-parser');
const he = require('he');

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

    xml = xml.replace(/<texte_arret>[\s\S]*<\/texte_arret>/gim, '');

    // Cleaning of every <TEXTE_ARRET> fragment:
    const texteArret = [];
    for (let j = 0; j < fragments.length; j++) {
      if ((j % 2 !== 0 || j > 1) && j < fragments.length - 1) {
        // There could be some (useless) HTML tags to remove:
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

        fragments[j] = fragments[j].replace(/\t/gim, '');
        fragments[j] = fragments[j].replace(/\\t/gim, '');
        fragments[j] = fragments[j].replace(/\f/gim, '');
        fragments[j] = fragments[j].replace(/\\f/gim, '');
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
          texteArret.push(fragments[j]);
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

    // Bad XML, bad JSON...
    xml = xml.replace(/<\/numpourvoi><numpourvoi\s+id=\"\d+\">/gim, ',');

    // Reinject the merged <TEXTE_ARRET> element(s):
    if (xml.indexOf('</DOCUMENT>') !== -1) {
      xml = xml.replace('</DOCUMENT>', '<TEXTE_ARRET>' + texteArret.join(' ').trim() + '</TEXTE_ARRET></DOCUMENT>');
      xml = xml.trim();
    } else {
      throw new Error(
        'JurinetUtils.CleanXML: End of <DOCUMENT> tag not found: the document could be malformed or corrupted.',
      );
    }

    return xml;
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

  static Normalize(document, previousVersion, ignorePreviousContent) {
    let cleanedXml = null;
    let cleanedXmla = null;
    let originalText = undefined;
    let pseudoText = undefined;
    let pseudoStatus = document.IND_ANO;

    try {
      cleanedXml = JurinetUtils.CleanXML(document.XML);
      cleanedXml = JurinetUtils.XMLToJSON(cleanedXml, {
        filter: false,
        htmlDecode: true,
        toLowerCase: true,
      });
      originalText = cleanedXml.texte_arret;
    } catch (ignore) {}

    try {
      cleanedXmla = JurinetUtils.CleanXML(document.XMLA);
      cleanedXmla = JurinetUtils.XMLToJSON(cleanedXmla, {
        filter: false,
        htmlDecode: true,
        toLowerCase: true,
      });
      pseudoText = cleanedXmla.texte_arret;
    } catch (ignore) {}

    if (previousVersion && !ignorePreviousContent) {
      if (previousVersion.originalText) {
        originalText = previousVersion.originalText;
      }
      if (previousVersion.pseudoText) {
        pseudoText = previousVersion.pseudoText;
      }
      if (previousVersion.pseudoStatus) {
        pseudoStatus = previousVersion.pseudoStatus;
      }
    }

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
      dateCreation: document.DT_CREATION ? document.DT_CREATION.toISOString() : undefined,
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

    return normalizedDecision;
  }
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
