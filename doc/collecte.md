# Règles de collecte

## Cour de Cassation

### Nouvelles décisions

On collecte chaque matin (entre 8h et 12h) toutes les décisions qui remplissent l'ensemble de ces critères depuis la base documentaire (Oracle/Jurinet) :

- Champ `XML` non vide : le document possède _a priori_ une décision au format texte brut au sein de ce champ complexe (il arrive cependant que ce texte soit finalement vide, ce qui constitue une anomalie entraînant le rejet de la décision) ;
- Champ `XMLA` vide : pas de contenu pseudonymisé ;
- Champ `IND_ANO` égal à `0` : le statut de pseudonymisation est "non traité" ;
- Champ `DT_CREATION` supérieur ou égal à `jour J - 1 mois` : la décision a été intégrée dans la base documentaire il y a _au plus_ un mois ;
- Champ `DT_DECISION` supérieur ou égal à `jour J - 6 mois` **ET** strictement inférieur à `jour J + 1` : la date de rendu de la décision n'est pas antérieure de 6 mois, ni postérieure, à la date du jour ;
- **ET** :
  - Champ `TYPE_ARRET` égal à `CC` : décision de la Cour de Cassation ;
  - **OU** champ `TYPE_ARRET` égal à `AUTRE` **ET** (champ `ID_CHAMBRE` égal à `T.CFL` **OU** champ `JURIDICTION` contient `judiciaire de paris` ) : décision du Tribunal des Conflits ou du Tribunal Judiciaire de Paris (décisions collectées pour traitement par Label mais pas forcément plubliées, cf. documentation des règles de publication).

Chaque décision qui remplit ces critères subit alors les traitements suivants :

- Normalisation et intégration dans la base SDER, avec les états déclenchant sa prise en compte par Label :
  - `labelStatus` = `toBeTreated` ;
  - `publishStatus` = `toBePublished`.
- Passage du champ `IND_ANO` à `1` dans la base documentaire (Oracle/Jurinet) : le statut de pseudonymisation devient "en cours de traitement".

En cas d'erreur ou d'anomalie lors de la collecte d'une décision, on passe son champ `IND_ANO` à `4` dans la base documentaire (Oracle/Jurinet) : le statut de pseudonymisation devient "en erreur".

### Décisions mises à jour

En complément, durant le même créneau (chaque matin entre 8h et 12h), on collecte toutes les décisions qui remplissent l'ensemble de ces critères :

- Champ `XML` non vide : le document possède _a priori_ une décision au format texte brut au sein de ce champ complexe (il arrive cependant que ce texte soit finalement vide, ce qui constitue une anomalie entraînant le rejet de la décision) ;
- Champ `DT_MODIF` supérieur à `date de dernière collecte` : la décision a été modifiée (en amont) postérieurement à la dernière collecte ;
- Champ `DT_DECISION` supérieur ou égal à `jour J - 6 mois` **ET** strictement inférieur à `jour J + 1` : la date de rendu de la décision n'est pas antérieure de 6 mois, ni postérieure, à la date du jour ;
- **ET** :
  - Champ `TYPE_ARRET` égal à `CC` : décision de la Cour de Cassation ;
  - **OU** champ `TYPE_ARRET` égal à `AUTRE` **ET** (champ `ID_CHAMBRE` égal à `T.CFL` **OU** champ `JURIDICTION` contient `judiciaire de paris` ) : décision du Tribunal des Conflits ou du Tribunal Judiciaire de Paris (décisions collectées pour traitement par Label mais pas forcément plubliées, cf. documentation des règles de publication).

Ces décisions, déjà collectées (parfois le jour même), ont potentiellement été mises à jour en amont (via Nomos). La suite du (re)traitement qu'elles doivent subir dépend des champs effectivement modifiés.

Ainsi, chacune de ces décisions doit repasser par Label (_son contenu pseudonymisé étant alors réinitialisé !_), si au moins l'un des champs suivants est modifié :

