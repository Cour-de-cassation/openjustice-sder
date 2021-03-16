const parser = require('fast-xml-parser')
const he = require('he')

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
  trimValues: true
}

class DilaUtils {

  static CleanXML(xml) {
    
    return xml
  }

  static XMLToJSON(xml, opt) {
    opt = opt || {}
    opt.filter = opt.filter || false
    opt.htmlDecode = opt.htmlDecode || false
    opt.toLowerCase = opt.toLowerCase || false
    let valid = false

    valid = parser.validate(xml)
    if (valid === true) {
      // Convert the XML document to JSON:
      let finalData = parser.parse(xml, parserOptions)

      finalData = finalData.DOCUMENT[0]

      if (opt.filter === true) {
        // Remove some undesirable data:
      }

      if (opt.htmlDecode === true) {
        // HTML-decode JSON values:
        finalData = HtmlDecode(finalData)
      }

      if (opt.toLowerCase === true) {
        // Convert JSON keys to lower case:
        finalData = ConvertKeysToLowerCase(finalData)
      }

      return finalData
    } else {
      throw new Error(`Invalid XML document: ${valid}.`)
    }
  }

  static Normalize(document, previousVersion) {
  
  }
}

function ConvertKeysToLowerCase(obj) {
  let output = {}
  for (let i in obj) {
    if (Object.prototype.toString.apply(obj[i]) === '[object Object]') {
      output[i.toLowerCase()] = ConvertKeysToLowerCase(obj[i])
    } else if (Object.prototype.toString.apply(obj[i]) === '[object Array]') {
      if (output[i.toLowerCase()] === undefined) {
        output[i.toLowerCase()] = []
      }
      output[i.toLowerCase()].push(ConvertKeysToLowerCase(obj[i][0]))
    } else {
      output[i.toLowerCase()] = obj[i]
    }
  }
  return output
}

function HtmlDecode(obj) {
  let output = {}
  for (let i in obj) {
    if (Object.prototype.toString.apply(obj[i]) === '[object Object]') {
      output[i] = HtmlDecode(obj[i])
    } else if (Object.prototype.toString.apply(obj[i]) === '[object Array]') {
      if (output[i] === undefined) {
        output[i] = []
      }
      output[i].push(HtmlDecode(obj[i][0]))
    } else {
      try {
        output[i] = he.decode(obj[i])
      } catch (ignore) {
        output[i] = obj[i]
      }
    }
  }
  return output
}

exports.DilaUtils = DilaUtils
