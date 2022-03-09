# Règles de filtrage du flux en provenance de JuriCA

## Critères de base

1. **Décision non-publique**, si :

   1. Son code NAC appartient à l'un des suivants : `11A, 11B, 11D, 11E, 11Z, 13A, 13B, 13C, 13D, 13E, 13Z, 14F, 15A, 15B, 15C, 15D, 15E, 15F, 15G, 15H, 15Z, 16A, 16B, 16C, 16D, 16E, 16F, 16G, 16H, 16I, 16J, 16K, 16M, 16N, 16O, 16P, 16Q, 16R, 16S, 16X, 17A, 17B, 17C, 17D, 17E, 17F, 17G, 17H, 17I, 17J, 17K, 17L, 17M, 17N, 17O, 17P, 17Q, 17R, 17S, 17T, 17X, 18A, 18B, 18C, 18D, 18E, 18F, 18G, 18H, 18X, 18Z, 20G, 21F, 22A, 22B, 22C, 22D, 22E, 22F, 23C, 23D, 23E, 23F, 23G, 23Z, 24A, 24B, 24C, 24D, 24E, 24F, 24I, 24J, 24K, 24L, 24M, 24Z, 26D, 27A, 27B, 27C, 27D, 27E, 27F, 27G, 27H, 27I, 27J, 27K, 27L, 27Z, 33Z, 3AG, 3AZ, 4JF, 4JH, 4JI, 4JJ, 4JK, 4JL, 70G, 97B, 97G, 97P` **ET** (la case "publique" n'est pas définie **OU** vaut `0`) ;
   1. **OU** son code NAC appartient à l'un des suivants : `4AA, 4AB, 4AC, 4AD, 4AE, 4AF, 4AL, 4AM, 4AN, 4AO, 4AP, 4EA, 4EC, 70J, 78S, 78T, 78U, 97A` **ET** la case "publique" vaut `0` ;
   1. **OU** son code NAC appartient à l'un des suivants : `0, 000, 00A, 00X`.

   Anomalies remontées :

   - Absence de code NAC ;
   - Règle n°1, mais la case "publique" vaut `1` ;
   - Règle n°2, mais la case "publique" n'est pas définie.

1. **Décision partiellement publique**, si :

   1. Son code NAC appartient à l'un des suivants : `20A, 20B, 20C, 20D, 20E, 20F, 20I, 20J, 20K, 20X, 21A, 21B, 21C, 21D, 21E, 21H, 21I, 21J, 21X, 64D`.

   Anomalie remontées :

   - Absence de code NAC.

1. **Décision publique**, si :

   1. Elle n'est **PAS non-publique** (critère n°1 ci-dessus) ;
   1. **ET** elle n'est **PAS partiellement publique** (critère n°2 ci-dessus) ;
   1. **ET** la case "publique" vaut `1`.

   Anomalies remontées :

   - Toutes celles remontées par l'application des critères précédents (dont l'absence de code NAC) ;
   - La case "publique" ne vaut pas `1`.

## Règles de filtrage et d'aiguillage du flux

Pour toute décision provenant de JuriCA :

1. Doit-elle être rejetée (non intégrée dans la base SDER) ?

   - **OUI** si elle est **non-publique** (critère n°1) **ET** elle n'est **PAS partiellement publique** (critère n°2) **ET** elle n'est **PAS publique** (critère n°3) ;
   - **NON** dans le cas contraire **OU** si l'application des critères précédents remonte une anomalie.

2. Si elle n'est pas rejetée :

   1. Est-elle partiellement publique (critère n°2) ? Si **OUI**, alors on génère la version abrégée du texte de la décision ;
   1. On l'intègre dans la base de travail "brute" (`rawJurica`) et on la référencie dans la base de l'Index Général (`judilibre-index`) ;
   1. Doit-elle être soumise à Judifiltre ?

      - **OUI** si une anomalie a été remontée lors de l'application des critères précédents **OU** si le statut de la décision est contradictoire même sans anomalie détectée (par exemple : décision à la fois publique et non-publique, dans le cas où les critères qu'on a formalisés seraient incomplets ou contiendraient des failles) **OU** si la décision est partiellement publique (pour validation manuelle des critères et du texte abrégé) ;
      - **NON** dans les autres cas (décision explicitement publique ou non-publique).

   1. Si la décision n'est pas soumise à Judifiltre (décision explicitement publique et sans anomalie), alors elle est directement intégrée dans la base SDER (`decisions`) et rendue disponible pour un traitement par Label.
   1. Ultérieurement, les décisions soumises à Judifiltre et ayant été validées comme étant publiques (ou partiellement publiques) sont intégrées dans la base SDER (`decisions`) et rendues disponibles pour un traitement par Label. Les décisions invalidées par Judifiltre (considérées donc comme étant non-publiques _a posteriori_) sont quant à elles supprimées de la base de travail "brute" (`rawJurica`).
