const ConvertOccultationBlockInCategoriesToOmit = require('./jurica-utils').ConvertOccultationBlockInCategoriesToOmit;

describe('ConvertOccultationBlockInCategoriesToOmit', () => {
    it('should return categories for block 1', () => {
      const categoriesToOmit = ConvertOccultationBlockInCategoriesToOmit(1);
  
      expect(categoriesToOmit.sort()).toEqual(
        ['professionnelMagistratGreffier'].sort(),
      );
    });
  
    it('should return categories for block 2', () => {
      const categoriesToOmit = ConvertOccultationBlockInCategoriesToOmit(2);
  
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
      const categoriesToOmit = ConvertOccultationBlockInCategoriesToOmit(3);
  
      expect(categoriesToOmit.sort()).toEqual(
        [
          'professionnelMagistratGreffier',
          'personneMorale',
          'numeroSiretSiren',
        ].sort(),
      );
    });
  
    it('should return categories for block 4', () => {
      const categoriesToOmit = ConvertOccultationBlockInCategoriesToOmit(4);
  
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
      const categoriesToOmit = ConvertOccultationBlockInCategoriesToOmit(null);
  
      expect(categoriesToOmit.sort()).toEqual(
        [
          'professionnelMagistratGreffier',
          'personneMorale',
          'numeroSiretSiren',
        ].sort(),
      );
    });
  

  });
  