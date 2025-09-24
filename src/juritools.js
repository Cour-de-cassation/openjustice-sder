const needle = require('needle');

class Juritools {
  static async GetZones(id, source, text, host) {
    if (host === undefined) {
      host = `http://${process.env.ZONING_URI}`;
    }
    switch (`${source}`.toLowerCase()) {
      case 'ca':
      case 'jurica':
        source = 'ca';
        break;
      case 'cc':
      case 'jurinet':
      case 'juricc':
        source = 'cc';
        break;
      case 'tj':
      case 'juritj':
        source = 'tj';
        break;
      case 'tcom':
      case 'juritcom':
        source = 'tcom';
        break;
      case 'cph':
      case 'portalis':
      case 'juricph':
        source = 'cph';
        break;
      default:
        source = 'cc';
        break;
    }
    const zoneData = {
      arret_id: id,
      source: source,
      text: text,
    };
    let response = null;
    try {
      response = await needle('post', `${host}/zonage`, zoneData, {
        json: true,
        rejectUnauthorized: false,
      });
    } catch (_) {}
    if (!response || !response.body || !response.body.zones) {
      delete zoneData.text;
      return null;
    }
    delete response.body.arret_id;
    return response.body;
  }

  static async GetMetaJurinet(data, host) {
    if (host === undefined) {
      host = `${process.env.META_PROTOCOL}://${process.env.META_URI}:${process.env.META_PORT}`;
    }
    data = {
      metadata: data,
    };
    let response = null;
    try {
      response = await needle('post', `${host}/meta-jurinet`, data, {
        json: true,
        rejectUnauthorized: false,
      });
    } catch (_) {}
    if (!response || !response.body) {
      return null;
    }
    return response.body;
  }

  static async GetMetaJurica(data, host) {
    if (host === undefined) {
      host = `${process.env.META_PROTOCOL}://${process.env.META_URI}:${process.env.META_PORT}`;
    }
    data = {
      metadata: data,
    };
    let response = null;
    try {
      response = await needle('post', `${host}/meta-jurica`, data, {
        json: true,
        rejectUnauthorized: false,
      });
    } catch (_) {}
    if (!response || !response.body) {
      return null;
    }
    return response.body;
  }
}

exports.Juritools = Juritools;
