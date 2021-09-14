const needle = require('needle');

class ZoningUtils {
  static async getZones(id, source, text) {
    const zoneData = {
      arret_id: id,
      source: source,
      text: text,
    };
    const response = await needle('post', `http://${process.env.ZONING_URI}/zonage`, zoneData, {
      json: true,
    });
    if (!response || !response.body || !response.body.zones) {
      console.warn('Zoning failed for the given document.', {
        arret_id: id,
        source: source,
      });
    }
    delete response.body.arret_id;
    return response.body;
  }
}

exports.ZoningUtils = ZoningUtils;
