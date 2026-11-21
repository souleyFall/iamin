# Journal

## 2026-11-19

- Cadrage : problème (les admins Plato organisent les tournois à la main, avec des sites externes et des captures d'écran), périmètre de la v0.1.0, choix de pile, relais, absents et liste d'attente (voir [décisions](decisions.md) D1 à D12).
- Maquettes : direction visuelle « pendule », thèmes sombre et clair.
- PR n°1 (fusionnée) : fondations du dépôt, reprises d'airpost (qualité, CI, hook, documents). Le contrôle gitleaks a d'abord échoué faute de la permission `pull-requests: read` ; corrigé sur ce seul job.
- PR n°4 (en cours) : générateurs de texte pour le chat dans `@iamin/engine` (inscrits et liste d'attente, VS d'un tour ou d'une journée, résultats, classement). Texte brut, un fait par ligne. Les pseudos viennent d'inscriptions publiques : nettoyés (retours à la ligne et caractères de contrôle supprimés) pour qu'un pseudo ne puisse pas ajouter de fausses lignes au message copié (risque R10).
- PR n°3 (fusionnée) : ligue dans `@iamin/engine`. Calendrier par la méthode des cercles (repos tournant si le nombre de joueurs est impair, aller-retour en option). Classement : points, confrontation directe, différence de score, score marqué, puis ordre du tirage. Leçon : réécrire un fichier avec `Get-Content` puis `Set-Content` sous PowerShell 5.1 a corrompu les accents (lecture en ANSI) ; lecture et écriture en UTF-8 explicite désormais, et `git diff --stat` avant de continuer.
- PR n°2 (fusionnée) : paquet `@iamin/engine`, arbre d'élimination directe. Tirage vérifiable : identifiants triés puis mélange de Fisher-Yates avec une graine, donc le résultat ne dépend pas de l'ordre d'inscription. Les byes vont aux têtes de série 1 à N (des joueurs tirés au sort), jamais deux dans le même match.