- `XML` : contenu de la décision (_a priori_) ;
- `IND_PM` : indicateur d'occultation des catégories `personneMorale` et `numeroSiretSiren` ;
- `IND_ADRESSE` : indicateur d'occultation des catégories `adresse`, `localite` et `etablissement` ;
- `IND_DT_NAISSANCE` : indicateur d'occultation de la catégorie `dateNaissance` ;
- `IND_DT_DECE` : indicateur d'occultation de la catégorie `dateDeces` ;
- `IND_DT_MARIAGE` : indicateur d'occultation de la catégorie `dateMariage` ;
- `IND_IMMATRICULATION` : indicateur d'occultation de la catégorie `plaqueImmatriculation` ;
- `IND_CADASTRE` : indicateur d'occultation de la catégorie `cadastre` ;
- `IND_CHAINE` : indicateur d'occultation des catégories `compteBancaire`, `telephoneFax` et `numeroIdentifiant` ;
- `IND_COORDONNEE_ELECTRONIQUE` : indicateur d'occultation de la catégorie `email` ;
- `IND_PRENOM_PROFESSIONEL` : indicateur d'occultation de la catégorie `professionnelMagistratGreffier` ;
- `IND_NOM_PROFESSIONEL` : indicateur d'occultation de la catégorie `professionnelMagistratGreffier` ;
- `OCCULTATION_SUPPLEMENTAIRE` : occultation complémentaire (saisie libre) ;
- `_bloc_occultation` ;
- `_natureAffaireCivil` ;
- `_natureAffairePenal` ;
- `_codeMatiereCivil`.

Dans ce cas (décision devant repasser par Label), la décision subit les traitements suivants :

- Modification du document intégré dans la base SDER, avec les états déclenchant sa nouvelle prise en compte par Label :
  - Suppression du texte pseudonymisé ;
  - Suppression du zonage ;
  - Suppression des `labelTreatments` ;
  - `labelStatus` = `toBeTreated` ;
  - `publishStatus` = `toBePublished`.
- Passage du champ `IND_ANO` à `1` dans la base documentaire (Oracle/Jurinet) : le statut de pseudonymisation redevient "en cours de traitement".

Sinon, il s'agit _a priori_ d'une mise à jour concernant uniquement des métadonnées qui ne nécessitent pas de validation (titres, sommaires...) et alors la décision sera directement mise à jour dans Judilibre via le traitement suivant :

- Nouvelle normalisation du document intégré dans la base SDER, avec le changement d'état déclenchant sa prise en compte par le processus de publication (quand la décision sera prête, car elle peut très bien être déjà en cours de traitement par Label) :
  - `publishStatus` = `toBePublished`.

## Cours d'appel

### Nouvelles décisions

On collecte chaque matin (entre 8h et 12h) toutes les décisions qui remplissent l'ensemble de ces critères depuis la base documentaire (Oracle/JuriCA) :

- Champ `JDEC_HTML_SOURCE` non vide : le document possède _a priori_ une décision au format texte brut au sein de ce champ complexe (il arrive cependant que ce texte finalement soit vide, ce qui constitue une anomalie entraînant le rejet de la décision) ;
- Champ `HTMLA` vide : pas de contenu pseudonymisé ;
- Champ `IND_ANO` égal à `0` : le statut de pseudonymisation est "non traité" ;
- Champ `JDEC_DATE_CREATION` supérieur ou égal à `jour J - 1 mois` : la décision a été intégrée dans la base documentaire il y a _au plus_ un mois ;
- Champ `JDEC_DATE` supérieur ou égal à `jour J - 6 mois` **ET** strictement inférieur à `jour J + 1` : la date de rendu de la décision n'est pas antérieure de 6 mois, ni postérieure, à la date du jour.

Chaque décision qui remplit ces critères est ensuite soumise à un filtre en entrée basé sur trois informations :

- `JDEC_CODNAC` : le code NAC ;
- `JDEC_CODNACPART` : le code de nature particulière ;
- `JDEC_IND_DEC_PUB` : l'indicateur de caractère public de la décision (valant `0`, `1` ou `null` pour les décisions anciennes ou mal saisies).

Les règles du filtre en entrée sont détaillées dans le document [Judifiltre](./judifiltre.md).

Chaque décision qui passe le filtre en entrée subit alors les traitements suivants :

- Normalisation et intégration dans la base SDER, avec les états déclenchant sa prise en compte par Label :
  - `labelStatus` = `toBeTreated` ;
  - `publishStatus` = `toBePublished`.
- Passage du champ `IND_ANO` à `1` dans la base documentaire (Oracle/JuriCA) : le statut de pseudonymisation devient "en cours de traitement".

En cas d'erreur ou d'anomalie lors de la collecte d'une décision, on passe son champ `IND_ANO` à `4` dans la base documentaire (Oracle/JuriCA) : le statut de pseudonymisation devient "en erreur".

