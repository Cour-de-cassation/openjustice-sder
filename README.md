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

Nous conseillons de monter le projet [dbsder-api](git@github.com:Cour-de-cassation/dbsder-api) avant le projet openjustice car l'exécution de son docker compose fournira déjà un network et la base de donnée mongo appropriée. Le docker compose actuel d'openjustice dépend actuellement de celui de dbsder-api.

Nous détaillerons ici comment lancer openjustice à partir de docker compose. A l'usage, si l'exécution en container de ce code de scripting s'avérait problématique, nous reviendrions sur la documentation d'installation.

### Installer le client oracle

La librairie npm pour le client Oracle est un bridge avec l'application cliente Oracle nécessaire pour construire les connexions avec la base de donnée. Il nous faut donc installer ce "driver":

```
sudo apt install unzip wget libaio1 && # Installation des dépendances
sudo mkdir /opt/oracle && # Création du répertoire qui contiendra le driver
wget https://download.oracle.com/otn_software/linux/instantclient/2340000/instantclient-basic-linux.x64-23.4.0.24.05.zip && # fetch du driver
sudo unzip -d /opt/oracle instantclient-basic-linux.x64-23.4.0.24.05.zip && # On le dézip dans le répertoire qu'on vient de créer
rm instantclient-basic-linux.x64-23.4.0.24.05.zip # On supprime le fichier zip
```

Quand l'installation a eu lieu, il nous faut prévenir le système de sa disponibilité et de l'endroit où il est disponible. Pour ça, à la fin de votre ficher .bashrc ou .zshrc, ajoutez la ligne:

`export LD_LIBRARY_PATH=/opt/oracle/instantclient_23_4:$LD_LIBRARY_PATH`

### Monter l'image oracle

Tout d'abord, il faut construire une image docker d'oracle. A la différence de nombreuses bases de données, oracle ne fournit pas d'images pré-montées, toutefois, elle fourni [les moyens de le faire](https://github.com/oracle/docker-images/blob/main/OracleDatabase/SingleInstance/README.md):

```
git clone git@github.com:oracle/docker-images.git && # On récupère les sources
cd docker-images/OracleDatabase/SingleInstance/dockerfiles && # On navigue jusqu'aux dockerfiles qui nous intéresse
./buildContainerImage.sh -v 18.4.0 -x && # On build l'image
docker image ls # Vous derviez voir l'image oracle/database 18.4.0-xe
```

### Préparer le container oracle

#### volume

Il faut créer le volume dont oracle va avoir besoin pour faire persister les données, le chemin doit partir du dossier projet pour rester cohérent au fichier docker-compose:
`mkdir data/oracle`

Le container va manipuler le module et a besoin des droits d'utilisation pour le faire.
`sudo chown 54321:54321 data/oracle`

#### setup de la DB

Il faut créer le fichier d'env dès maintenant car on va en avoir besoin pour setup la DB:
`cp .env-sample .env`

Les données d'exemples de .env-sample sont normalement fonctionnelles pour l'environnement local.

A ce stade, le container est prêt.

### Lancer l'application

`npm run docker:start`

Attention le premier setup peut s'avérer très long, notamment à cause d'oracle. On peut suivre la progression en lancant la commande:

`npm run docker:logs`

### Migrer les schémas de base de données

A ce stade, tout devrait être désormais prêt. Toutefois, la base de données est vide (outre la création des premiers users nécessaires à sa connexion), pour lancer la migration des schémas:

`npm run docker:oracle:up`

Ca y est, openjustice est lancé, il fonctionne dans son container docker, en communication avec le reste du network "judilibre-local" (défini par dbsder-api). Le container suit les évolutions du code openjustice, il est lié au repository du projet. Toutefois, parce qu'il fonctionne en container, on n'oubliera pas d'exécuter les scripts depuis le container et pas depuis la machine locale.

## Fichiers notables

* `.env-sample` : exemple de fichier `.env` de configuration (lequel n'est pas déposé dans GitHub) ;
* `src/dila-utils.js`, `src/jurinet-utils.js` et `src/jurica-utils.js` : modules utilitaires principalement concernés par la normalisation du contenu des décisions (nettoyage du texte, réencodage, etc.), les modalités de celle-ci dépendant de la source considérée (DILA, Jurinet, JuriCA) ;
* `src/index.js` : script de scheduling des tâches spécifiques au pipeline de données OpenJustice. Le scheduling repose sur le module [Bree](https://github.com/breejs/bree) plutôt que sur `crontab` afin de bénéficier globalement de la gestion d'événements en JavaScript (pour lancer des tâches complémentaires, envoyer des notifications, etc.) ;
* `src/jurinet-oracle.js` et `src/jurica-oracle.js` : modules implémentant les méthodes d'accès aux bases Oracle _(refactoring à faire)_ ;
* `src/jobs` : dossier destiné à recevoir les scripts implémentant les jobs individuels (import, export, réinjection, etc.) ;
* `src/jobs/data` : dossier destiné à contenir les données persistentes requises par les jobs individuels.
