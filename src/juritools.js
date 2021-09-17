const needle = require('needle');

class Juritools {
  static async GetZones(id, source, text) {
    const zoneData = {
      arret_id: id,
      source: source,
      text: text,
    };
    const response = await needle(
      'post',
      `http://${process.env.ZONING_URI}:${process.env.ZONING_PORT}/zonage`,
      zoneData,
      {
        json: true,
      },
    );
    if (!response || !response.body || !response.body.zones) {
      console.warn('GetZones failed for the given data', zoneData);
    }
    delete response.body.arret_id;
    return response.body;
  }

  static async GetMetaJurinet(data) {
    data = {
      metadata: data,
    };
    const response = await needle(
      'post',
      `http://${process.env.META_URI}:${process.env.META_PORT}/meta-jurinet`,
      data,
      {
        json: true,
      },
    );
    if (!response || !response.body) {
      console.warn('GetMetaJurinet failed for the given data', data);
    }
    return response.body;
  }

  static async GetMetaJurica(data) {
    data = {
      metadata: data,
    };
    const response = await needle('post', `http://${process.env.META_URI}:${process.env.META_PORT}/meta-jurica`, data, {
      json: true,
    });
    if (!response || !response.body) {
      console.warn('GetMetaJurica failed for the given data', data);
    }
    return response.body;
  }
}

exports.Juritools = Juritools;
