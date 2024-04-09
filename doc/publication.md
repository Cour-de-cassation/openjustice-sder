# Règles de publication dans Judilibre

## Cour de Cassation

### Pré-publication

Les décisions présentes dans la base SDER et prêtes à être pré-publiées satisfont les critères suivants :

- `sourceName`= `jurinet` : décision émise par la Cour de Cassation ;
- `labelStatus`= `done` : état positionné par Label une fois la décision validée et prête à être publiée ;
- `publishStatus`= `toBePublished` : état positionné lors de la collecte pour les décisions publiques.

Ces décisions doivent d'abord être réinjectées dans la base documentaire (Oracle/Jurinet) en modifiant les champs suivants _à la source_ :

- `XMLA` : construction du contenu XML pseudonymisé (transcodé de `UTF-8` vers `CP1252`) à destination de Jurinet et de l'exporation pour la DILA ;
- `IND_ANO` = `2` : le statut de pseudonymisation est "traité" ;
- `AUT_ANO` = `LABEL` : la pseudonymisation a été effectuée par Label ;
- `DT_ANO` = `date du jour` : date de la pseudonymisation ;
- `DT_MODIF` = `date du jour` : date de modification ;
- `DT_MODIF_ANO` = `date du jour` : date de la dernière modification de la pseudonymisation ;
- `DT_ENVOI_DILA` = `null` : mise à zéro de la date d'exportation pour la DILA (requis pour le lancement manuel de l'exportation côté SI).

Ensuite, certaines propriétés sont mises à jour dans la base SDER afin de déclencher la publication dans Judilibre :

- `labelStatus`= `exported` ;
- `publishStatus`= `toBePublished` ;
- `dateCreation` = `date du jour` (cette propriété sert à renseigner la date de mise à jour dans Judilibre).

### Publication

Les décisions présentes dans la base SDER et prêtes à être publiées satisfont les critères suivants :

- `sourceName`= `jurinet` : décision émise par la Cour de Cassation ;
- `labelStatus`= `exported` : état positionné lors de la pré-publication ;
- `publishStatus`= `toBePublished` : état positionné lors de la collecte pour les décisions publiques.

Pour chaque décision, par sécurité, on vérifie une nouvelle fois les principaux critères de [collecte](./collecte.md) (`TYPE_ARRET`, `ID_CHAMBRE`, `JURIDICTION`, etc.). Si la décision remplit les critères, alors elle subit cette suite de traitements :

1. `publishStatus` = `pending` : le statut de publication devient "en attente" ;
1. Préparation du document à indexer dans la base Judilibre (normalisation finale, incluant la création du contenu dans lequel les catégories `professionnelMagistratGreffier` et `professionnelAvocat` sont occultées) ;
1. Envoi du document au serveur public de Judilibre pour indexation ;
1. Si l'indexation échoue, on modifie le statut de publication en conséquence : `publishStatus` = `failure_indexing`. Sinon, le statut de publication passe à sa valeur finale : `publishStatus` = `success`.

En cas d'erreur lors de la préparation du document à indexer, on modifie le statut de publication en conséquence : `publishStatus` = `failure_preparing`.

## Cours d'appel

### Pré-publication

Les décisions présentes dans la base SDER et prêtes à être pré-publiées satisfont les critères suivants :

- `sourceName`= `jurica` : décision émise par une cour d'appel ;
- `labelStatus`= `done` : état positionné par Label une fois la décision validée et prête à être publiée ;
- `publishStatus`= `toBePublished` : état positionné lors de la collecte pour les décisions publiques.

Ces décisions doivent d'abord être réinjectées dans la base documentaire (Oracle/JuriCA) en modifiant les champs suivants _à la source_ :

- `IND_ANO` = `2` : le statut de pseudonymisation est "traité" ;
- `AUT_ANO` = `LABEL` : la pseudonymisation a été effectuée par Label ;
- `DT_ANO` = `date du jour` : date de la pseudonymisation ;
- `DT_MODIF` = `date du jour` : date de modification ;
- `DT_MODIF_ANO` = `date du jour` : date de la dernière modification de la pseudonymisation ;

_Note : on ne réinjecte pas le contenu pseudonymisé car la base Jurica ne fait l'objet d'aucun traitement lié à celui-ci._

Ensuite, certaines propriétés sont mises à jour dans la base SDER afin de déclencher la publication dans Judilibre :

- `labelStatus`= `exported` ;
- `publishStatus`= `toBePublished` ;
- `dateCreation` = `date du jour` (cette propriété sert à renseigner la date de mise à jour dans Judilibre).

### Publication

Les décisions présentes dans la base SDER et prêtes à être publiées satisfont les critères suivants :

- `sourceName`= `jurica` : décision émise par une cour d'appel ;
- `labelStatus`= `exported` : état positionné lors de la pré-publication ;
- `publishStatus`= `toBePublished` : état positionné lors de la collecte pour les décisions publiques.

Pour chaque décision, par sécurité, on vérifie une nouvelle fois les principaux critères de [collecte](./collecte.md) (`JDEC_CODNAC`, `JDEC_IND_DEC_PUB`, etc.). Si la décision remplit les critères, alors elle subit cette suite de traitements :

1. `publishStatus` = `pending` : le statut de publication devient "en attente" ;
1. Préparation du document à indexer dans la base Judilibre (normalisation finale, incluant la création du contenu dans lequel les catégories `professionnelMagistratGreffier` et `professionnelAvocat` sont occultées) ;
1. Envoi du document au serveur public de Judilibre pour indexation ;
1. Si l'indexation échoue, on modifie le statut de publication en conséquence : `publishStatus` = `failure_indexing`. Sinon, le statut de publication passe à sa valeur finale : `publishStatus` = `success`.

En cas d'erreur lors de la préparation du document à indexer, on modifie le statut de publication en conséquence : `publishStatus` = `failure_preparing`.

## Tribunaux judiciaires

### Pré-publication

Aucun traitement de pré-publication pour les tribunaux judiciaires.

### Publication

Les décisions présentes dans la base SDER et prêtes à être publiées satisfont les critères suivants :

- `sourceName`= `juritj` : décision émise par un tribunal judiciaire ;
- `labelStatus`= `done` : état positionné par Label une fois la décision validée et prête à être publiée ;
- `publishStatus`= `toBePublished` : état positionné lors de la collecte pour les décisions publiques.

Chaque décision satisfaisant ces critères subit alors cette suite de traitements (pas de vérification supplémentaire des critères d'entrée) :

1. `publishStatus` = `pending` : le statut de publication devient "en attente" ;
1. Préparation du document à indexer dans la base Judilibre (normalisation finale, incluant la création du contenu dans lequel les catégories `professionnelMagistratGreffier` et `professionnelAvocat` sont occultées) ;
1. Envoi du document au serveur public de Judilibre pour indexation ;
1. Si l'indexation échoue, on modifie le statut de publication en conséquence : `publishStatus` = `failure_indexing`. Sinon, le statut de publication passe à sa valeur finale : `publishStatus` = `success`.

En cas d'erreur lors de la préparation du document à indexer, on modifie le statut de publication en conséquence : `publishStatus` = `failure_preparing`.
