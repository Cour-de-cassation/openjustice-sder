const needle = require('needle');

class Judifiltre {
  static async SendBatch(batch, host) {
    if (host === undefined) {
      host = `${process.env.JUDIFILTRE_PROTOCOL}://${process.env.JUDIFILTRE_URI}`;
    }
    let response = null;
    try {
      response = await needle('post', `${host}/judifiltre/api/publicityInfos`, batch, {
        json: true,
        rejectUnauthorized: false,
      });
      response = response.body;
    } catch (e) {
      console.error(e);
    }
    return response;
  }

  static async GetBatch(host) {
    if (host === undefined) {
      host = `${process.env.JUDIFILTRE_PROTOCOL}://${process.env.JUDIFILTRE_URI}`;
    }
    let response = null;
    try {
      response = await needle('get', `${host}/judifiltre/api/decisions-to-release`, {
        json: true,
        rejectUnauthorized: false,
      });
      response = response.body;
    } catch (e) {
      console.error(e);
    }
    let res = response;
    if (typeof res === 'string') {
      try {
        res = JSON.parse(res);
      } catch (e) {}
    }
    return res;
  }

  static async GetNotPublicBatch(host) {
    if (host === undefined) {
      host = `${process.env.JUDIFILTRE_PROTOCOL}://${process.env.JUDIFILTRE_URI}`;
    }
    let response = null;
    try {
      response = await needle('get', `${host}/judifiltre/api/decisions-not-public`, {
        json: true,
        rejectUnauthorized: false,
      });
      response = response.body;
    } catch (e) {
      console.error(e);
    }
    let res = response;
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
    let response = null;
    try {
      response = await needle('delete', `${host}/judifiltre/api/publicityInfos`, batch, {
        json: true,
        rejectUnauthorized: false,
      });
      response = response.body;
    } catch (e) {
      console.error(e);
    }
    return response;
  }

  static async GetQueue(host) {
    if (host === undefined) {
      host = `${process.env.JUDIFILTRE_PROTOCOL}://${process.env.JUDIFILTRE_URI}`;
    }
    let response = null;
    try {
      response = await needle('get', `${host}/judifiltre/api/publicityInfos`, {
        json: true,
        rejectUnauthorized: false,
      });
      response = response.body;
    } catch (e) {
      console.error(e);
    }
    let res = response;
    if (typeof res === 'string') {
      try {
        res = JSON.parse(res);
      } catch (e) {}
    }
    return res;
  }
}

exports.Judifiltre = Judifiltre;
