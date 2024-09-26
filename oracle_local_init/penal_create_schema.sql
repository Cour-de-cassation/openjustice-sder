CREATE TABLE NATAFF (
  ID                       VARCHAR2(20)    NOT NULL,
  LIB                      VARCHAR2(4000)  NULL,
  COULEUR                  VARCHAR2(20)    NULL,
  TYPEAFF                  VARCHAR2(20)    NULL,
  IND_DECATT               NUMBER          NULL,
  IND_ETAT                 NUMBER          NULL,
  ID_NATAFF                VARCHAR2(20)    NULL,
  NB_JOURS                 NUMBER          NULL,
  NB_MOIS                  NUMBER          NULL,
  DELAI_DEPOT_MEMOIRE_JOUR NUMBER          NULL,
  DELAI_DEPOT_MEMOIRE_MOIS NUMBER          NULL,
  IND_NUMAUTO              NUMBER          NULL
);
