# Analyse du système « Protocole de Sécurité Chargement/Déchargement »

*Audit réalisé le 25/09/2026 sur la branche `main` (commit `fbafae1`)*

---

## 1. Rappel : vos outils (tous gratuits)

| Rôle | Outil | Où c'est dans le projet |
|---|---|---|
| Hébergement du code | **GitHub** (dépôt `BestaFacilities/protocole-securite`) | — |
| Hébergement du formulaire (la page ouverte par le QR code) | **GitHub Pages** → `https://bestafacilities.github.io/protocole-securite/` | `index.html` à la racine, branche `main` |
| Serveur qui envoie l'e-mail | **Render** (offre gratuite, Node.js/Express) → `https://protocole-backend.onrender.com/send` | `backend/server.js` |
| Envoi de l'e-mail | **Brevo** (API transactionnelle, 300 e-mails/jour gratuits) | clé `BREVO_API_KEY` stockée dans les variables d'environnement de Render |
| Aperçu du PDF dans la page | **Google Docs Viewer** (iframe) | `index.html` ligne 53 |
| Génération du PDF signé côté téléphone | **jsPDF** (chargé depuis le CDN **cdnjs / Cloudflare**) | `index.html` |
| Position GPS du chauffeur | **API de géolocalisation du navigateur** | `index.html` ligne 126 |
| Réception des e-mails | **Outlook** → `bestafacilities@outlook.fr` | — |
| (testé puis abandonné) | Un compte **Gmail** `nepasrepondre.bestafacilities@gmail.com` comme expéditeur | historique Git |
| Création du QR code | **Introuvable dans le dépôt** — voir la remarque ci-dessous | — |

> ⚠️ **À propos du QR code :** beaucoup de générateurs « gratuits » (QR Code Generator, QR Code Monkey Pro, etc.) créent des QR codes **dynamiques** qui passent par leur propre lien de redirection et **cessent de fonctionner à la fin de l'essai gratuit** (souvent 7 à 14 jours). Scannez votre QR code et vérifiez que l'adresse affichée est **directement** `https://bestafacilities.github.io/protocole-securite/`. Si ce n'est pas le cas, régénérez un QR code **statique** (par exemple avec `qrencode` ou n'importe quel générateur statique).

---

## 2. Comment le système fonctionne aujourd'hui

```
 Chauffeur scanne le QR code
          │
          ▼
 GitHub Pages : index.html  ──(aperçu PDF via Google Docs Viewer)
   - case EPI obligatoire
   - formulaire transport / véhicule / opération
   - signature au doigt (canvas)
   - GPS du navigateur
   - génère un PDF avec jsPDF
          │  POST JSON (données + PDF + signature en base64)
          ▼
 Render : backend Express /send   (se met en veille après 15 min sans activité)
          │  API Brevo
          ▼
 E-mail HTML + 2 pièces jointes (PDF + PNG signature) → bestafacilities@outlook.fr
```

Aucune donnée n'est **stockée** ailleurs que dans votre boîte mail.

---

## 3. Problèmes constatés (par ordre de gravité)

### 🔴 Critique : à corriger tout de suite

**C1. `backend/server.js` sur `main` est cassé.**
Depuis le commit `df69c70` (« Fix final sender »), le fichier ne fait plus que 34 lignes : il manque les `require`, la création de l'application Express, la route `/send` et `app.listen`. Node refuse de le lancer (`SyntaxError: await is only valid in async functions`).
- Si Render redéploie automatiquement depuis `main`, **ce déploiement a échoué** et Render continue de faire tourner une **ancienne version** (probablement celle du commit `647b5e1`). Ce qui tourne en production **ne correspond donc plus au code du dépôt**.
- Au prochain redémarrage ou redéploiement « propre », le service pourrait tomber complètement.
- 👉 Allez vérifier dans **Render → votre service → Events / Deploys** si le dernier déploiement est en échec.

