## Contexte

<!-- Pourquoi cette PR ? Quel besoin ou quel problème ? -->

## Changements

<!-- Ce qui change, en quelques points. -->

## Vérification

- [ ] `pnpm check` passe en local (lint, formatage, types, tests, build)
- [ ] Des tests couvrent le comportement ajouté ou corrigé
- [ ] Vérifié à la main : <!-- ce que tu as essayé -->

## Sécurité

- [ ] Aucune entrée utilisateur n'est utilisée sans validation
- [ ] Chaque route qui écrit vérifie le rôle, l'appartenance au groupe et le relais (test d'accès croisé : un admin du groupe A ne touche rien du groupe B)
- [ ] Aucun secret dans le code, les logs ou les messages d'erreur
- [ ] Les nouvelles dépendances ont été examinées (maintenance, licence, `pnpm audit`)
- [ ] Le registre des risques est à jour si un risque apparaît ou change

## RGPD

- [ ] Aucune donnée personnelle nouvelle, ou elle figure au registre des traitements (finalité, durée de conservation, minimisation)

## Design

- [ ] Sans objet, ou conforme à la maquette (écran concerné : )
- [ ] Contraste, zones tactiles de 44 px minimum et mouvement réduit respectés
