# openjustice-sder

## Description 
Ensemble de jobs visant à alimenter le pipeline de données pour le projet OpenJustice :

* `src/jobs/import.js` : import des nouvelles décisions (non pseudonymisées) issues des bases Oracle Jurinet et JuriCA dans la base MongoDB SDER (collections rawJurinet, rawJurica et decisions) ;
* `src/jobs/reinject.js` : reversement des décisions pseudonymisées par Label dans la base Oracle Jurinet ;
* `src/jobs/export.js` _(à refaire)_ : export des décisions pseudonymisées vers la plateforme OpenJustice en vue de leur indexation dans la base Elasticsearch ;
* `src/jobs/import_dila.js` _(work in progress)_ : import "one shot" du stock d'anciennes décisions issues de la DILA.

Le scheduling de ces jobs est assuré par le script `src/index.js`, lequel est destiné à être exécuté via PM2.

## Installation et exécution

Le projet OpenJustice-sder dépend d'une (ou de plusieurs) base de données oracles pour la récupération des informations de cours d'appels et de cour de cassation. Il dépend également de la base de donnée mongo DB SDER. 

Le projet [juridependencies](https://github.com/Cour-de-cassation/juridependencies) dispose de scripts facilitant l'installation de bases de données et d'un set de donnée factice.

### Lancer l'application

`npm run start:docker`

## Fichiers notables

* `.env-sample` : exemple de fichier `.env` de configuration (lequel n'est pas déposé dans GitHub) ;
* `src/dila-utils.js`, `src/jurinet-utils.js` et `src/jurica-utils.js` : modules utilitaires principalement concernés par la normalisation du contenu des décisions (nettoyage du texte, réencodage, etc.), les modalités de celle-ci dépendant de la source considérée (DILA, Jurinet, JuriCA) ;
* `src/index.js` : script de scheduling des tâches spécifiques au pipeline de données OpenJustice. Le scheduling repose sur le module [Bree](https://github.com/breejs/bree) plutôt que sur `crontab` afin de bénéficier globalement de la gestion d'événements en JavaScript (pour lancer des tâches complémentaires, envoyer des notifications, etc.) ;
* `src/jurinet-oracle.js` et `src/jurica-oracle.js` : modules implémentant les méthodes d'accès aux bases Oracle _(refactoring à faire)_ ;
* `src/jobs` : dossier destiné à recevoir les scripts implémentant les jobs individuels (import, export, réinjection, etc.) ;
* `src/jobs/data` : dossier destiné à contenir les données persistentes requises par les jobs individuels.
