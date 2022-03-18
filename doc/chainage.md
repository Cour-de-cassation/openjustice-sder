# Chaînage des décisions

## Chaînage arrière CC -> CA

**Objectif** : en partant d'une décision de la Cour de cassation, récupérer la décisions de la Cour d'appel qu'elle attaque (nécessairement antérieure).

**Algorithme**, d'après un mail de Richard ANGER daté du 03/03/2021 :

1. Point de départ : identifiant de la décision CC dans Jurinet (`DOCUMENT.ID_DOCUMENT`, par exemple : `1727146`)

2. On récupère le n° de pourvoi de la décision Jurinet : `SELECT NUMPOURVOICODE FROM NUMPOURVOI WHERE NUMPOURVOI.ID_DOCUMENT = {ID_DOCUMENT}`

   → `NUMPOURVOICODE` = n° de pourvoi sans clé (par exemple : `1826378`)

3. On récupère les informations correspondant à l'affaire : `SELECT ID_ELMSTR, ID_AFFAIRE FROM GPCIV.AFF WHERE GPCIV.AFF.CODE = {NUMPOURVOICODE}`

   → `ID_AFFAIRE` = identifiant du pourvoi
   (par exemple : `11110412`)

   → `ID_ELMSTR` = code permettant _a priori_ d'identifier la cour d'appel associée (par exemple : `100019`), une telle information étant paradoxalement absente de celles que l'on récupère ci-après depuis `GPCIV.DECATT`

4. On récupère les informations de la décisions attaquée, telles quelles ont été saisies dans NOMOS (_ne contient rien qui nous permette d'identifier la cour d'appel_) : `SELECT NUM_RG, DT_DECATT FROM GPCIV.DECATT WHERE GPCIV.DECATT.ID_AFFAIRE = {ID_AFFAIRE}`

   → `NUM_RG` = n° RG _supposé_ de la décision attaquée (par exemple : `16/02749`)

   → `DT_DECATT` = date _supposée_ la décision attaquée

5. Afin de renforcer si nécessaire la résolution du chaînage, on récupère aussi un pseudo-identifiant de la cour d'appel _sans garantie de pertinence_ : `SELECT COUR_APPEL_RAT FROM ELMSTR WHERE ID_ELMSTR = {ID_ELMSTR}`

   → `COUR_APPEL_RAT` = pseudo-identifiant de la cour d'appel (par exemple : `CA59178`)

   A ce stade, et à partir d'un identifiant Jurinet, on obtient donc les informations suivantes, **qui sont les seules sur lesquelles on peut s'appuyer pour remonter vers une décision de JuriCA** :

   - `NUM_RG` = n° RG _supposé_ de la décision
   - `DT_DECATT` = date _supposée_ de la décision, ramenée au format `aaaa-mm-jj`
   - `COUR_APPEL_RAT` = pseudo-identifiant _approximatif_ de la cour d'appel ayant rendu la décision

6. On tente de récupérer la décision JuriCA qui correspond, _en sachant que le n° RG n'est pas un identifiant unique et que la date peut être fausse (on limite son décalage à J+/-2)_ : `SELECT JDEC_ID, JDEC_DATE, JDEC_ID_JURIDICTION FROM JCA_DECISION WHERE TRIM(JCA_DECISION.JDEC_NUM_RG) = {NUM_RG} AND (JCA_DECISION.JDEC_DATE = {DT_DECATT} OR JCA_DECISION.JDEC_DATE = {DT_DECATT J - 1} OR JCA_DECISION.JDEC_DATE = {DT_DECATT J + 1} OR JCA_DECISION.JDEC_DATE = {DT_DECATT J - 2} OR JCA_DECISION.JDEC_DATE = {DT_DECATT J + 2})`

   Note : les opérateurs `<` et `>` semblent mal fonctionner sur les dates dans Oracle, en tout cas avec les données dont on dispose, d'où la requête "verbeuse"...

   Pour rappel : on ne dispose d'aucun moyen de pointer directement la cour d'appel dans la requête, donc on peut récupérer plusieurs décisions qui sont relatives à d'autres cours d'appel que celle qui nous concerne (en l'espace de quelques jours, plusieurs cours d'appel peuvent effectivement rendre des décisions différentes disposant du même n° RG !)

7. On range chacune des décisions de JuriCA récupérées via la requête précédente par ordre de pertinence :

   1. Les décisions dont la date correspond exactement
   2. Les décisions dont la date correspond à J+/-1 _et_ dont la propriété `JDEC_ID_JURIDICTION` peut être mise en correspondance avec la donnée `COUR_APPEL_RAT`
   3. Les décisions dont la date correspond à J+/-2 _et_ dont la propriété `JDEC_ID_JURIDICTION` peut être mise en correspondance avec la donnée `COUR_APPEL_RAT`

   Note : la mise en correspondance de la propriété `JDEC_ID_JURIDICTION` avec la donnée `COUR_APPEL_RAT` échouant souvent, ce critère n'est appliqué que pour restreindre fortement la prise en compte des décisions dont la date est en décalage avec celle saisie dans NOMOS. On part en effet du principe que cette date est correcte, et donc qu'une décision de JuriCA ayant à la fois la bonne date et le bon n° RG doit être forcément la bonne (même s'il n'y a pas de correspondance entre `JDEC_ID_JURIDICTION` et `COUR_APPEL_RAT`, comme ces données sont trop hétérogènes pour constituer une certitude). Ce "flou" est bien entendu causé par l'absence de référentiel univoque de la cour d'appel dans la table `GPCIV.DECATT`.

   Si on a des décisions d'ordre de pertinence 1, alors on retourne leur `JDEC_ID`. Sinon, si on a des décisions d'ordre de pertinence 2, alors on retourne leur `JDEC_ID`. Sinon, si on a des décisions d'ordre de pertinence 3, alors on retourne leur `JDEC_ID`. Sinon on retourne une liste vide.

8. La liste d'identifiants JuriCA retournée (ou vide), vient alimenter la propriété `decatt` des documents de la collection `decisions`.
