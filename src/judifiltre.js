const needle = require('needle');

class Judifiltre {
  static async SendBatch(batch, host) {
    if (host === undefined) {
      host = `${process.env.JUDIFILTRE_PROTOCOL}://${process.env.JUDIFILTRE_URI}`;
    }
    const response = await needle('post', `${host}/judifiltre/api/publicityInfos`, batch, {
      json: true,
      rejectUnauthorized: false,
    });
    return response.body;
  }

  static async GetBatch(host) {
    if (host === undefined) {
      host = `${process.env.JUDIFILTRE_PROTOCOL}://${process.env.JUDIFILTRE_URI}`;
    }
    const response = await needle('get', `${host}/judifiltre/api/decisions-to-release`, {
      json: true,
      rejectUnauthorized: false,
    });
    let res = response.body;
    if (typeof res === 'string') {
      try {
        res = JSON.parse(res);
      } catch (e) {}
    }
    return res;
  }

  static async DeleteBatch(batch, host) {
    if (host === undefined) {
      host = `${process.env.JUDIFILTRE_PROTOCOL}://${process.env.JUDIFILTRE_URI}`;
    }
    const response = await needle('delete', `${host}/judifiltre/api/publicityInfos`, batch, {
      json: true,
      rejectUnauthorized: false,
    });
    return response.body;
  }

  static async GetQueue(host) {
    if (host === undefined) {
      host = `${process.env.JUDIFILTRE_PROTOCOL}://${process.env.JUDIFILTRE_URI}`;
    }
    const response = await needle('get', `${host}/judifiltre/api/publicityInfos`, {
      json: true,
      rejectUnauthorized: false,
    });
    let res = response.body;
    if (typeof res === 'string') {
      try {
        res = JSON.parse(res);
      } catch (e) {}
    }
    return res;
  }
}

exports.Judifiltre = Judifiltre;
