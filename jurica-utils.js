const he = require('he')

class JuricaUtils {

  static CleanHTML(html) {
    html = html.replace(/<\/?[^>]+(>|$)/gm, '')

    html = html.replace(/\t/gim, '')
    html = html.replace(/\\t/gim, '')
    html = html.replace(/\f/gim, '')
    html = html.replace(/\\f/gim, '')

    return he.decode(html).trim()
  }

  static Normalize(document, previousVersion) {
    let originalText = undefined
    let pseudoText = undefined
    let pseudoStatus = document.IND_ANO

    try {
      originalText = JuricaUtils.CleanHTML(document.JDEC_HTML_SOURCE)
    } catch (ignore) { }
    try {
      pseudoText = JuricaUtils.CleanHTML(document.HTMLA)
    } catch (ignore) { }

    if (previousVersion) {
      if (previousVersion.originalText) {
        originalText = previousVersion.originalText
      }
      if (previousVersion.pseudoText) {
        pseudoText = previousVersion.pseudoText
      }
      if (previousVersion.pseudoStatus) {
        pseudoStatus = previousVersion.pseudoStatus
      }
    }

    let dateDecision = null
    if (document.JDEC_DATE) {
      dateDecision = new Date()
      let dateDecisionElements = document.JDEC_DATE.split('-')
      dateDecision.setFullYear(parseInt(dateDecisionElements[0], 10))
      dateDecision.setMonth(parseInt(dateDecisionElements[1], 10) - 1)
      dateDecision.setDate(parseInt(dateDecisionElements[2], 10))
      dateDecision.setHours(0)
      dateDecision.setMinutes(0)
      dateDecision.setSeconds(0)
      dateDecision.setMilliseconds(0)
    }

    let dateCreation = null
    if (document.JDEC_DATE_CREATION) {
      dateCreation = new Date()
      let dateCreationElements = document.JDEC_DATE_CREATION
      dateCreation.setFullYear(parseInt(dateCreationElements.substring(0, 4), 10))
      dateCreation.setMonth(parseInt(dateCreationElements.substring(4, 6), 10) - 1)
      dateCreation.setDate(parseInt(dateCreationElements.substring(6), 10))
      dateCreation.setHours(0)
      dateCreation.setMinutes(0)
      dateCreation.setSeconds(0)
      dateCreation.setMilliseconds(0)
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
      dateDecision: dateDecision ? dateDecision.toISOString() : null,
      dateCreation: dateCreation ? dateCreation.toISOString() : null,
      solution: document.JDEC_LIBELLE,
      originalText: originalText ? originalText.replace(/\*DEB[A-Z]*/gm, '').replace(/\*FIN[A-Z]*/gm, '').trim() : undefined,
      pseudoText: pseudoText ? pseudoText.replace(/\*DEB[A-Z]*/gm, '').replace(/\*FIN[A-Z]*/gm, '').trim() : undefined,
      pseudoStatus: pseudoStatus,
      appeals: [],
      analysis: {
        target: undefined,
        link: undefined,
        source: undefined,
        doctrine: undefined,
        title: undefined,
        summary: undefined,
        reference: []
      },
      parties: {},
      locked: false,
      labelStatus: 'toBeTreated',
      labelTreatments: []
    }

    if (previousVersion) {
      if (previousVersion.labelStatus) {
        normalizedDecision.labelStatus = previousVersion.labelStatus
      }
      if (previousVersion.labelTreatments) {
        normalizedDecision.labelTreatments = previousVersion.labelTreatments
      }
      if (previousVersion._version) {
        normalizedDecision._version = previousVersion._version
      }
    }

    return normalizedDecision
  }
}

exports.JuricaUtils = JuricaUtils