**C2. L'adresse d'expéditeur ne peut pas fonctionner correctement.**
Les expéditeurs successifs `notifications@brevo.com` et `nepasrepondre@brevo.com` sont des adresses du domaine **brevo.com, que vous ne possédez pas**. Brevo n'accepte que des expéditeurs **vérifiés dans votre compte**. Quant aux adresses Gmail et Outlook, ce sont des domaines gratuits qui **ne peuvent pas être authentifiés** : Brevo remplace alors automatiquement l'adresse par une adresse en `@xxxx.brevosend.com`. C'est la vraie cause des e-mails qui arrivent en spam.
- **Solution fiable :** acheter un nom de domaine (environ 8 à 12 €/an chez OVH, Gandi ou Namecheap), l'authentifier dans Brevo (Brevo code, DKIM, DMARC), puis envoyer depuis `protocole@votre-domaine.fr`.
- **Solution gratuite immédiate :** garder `bestafacilities@outlook.fr` comme expéditeur **vérifié** dans Brevo (Brevo le réécrira en brevosend.com), puis ajouter une **règle Outlook « Ne jamais mettre en indésirable »** pour cet expéditeur. Comme vous êtes le seul destinataire, cela suffit en pratique.
- **Alternative :** voir l'architecture B (section 5), qui supprime complètement le problème.

**C3. Deux serveurs en double et des dépendances incohérentes.**
- `server.js` + `package.json` à la racine : ancienne version, port 3000 codé en dur, Express 4.
- `backend/server.js` + `backend/package.json` : Express 5, avec `@getbrevo/brevo`, `nodemailer` **et** `sib-api-v3-sdk` (trois bibliothèques d'e-mail, dont une seule utilisée, et `sib-api-v3-sdk` est l'ancien SDK Sendinblue, déprécié).
- Il est impossible de savoir, en lisant le dépôt, lequel Render exécute. Il faut n'en garder qu'**un seul**.

### 🟠 Sécurité

**S1. Le point d'accès `/send` est ouvert à tout Internet.**
`cors({ origin: '*' })`, aucune limitation de débit, aucune vérification. L'URL est visible dans le code source public de la page. N'importe qui peut :
- épuiser votre quota Brevo de 300 e-mails/jour avec un simple script, ce qui bloquerait les vrais chauffeurs ;
- vous envoyer de faux protocoles avec des pièces jointes arbitraires (jusqu'à **50 Mo** acceptés !).

👉 Restreindre le CORS à `https://bestafacilities.github.io`, limiter le corps de la requête à environ 2 Mo, ajouter une limite de débit (par exemple 10 envois par IP et par heure avec `express-rate-limit`) et un champ piège anti-robot (« honeypot »).

**S2. Injection HTML dans l'e-mail.**
Les champs saisis (nom, entreprise, matières…) sont insérés tels quels dans le HTML de l'e-mail. Un petit malin peut y glisser des liens ou du contenu trompeur qui apparaîtra dans un e-mail « officiel » de votre système (risque d'hameçonnage). 👉 Échapper systématiquement `< > & " '`.

**S3. Aucune validation côté serveur.** Si `nom`, `entreprise` ou `pdfBase64` sont absents, le serveur plante (`.toUpperCase()` ou `.replace()` sur `undefined`) et renvoie une erreur 500.

**S4. Détails techniques renvoyés au navigateur** (`details: error.message`). C'est mineur, mais à éviter.

### 🟡 Fiabilité et expérience du chauffeur

**F1. Mise en veille de Render (offre gratuite).** Après 15 minutes sans requête, le serveur s'endort ; le réveil prend **environ 50 secondes à 1 minute**. Le chauffeur voit « ENVOI EN COURS… » très longtemps, pense que ça a planté, rappuie (ce qui crée des doublons) ou abandonne.
👉 À court terme : « réveiller » le serveur dès l'ouverture de la page (requête vers une route `/health` au chargement), afficher un message « Connexion au serveur, patientez… ». À plus long terme : architecture B (pas de mise en veille).

