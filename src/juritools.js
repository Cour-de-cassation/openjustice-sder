const needle = require('needle');

class Juritools {
  static async GetZones(id, source, text, host) {
    if (host === undefined) {
      host = `${process.env.ZONING_PROTOCOL}://${process.env.ZONING_URI}`;
    }
    if (`${process.env.ZONING_NORMALIZE_SOURCE}` === 'true') {
      switch (`${source}`.toLowerCase()) {
        case 'ca':
        case 'jurica':
          source = 'ca';
          break;
        default:
          source = 'cc';
          break;
      }
    }
    const zoneData = {
      arret_id: id,
      source: source,
      text: text,
    };
    const response = await needle('post', `${host}/zonage`, zoneData, {
      json: true,
      rejectUnauthorized: false,
    });
    if (!response || !response.body || !response.body.zones) {
      delete zoneData.text;
      console.warn('GetZones failed for the given data', zoneData);
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
    const response = await needle('post', `${host}/meta-jurinet`, data, {
      json: true,
      rejectUnauthorized: false,
    });
    if (!response || !response.body) {
      console.warn('GetMetaJurinet failed for the given data', data);
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
    const response = await needle('post', `${host}/meta-jurica`, data, {
      json: true,
      rejectUnauthorized: false,
    });
    if (!response || !response.body) {
      console.warn('GetMetaJurica failed for the given data', data);
    }
    return response.body;
  }
}

exports.Juritools = Juritools;
