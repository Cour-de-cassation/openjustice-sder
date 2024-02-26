const needle = require('needle');

class Juritools {
  static async GetZones(id, source, text, host) {
    if (host === undefined) {
      host = `${process.env.ZONING_PROTOCOL}://${process.env.ZONING_URI}`;
    }
    console.warn(
      `Juritools:GetZones uses ${host}/zonage to perform request (${process.env.ZONING_PROTOCOL}://${process.env.ZONING_URI}).`,
    );
    if (`${process.env.ZONING_NORMALIZE_SOURCE}` === 'true') {
      switch (`${source}`.toLowerCase()) {
        case 'ca':
        case 'jurica':
          source = 'ca';
          break;
        case 'tj':
        case 'juritj':
          source = 'tj';
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
    let response = null;
    try {
      response = await needle('post', `${host}/zonage`, zoneData, {
        json: true,
        rejectUnauthorized: false,
      });
    } catch (e) {
      console.error(e);
    }
    if (!response || !response.body || !response.body.zones) {
      delete zoneData.text;
      console.error('GetZones failed for the given document.', zoneData, response);
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
    } catch (e) {
      console.error(e);
    }
    if (!response || !response.body) {
      console.error('GetMetaJurinet failed for the given data', data, response);
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
    } catch (e) {
      console.error(e);
    }
    if (!response || !response.body) {
      console.error('GetMetaJurica failed for the given data', data, response);
      return null;
    }
    return response.body;
  }
}

exports.Juritools = Juritools;