**F2. Aucun registre.** Si un e-mail se perd, part en spam ou est supprimé, la preuve disparaît. Le protocole de sécurité (articles R.4515-1 et suivants du Code du travail) doit pouvoir être présenté en cas de contrôle ou d'accident. 👉 Enregistrer chaque validation dans un tableau (Google Sheets, Supabase, Airtable…) avec le PDF archivé.

**F3. Le PDF généré est très pauvre.** Il ne contient que le nom, l'entreprise, le GPS, la date et la signature. Il manque le transporteur, le type de véhicule, les caractéristiques, l'opération, les matières, le mode de livraison, la confirmation EPI, la **référence du protocole (DB-PRE-F-V2022-09)** et surtout une phrase d'engagement du type *« Je reconnais avoir pris connaissance du protocole de sécurité et m'engage à le respecter »*. Juridiquement, c'est cette phrase qui donne sa valeur à la signature.

**F4. Validations manquantes dans le formulaire.**
- Une **signature vide** est acceptée.
- Le type de véhicule n'est pas obligatoire (le PDF affiche « Non spécifié »).
- Il n'existe pas de case « J'ai lu le protocole » : seule la case EPI est présente.
- L'e-mail affiche « EPI **Vérifiés** : OUI » alors qu'il s'agit d'une **déclaration** du chauffeur. Mieux vaut écrire « EPI déclarés portés ».

**F5. Champs du protocole PDF absents du formulaire :** hauteur < 4,2 m, longueur < 8 m, porte-engin, équipements de manutention (grue auxiliaire, hayon…). Il manque aussi des champs très utiles en pratique : **immatriculation**, **téléphone du chauffeur**, n° de bon de livraison.

**F6. GPS peu fiable.** La position est demandée au chargement ; si le chauffeur refuse ou valide trop vite, le champ reste vide. Personne ne vérifie non plus que le chauffeur est bien **sur le chantier**. 👉 Calculer la distance au chantier et l'indiquer dans l'e-mail (« ✅ sur site » ou « ⚠️ à 12 km du chantier »).

**F7. L'heure vient du téléphone du chauffeur**, qui peut être faux ou manipulé. 👉 Horodater côté serveur.

**F8. Aperçu PDF via Google Docs Viewer :** il affiche souvent une zone blanche ou « Aucun aperçu disponible » sur mobile et fait passer le document par Google. Le PDF pèse aussi **875 Ko**, ce qui est lourd en 4G sur chantier. 👉 Afficher les 4 pages en images compressées (ou utiliser PDF.js), et compresser le PDF.

**F9. Après l'envoi, le formulaire n'est pas réinitialisé** et il n'y a pas d'écran de confirmation. 👉 Afficher un **grand écran vert** « ✅ Protocole validé – N° 2026-0925-014 – 14:32 » que le chauffeur peut montrer au chef de chantier ou au gardien.

**F10. Pas de mode hors-ligne.** Si la 4G est mauvaise à l'entrée du chantier, l'envoi échoue et tout est perdu. 👉 Sauvegarder la saisie dans le téléphone et renvoyer automatiquement dès que le réseau revient.

### 🔵 Conformité, organisation, maintenance

**R1. RGPD.** Vous collectez nom, signature et position GPS : il faut une courte **mention d'information** en bas du formulaire (finalité, destinataire, durée de conservation, contact) et définir une durée de conservation (par exemple 5 ans ou la durée du chantier + X).

**R2. Données personnelles publiques.** Le PDF public contient le nom et le numéro de portable de Paul-Henri Tiberghien. C'est sans doute voulu pour les chauffeurs, mais assurez-vous qu'il est d'accord.

**R3. Un seul chantier codé en dur.** L'adresse de réception, le PDF et le logo sont fixes. 👉 Utiliser un paramètre dans le QR code (`…/?chantier=issy-rer`) pour réutiliser le même système sur plusieurs chantiers, avec des destinataires différents (conducteur de travaux, chef de chantier…).

