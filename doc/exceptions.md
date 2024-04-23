# Déclaration d'exceptions aux règles de filtrage par date

Collection `judilibre-index.exceptions`.

Exemple d'exception :

```
{
    "decisionId" : "jurica:1447789",
    "reason" : "Mauvais code NAC",
    "author" : "sebastien.courvoisier@justice.fr",
    "date" : "2024-04-23",
    "collected" : false,
    "published" : false,
    "resetPseudo" : true
}
```

La décision référencée sera (re)collectée, transmise à Label (après réinitialisation du contenu pseudonymisé si `resetPseudo` vaut `true`) puis (re)publiée (si son `publishStatus` le permet).

Seules les règles de filtrage liées à la date de la décision (trop ancienne, trop récente...) seront ignorées. Il n'est pas prévu de contournement aux règles liées au code NAC et aux indicateurs de caractère public.

La décision ne sera (re)collectée et (re)publiée qu'une seule fois par execption (passage à `true` des propriétés `collected` et `published` à l'issue de chaque étape).

Les propriétés `date` et `reason` sont susceptibles d'être remontées dans Judilibre avec l'évolution des mécanismes de mise à jour et de notification des réutilisateurs.

Les exceptions sont conservées en base de données après traitement pour leur traçabilité (d'où aussi la présence de la propriété `author`).
