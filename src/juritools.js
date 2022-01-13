const needle = require('needle');

class Juritools {
  static async GetZones(id, source, text, host) {
    if (host === undefined) {
      host = `http://${process.env.ZONING_URI}:${process.env.ZONING_PORT}`;
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
      console.warn(response.body);
    }
    delete response.body.arret_id;
    return response.body;
  }

  static async GetMetaJurinet(data, host) {
    if (host === undefined) {
      host = `http://${process.env.META_URI}:${process.env.META_PORT}`;
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
      host = `http://${process.env.META_URI}:${process.env.META_PORT}`;
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