### Décisions mises à jour

En complément, durant le même créneau (chaque matin entre 8h et 12h), on collecte toutes les décisions qui remplissent l'ensemble de ces critères :

- Champ `JDEC_HTML_SOURCE` non vide : le document possède _a priori_ une décision au format texte brut au sein de ce champ complexe (il arrive cependant que ce texte finalement soit vide, ce qui constitue une anomalie entraînant le rejet de la décision) ;
- Champ `JDEC_DATE_MAJ` supérieur à `date de dernière collecte` : la décision a été modifiée (en amont) postérieurement à la dernière collecte ;
- Champ `JDEC_DATE` supérieur ou égal à `jour J - 6 mois` **ET** strictement inférieur à `jour J + 1` : la date de rendu de la décision n'est pas antérieure de 6 mois, ni postérieure, à la date du jour.

Ces décisions, déjà collectées (parfois le jour même), ont potentiellement été mises à jour en amont (via WinciCA). Elles sont soumises au même filtre en entrée que pour la collecte (ces règles sont détaillées dans le document [Judifiltre](./judifiltre.md)).

La suite du (re)traitement que ces décisions doivent subir dépend des champs effectivement modifiés.

Ainsi, chacune de ces décisions doit repasser par Label (_son contenu pseudonymisé étant alors réinitialisé !_), si au moins l'un des champs suivants est modifié :

- `JDEC_HTML_SOURCE` : contenu de la décision (_a priori_) ;
- `JDEC_IND_DEC_PUB`: indicateur de caractère public de la décision ;
- `JDEC_CODE`: code de fin d'affaire ;
- `JDEC_CODNAC` : code NAC ;
- `JDEC_CODNACPART` : code de nature particulière ;
- `IND_PM` : indicateur d'occultation des catégories `personneMorale` et `numeroSiretSiren` ;
- `IND_ADRESSE` : indicateur d'occultation des catégories `adresse`, `localite` et `etablissement` ;
- `IND_DT_NAISSANCE` : indicateur d'occultation de la catégorie `dateNaissance` ;
- `IND_DT_DECE` : indicateur d'occultation de la catégorie `dateDeces` ;
- `IND_DT_MARIAGE` : indicateur d'occultation de la catégorie `dateMariage` ;
- `IND_IMMATRICULATION` : indicateur d'occultation de la catégorie `plaqueImmatriculation` ;
- `IND_CADASTRE` : indicateur d'occultation de la catégorie `cadastre` ;
- `IND_CHAINE` : indicateur d'occultation des catégories `compteBancaire`, `telephoneFax` et `numeroIdentifiant` ;
- `IND_COORDONNEE_ELECTRONIQUE` : indicateur d'occultation de la catégorie `email` ;
- `IND_PRENOM_PROFESSIONEL` : indicateur d'occultation de la catégorie `professionnelMagistratGreffier` ;
- `IND_NOM_PROFESSIONEL` : indicateur d'occultation de la catégorie `professionnelMagistratGreffier` ;
- `JDEC_OCC_COMP` : indicateur de demande d'occultation complémentaire ;
- `JDEC_OCC_COMP_LIBRE` : occultation complémentaire (saisie libre) ;
- `_bloc_occultation`.

Dans ce cas (décision devant repasser par Label), la décision subit les traitements suivants :

- Modification du document intégré dans la base SDER, avec les états déclenchant sa nouvelle prise en compte par Label :
  - Suppression du texte pseudonymisé ;
  - Suppression du zonage ;
  - Suppression des `labelTreatments` ;
  - `labelStatus` = `toBeTreated` ;
  - `publishStatus` = `toBePublished`.
- Passage du champ `IND_ANO` à `1` dans la base documentaire (Oracle/JuriCA) : le statut de pseudonymisation redevient "en cours de traitement".

Sinon, il s'agit _a priori_ d'une mise à jour concernant uniquement des métadonnées qui ne nécessitent pas de validation (titres, sommaires...) et alors la décision sera directement mise à jour dans Judilibre via le traitement suivant :

- Nouvelle normalisation du document intégré dans la base SDER, avec le changement d'état déclenchant sa prise en compte par le processus de publication (quand la décision sera prête, car elle peut très bien être déjà en cours de traitement par Label) :
  - `publishStatus` = `toBePublished`.
