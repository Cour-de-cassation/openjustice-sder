# Règles de filtrage des décisions des cours d'appel

Ces règles sont appliquées lors de la [collecte](./collecte.md), mais aussi par sécurité lors de la [publication](./publication.md) des décisions des cours d'appel (JuriCA).

## Critères de base

1. **Décision non-publique**, si :

   1. Son code NAC appartient à l'un des suivants : `11A, 11B, 11D, 11E, 11Z, 13A, 13B, 13C, 13D, 13E, 13Z, 14F, 15A, 15B, 15C, 15D, 15E, 15F, 15G, 15H, 15Z, 16A, 16B, 16C, 16D, 16E, 16F, 16G, 16H, 16I, 16J, 16K, 16M, 16N, 16O, 16P, 16Q, 16R, 16S, 16X, 17A, 17B, 17C, 17D, 17E, 17F, 17G, 17H, 17I, 17J, 17K, 17L, 17M, 17N, 17O, 17P, 17Q, 17R, 17S, 17T, 17X, 18A, 18B, 18C, 18D, 18E, 18F, 18G, 18H, 18X, 18Z, 20G, 21F, 22A, 22B, 22C, 22D, 22E, 22F, 23C, 23D, 23E, 23F, 23G, 23Z, 24A, 24B, 24C, 24D, 24E, 24F, 24I, 24J, 24K, 24L, 24M, 24N, 24Z, 26D, 27A, 27B, 27C, 27D, 27E, 27F, 27G, 27H, 27I, 27J, 27K, 27L, 27M, 27N, 27Z, 2A1, 2A2, 2A3, 2A4, 2A5, 2A6, 2A7, 2B1, 2B2, 2B3, 2B4, 2B5, 2C1, 2C2, 2C3, 2C4, 2C5, 2D1, 2D2, 2D3, 2D4, 2D5, 33Z, 3AG, 3AZ, 4AA, 4AB, 4EA, 4JF, 4JH, 4JI, 4JJ, 4JK, 4JL, 70G, 70J, 78S, 78T, 78U, 97A, 97B, 97E, 97G, 97P, 0, 000, 00A, 00X` **ET** (la case "publique" vaut `0` **OU** la case publique est non définie) ;
   1. **OU** son code NAC appartient à l'un des suivants : `4AC, 4AD, 4AE, 4AF, 4AL, 4AM, 4AN, 4AO, 4AP, 4EC` **ET** (la case "publique" vaut `0` **OU** la case publique est non définie) ;

   Anomalies remontées :

   - Absence de code NAC ;
   - Règle n°1, mais la case "publique" vaut `1` ;

1. **Décision partiellement publique**, si :

   1. Son code NAC appartient à l'un des suivants : `2AA, 2AB, 2AC, 2AD, 2AE, 2AF, 2AG, 2AH, 2AI, 2AJ, 2AK, 2AM, 2AN, 2AO, 2AP, 2AQ, 2AR, 2AS, 2AT, 2AU, 2AV, 2AZ, 20A, 20B, 20C, 20D, 20E, 20F, 20I, 20J, 20K, 20L, 20X, 21A, 21B, 21C, 21D, 21E, 21H, 21I, 21J, 21K, 21X, 26A, 26B, 26C, 26E, 26F, 26G, 26H, 26I, 26J, 26K, 26Y, 26Z, 20H, 21G, 23A, 23B, 23I, 23J, 23K, 24G, 24H, 25A, 25B, 25C, 25D, 25E, 25F, 25G, 25H, 25i, 64D`.

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
   1. Doit-elle être "soumise à Judifiltre" ?

      - **OUI** si une anomalie a été remontée lors de l'application des critères précédents **OU** si le statut de la décision est contradictoire même sans anomalie détectée (par exemple : décision à la fois publique et non-publique, dans le cas où les critères qu'on a formalisés seraient incomplets ou contiendraient des failles) **OU** si la décision est partiellement publique (pour validation manuelle des critères et du texte abrégé) ;
      - **NON** dans les autres cas (décision explicitement publique et sans anomalie).

   1. Si la décision doit être "soumise à Judifiltre" (décision non publique ou présentant une anomalie), alors elle est intégrée dans la base SDER mais bloquée par rapport aux traitements ultérieurs (Label et publication dans Judilibre) : `labelStatus` = `ignored_controleRequis` et `publishStatus` = `blocked` (_note : le labelStatus doit être affiné : `ignored_debatNonPublic`, `ignored_decisionNonPublique`, `ignored_codeNACdeDecisionNonPublique`, `ignored_codeNACdeDecisionPartiellementPublique`, `ignored_codeNACInconnu`, etc._).
   1. Sinon (décision explicitement publique et sans anomalie), alors la décision est intégrée dans la base SDER et rendue disponible pour un traitement par Label : `labelStatus` = `toBeTreated` et `publishStatus` = `toBePublished`.