**R4. Langues.** Une grande partie des chauffeurs PL ne sont pas francophones. Un sélecteur **FR / EN / PT / ES / PL / RO** améliore réellement la sécurité, car une règle comprise est une règle respectée.

**R5. Hygiène du dépôt.** README vide, pas de `.env.example`, fins de ligne mélangées (Windows et Linux), 24 commits d'essais-erreurs directement sur `main` (chaque essai redéploie la production). 👉 Travailler sur une branche, tester en local, puis fusionner.

---

## 4. Les meilleures améliorations, classées par rapport effort / gain

| # | Amélioration | Effort | Gain |
|---|---|---|---|
| 1 | **Réparer `backend/server.js`**, supprimer le doublon racine, nettoyer les dépendances | 15 min | 🔴 le système refonctionne de façon prévisible |
| 2 | **Expéditeur vérifié + règle Outlook** (ou nom de domaine authentifié) | 15 min à 1 h | 🔴 fin des e-mails en spam |
| 3 | Sécuriser `/send` : CORS restreint, limite de taille, limite de débit, échappement HTML, validation | 30 min | 🟠 protection du quota et anti-hameçonnage |
| 4 | Case « J'ai lu le protocole », signature obligatoire, PDF complet avec phrase d'engagement et référence | 1 h | 🟠 valeur juridique réelle |
| 5 | Réveil du serveur à l'ouverture de la page + écran de confirmation vert + anti double-clic | 30 min | 🟡 bien meilleure expérience pour le chauffeur |
| 6 | **Registre** (Google Sheets) + archivage des PDF (Google Drive) | 1 à 2 h | 🟡 traçabilité, recherche, statistiques |
| 7 | Immatriculation, téléphone, champs véhicule manquants, contrôle GPS « sur site » | 1 h | 🟡 information exploitable |
| 8 | Multilingue + pictogrammes | 2 à 3 h | 🔵 sécurité réelle sur le terrain |
| 9 | Multi-chantiers via paramètre du QR code | 2 h | 🔵 réutilisable pour Demathieu Bard ou d'autres clients |
| 10 | Mode hors-ligne (PWA) | 2 à 3 h | 🔵 robustesse en zone mal couverte |

---

## 5. Deux architectures cibles possibles (toujours 100 % gratuites)

### Architecture A : garder l'existant, mais le fiabiliser
GitHub Pages + Render + Brevo, avec les corrections 1 à 5 ci-dessus.
- ✅ Peu de changements.
- ❌ La mise en veille de Render et la contrainte d'expéditeur Brevo restent.

### Architecture B (recommandée) : GitHub Pages + Google Apps Script
Le formulaire reste sur GitHub Pages, mais il envoie ses données à un **script Google Apps Script** lié à un **Google Sheet** :
1. une ligne est ajoutée dans le registre (date serveur, chauffeur, transporteur, véhicule, GPS…) ;
2. le PDF signé est rangé dans un dossier **Google Drive** ;
3. l'e-mail est envoyé **depuis votre propre compte Gmail** (donc authentifié et bien délivré vers Outlook), avec le lien vers le PDF.

- ✅ **Plus de Render, plus de Brevo, plus de mise en veille, plus de problème d'expéditeur.**
- ✅ Registre consultable et filtrable, exportable en Excel, partageable avec le chef de chantier.
- ✅ Aucun serveur à maintenir, aucune clé API à protéger.
- ⚠️ Limite : environ 100 e-mails par jour avec un compte Gmail gratuit, ce qui est largement suffisant pour un chantier.

---

## 6. Prochaine étape proposée

1. Vérifier l'état du dernier déploiement sur Render et l'adresse réelle du QR code.
2. Appliquer les correctifs **1 à 5** (architecture A) : c'est rapide et ça sécurise l'existant.
3. Décider ensuite s'il faut migrer vers l'architecture B pour obtenir le registre et supprimer Render et Brevo.
