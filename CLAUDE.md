# Contexte du projet – Protocole de sécurité chantier GARE ISSY RER

Propriétaire : André Wonou (bestafacilities@outlook.fr), coordinateur logistique, chantier Demathieu Bard GARE D'ISSY RER (Ligne 15 Sud).
Toujours répondre en français, avec des explications simples (je ne suis pas développeur).

## Fonctionnement
Les chauffeurs scannent un QR code affiché sur le chantier, remplissent le protocole de sécurité
chargement/déchargement sur leur téléphone et signent. Je reçois un e-mail (Brevo) avec le PDF
officiel DB-PRE-F-V2022-09 rempli et signé.

## Deux systèmes coexistent – RÈGLE ABSOLUE
- ANCIEN système (racine du dépôt : index.html, server.js, package.json, backend/, ancienne affiche,
  ancien QR ME-QR, service Render "protocole-backend") : NE JAMAIS MODIFIER, DÉPLACER NI SUPPRIMER.
  Il doit rester disponible pour revenir en arrière.
- v2 (dossier v2/ uniquement) : formulaire 6 étapes / 6 langues, serveur Node/Express,
  remplissage du PDF officiel (pdf-lib). Tout nouveau travail se fait dans v2/.
  - Formulaire : https://bestafacilities.github.io/protocole-securite/v2/ (GitHub Pages, branche main)
  - Serveur : service Render "protocole-securite-v2" (offre Free, Root Directory = v2,
    adresse dans <meta name="api-base"> de v2/index.html). Mise en veille après 15 min.
  - Documentation : v2/README.md. Tests : `cd v2 && npm install && npm test`.

## Règles de travail
- Ne jamais pousser directement sur main : travailler sur une branche et ouvrir une pull request.
  GitHub Pages et Render se redéploient automatiquement à chaque fusion sur main.
- Le dépôt est PUBLIC : aucune clé, aucun mot de passe, aucune donnée personnelle de chauffeur dans le code.
  Les secrets (BREVO_API_KEY…) sont uniquement dans les variables d'environnement Render.
- Rester sur des outils gratuits sauf accord explicite.
- Champs obligatoires à préserver : matières transportées (refus de "rien", "RAS", "-"),
  5 EPI, signature. Validation côté client ET serveur (v2/lib/validate.js).
- Lancer `npm test` dans v2/ avant de proposer une modification.

## Problèmes connus / en cours
- Les e-mails arrivent en courrier indésirable dans Outlook (expéditeur @outlook.fr envoyé via Brevo,
  non vérifiable). Pistes : expéditeur dédié (MAIL_SENDER_EMAIL), envoi via Gmail par Apps Script
  (v2/integrations/google-apps-script.gs), ou nom de domaine authentifié dans Brevo.
- Le registre Google Sheets/Drive (facultatif) n'est pas encore activé.
