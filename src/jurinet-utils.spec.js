const JurinetUtils = require('./jurinet-utils').JurinetUtils;
const ConvertOccultationBlockInCategoriesToOmit = require('./jurinet-utils').ConvertOccultationBlockInCategoriesToOmit;

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

describe('ConvertOccultationBlockInCategoriesToOmit', () => {
  it('should return categories for block 1', () => {
    const categoriesToOmit = ConvertOccultationBlockInCategoriesToOmit({occultationBlock : 1, chamberId: "SOC"});

    expect(categoriesToOmit.sort()).toEqual(
      ['professionnelMagistratGreffier'].sort(),
    );
  });

  it('should return categories for block 2', () => {
    const categoriesToOmit = ConvertOccultationBlockInCategoriesToOmit({occultationBlock : 2, chamberId: "SOC"});

    expect(categoriesToOmit.sort()).toEqual(
      [
        'professionnelMagistratGreffier',
        'dateNaissance',
        'dateMariage',
        'dateDeces',
      ].sort(),
    );
  });

  it('should return categories for block 3', () => {
    const categoriesToOmit = ConvertOccultationBlockInCategoriesToOmit({occultationBlock : 3, chamberId: "SOC"});

    expect(categoriesToOmit.sort()).toEqual(
      [
        'professionnelMagistratGreffier',
        'personneMorale',
        'numeroSiretSiren',
      ].sort(),
    );
  });

  it('should return categories for block 4', () => {
    const categoriesToOmit = ConvertOccultationBlockInCategoriesToOmit({occultationBlock : 4, chamberId: "SOC"});

    expect(categoriesToOmit.sort()).toEqual(
      [
        'professionnelMagistratGreffier',
        'dateNaissance',
        'dateMariage',
        'dateDeces',
        'personneMorale',
        'numeroSiretSiren',
      ].sort(),
    );
  });

  it('should return categories for block null', () => {
    const categoriesToOmit = ConvertOccultationBlockInCategoriesToOmit({occultationBlock : null, chamberId: "SOC"});

    expect(categoriesToOmit.sort()).toEqual(
      [
        'professionnelMagistratGreffier',
        'personneMorale',
        'numeroSiretSiren',
      ].sort(),
    );
  });

  it('should return categories for block 1 if chambre criminelle', () => {
    const categoriesToOmit = ConvertOccultationBlockInCategoriesToOmit({occultationBlock : null, chamberId: "CR"});

    expect(categoriesToOmit.sort()).toEqual(
      [
        'professionnelMagistratGreffier',
      ].sort(),
    );
  });
});


function buildJurinetXml(textArrets) {
  const textArretsWithTags = textArrets.map((textArret) => `<TEXTE_ARRET>${textArret}</TEXTE_ARRET>`);
  const xmlDocument = `<DOCUMENT><CAT_PUB>D</CAT_PUB>${textArretsWithTags.join('')}</DOCUMENT>`;

  return xmlDocument;
}
