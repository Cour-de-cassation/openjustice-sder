const parser = require('fast-xml-parser');
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
    str = str
      .replace(/<br\s*[^\/>]*\/>/gim, '\n')
      .replace(/\r\n/gm, '\n')
      .replace(/\n\s+/gm, '\n')
      .replace(/\n+/gm, '\n')
      .replace(/\t/gm, ' ')
      .replace(/\f/gm, ' ')
      .replace(/  +/gm, ' ')
      .trim();
    str = str.replace(/\s+\.$/gm, '.');
    return str;
  }

  static CleanXML(xml) {
    // Rename the <CONTENU> tag inside <CITATION_JP> tag:
    xml = xml.replace(/<CITATION_JP>[^<]*<CONTENU>/gm, '<CITATION_JP><CONTENU_JP>');
    xml = xml.replace(/<\/CONTENU>[^<]*<\/CITATION_JP>/gm, '</CONTENU_JP></CITATION_JP>');

    // <CONTENU> splitting and removing:
    const fragments = xml.split(/<\/?CONTENU>/g);

    if (fragments.length < 3) {
      throw new Error('<CONTENU> tag not found or incomplete: the document could be malformed or corrupted.');
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
      throw new Error('End of <BLOC_TEXTUEL> tag not found: the document could be malformed or corrupted.');
    }

    return xml;
  }

  static XMLToJSON(xml, opt) {
    opt = opt || {};
    opt.filter = opt.filter || false;
    let valid = false;

    valid = parser.validate(xml);
    if (valid === true) {
      // Convert the XML document to JSON:
      let finalData = parser.parse(xml, parserOptions);
      finalData = finalData[Object.keys(finalData)[0]];
      if (opt.filter === true) {
        // Remove some undesirable data:
      }
      return finalData;
    } else {
      throw new Error(`Invalid XML document: ${valid.err.msg}, line ${valid.err.line}.`);
    }
  }

  static Normalize(document, previousVersion) {
    let normalizedDecision = {
      _rev: previousVersion ? previousVersion._rev + 1 : 0,
      _version: parseFloat(process.env.MONGO_DECISIONS_VERSION),
      sourceId: document._id,
      sourceName: 'dila',
      jurisdictionId: undefined,
      jurisdictionCode: 'CC',
      jurisdictionName: document.JURIDICTION,
      chamberId: document.FORMATION,
      chamberName: undefined,
      registerNumber: document.NUMERO,
      pubCategory: document.PUB ? 'P' : 'N',
      dateDecision: new Date(Date.parse(document.DATE_DEC)),
      dateCreation: new Date(),
      solution: document.SOLUTION,
      originalText: undefined,
      pseudoText: document.TEXTE,
      pseudoStatus: 2,
      appeals: document.NUMERO_AFFAIRE,
      analysis: {
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
      },
      parties: {},
      locked: false,
      labelStatus: 'exported',
      labelTreatments: [],
    };

    return normalizedDecision;
  }
}

exports.DilaUtils = DilaUtils;
