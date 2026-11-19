# Journal

## 2026-11-19

- Cadrage : problème (les admins Plato organisent les tournois à la main, avec des sites externes et des captures d'écran), périmètre de la v0.1.0, choix de pile, relais, absents et liste d'attente (voir [décisions](decisions.md) D1 à D12).
- Maquettes : direction visuelle « pendule », thèmes sombre et clair.
- PR n°1 (fusionnée) : fondations du dépôt, reprises d'airpost (qualité, CI, hook, documents). Le contrôle gitleaks a d'abord échoué faute de la permission `pull-requests: read` ; corrigé sur ce seul job.
- PR n°2 (en cours) : paquet `@iamin/engine`, arbre d'élimination directe. Tirage vérifiable : identifiants triés puis mélange de Fisher-Yates avec une graine, donc le résultat ne dépend pas de l'ordre d'inscription. Les byes vont aux têtes de série 1 à N (des joueurs tirés au sort), jamais deux dans le même match.
