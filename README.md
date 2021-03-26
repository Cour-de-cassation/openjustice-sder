# openjustice-sder

## Description 
Ensemble de jobs visant à alimenter le pipeline de données pour le projet OpenJustice :

* `src/jobs/import.js` : import des nouvelles décisions (non pseudonymisées) issues des bases Oracle Jurinet et JuriCA dans la base MongoDB SDER (collections rawJurinet, rawJurica et decisions) ;
* `src/jobs/reinject.js` : reversement des décisions pseudonymisées par Label dans la base Oracle Jurinet ;
* `src/jobs/export.js` _(à refaire)_ : export des décisions pseudonymisées vers la plateforme OpenJustice en vue de leur indexation dans la base Elasticsearch ;
* `src/jobs/import_dila.js` _(work in progress)_ : import "one shot" du stock d'anciennes décisions issues de la DILA.

Le scheduling de ces jobs est assuré par le script `src/index.js`, lequel est destiné à être exécuté via PM2.

## Installation et exécution

**Les opérations d'installation sont déjà faites dans le serveur de dévelopement `BPKANONYM` (dans `/home/sebc/openjustice-sder`, sans lancement automatique) et dans le serveur de production `SRVANONYM` (dans `/home/openjustice/openjustice-sder`, lancement automatique en place). Dans le serveur de production, la tâche "pipeline" est en pause en attendant la mise en production de Label. Il suffira alors d'exécuter la commande `pm2 start pipeline` en tant que `root` pour activer les jobs d'import et de reversement une fois que l'application Sword sera arrêtée.**

Procédure d'installation et d'exécution dans un système vierge :

* Installer Node.js (10+) et [PM2](https://pm2.keymetrics.io/) ;
* Clôner le présent dépôt ;
* Exécuter `npm install` dans le dossier `openjustice-sder` ;
* Créer un ficher `.env` à la racine du dossier `openjustice-sder` en copiant le fichier `.env-sample`, puis y renseigner les valeurs manquantes (`<...>`) ;
* En tant que `root`, lancer le script principal via PM2 : `pm2 start /path/to/openjustice-sder/src/index.js --name "pipeline"` ;
* (Facultatif) Sauvegarder la tâche PM2 en vue de son lancement automatique au prochain reboot : `pm2 save`

Une fois le script lancé suivant les indications précédentes, les opérations suivantes sont possibles (en tant que `root`) :

* `pm2 logs pipeline` : affiche le flux des logs du scripts pour le suivi des opérations en cours ;
* `pm2 flush pipeline` : nettoyage des logs ;
* `pm2 stop pipeline` : arrêt du script ;
* `pm2 start pipeline` : lancement du script ;
* `pm2 restart pipeline` : redémarrage du script ;
* `pm2 delete pipeline` : arrêt du script et retrait de la liste des tâche PM2 (par précaution, exécuter `pm2 save --force` pour s'assurer que le script ne sera pas relancé au reboot du serveur).

## Fichiers notables

* `.env-sample` : exemple de fichier `.env` de configuration (lequel n'est pas déposé dans GitHub) ;
* `src/dila-utils.js`, `src/jurinet-utils.js` et `src/jurica-utils.js` : modules utilitaires principalement concernés par la normalisation du contenu des décisions (nettoyage du texte, réencodage, etc.), les modalités de celle-ci dépendant de la source considérée (DILA, Jurinet, JuriCA) ;
* `src/index.js` : script de scheduling des tâches spécifiques au pipeline de données OpenJustice. Le scheduling repose sur le module [Bree](https://github.com/breejs/bree) plutôt que sur `crontab` afin de bénéficier globalement de la gestion d'événements en JavaScript (pour lancer des tâches complémentaires, envoyer des notifications, etc.) ;
* `src/jurinet-oracle.js` et `src/jurica-oracle.js` : modules implémentant les méthodes d'accès aux bases Oracle _(refactoring à faire)_ ;
* `src/jobs` : dossier destiné à recevoir les scripts implémentant les jobs individuels (import, export, réinjection, etc.) ;
* `src/jobs/data` : dossier destiné à contenir les données persistentes requises par les jobs individuels.
