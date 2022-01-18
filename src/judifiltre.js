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
}

exports.Judifiltre = Judifiltre;
