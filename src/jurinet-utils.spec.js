const JurinetUtils = require('./jurinet-utils').JurinetUtils;

describe('JurinetUtils', () => {
  describe('CleanXML', () => {
    it('should do nothing with an already clean decision', async () => {
      const xml = buildJurinetXml(['Some decision content']);

      const cleanedXml = JurinetUtils.CleanXML(xml);

      expect(cleanedXml).toEqual(xml);
    });

    it('should merge the different arret tag into one', async () => {
      const textArrets = ['Some arret tag', 'Another arret tag'];
      const xml = buildJurinetXml(textArrets);

      const cleanedXml = JurinetUtils.CleanXML(xml);

      expect(cleanedXml).toEqual(buildJurinetXml([textArrets.join(' ')]));
    });
  });
});

function buildJurinetXml(textArrets) {
  const textArretsWithTags = textArrets.map((textArret) => `<TEXTE_ARRET>${textArret}</TEXTE_ARRET>`);
  const xmlDocument = `<DOCUMENT><CAT_PUB>D</CAT_PUB>${textArretsWithTags.join('')}</DOCUMENT>`;

  return xmlDocument;
}
