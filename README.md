# Protocole de sécurité – Chargement / Déchargement

**Chantier Demathieu Bard – GARE D'ISSY RER (Ligne 15 Sud)**

Le chauffeur scanne le QR code affiché à l'entrée du chantier. Il remplit le protocole sur son téléphone, en 6 étapes et en 6 langues, puis signe au doigt.
Le coordinateur logistique reçoit par e-mail **le protocole officiel DB-PRE-F-V2022-09, rempli et signé**, au format PDF.

```
Téléphone du chauffeur ──► GitHub Pages (formulaire)  ──►  Render (serveur Node)  ──►  Brevo (e-mail + PDF)
   (QR code statique)      bestafacilities.github.io       protocole-backend               bestafacilities@outlook.fr
                                                                   └──► Google Sheets + Drive (registre, facultatif)
```

Tout fonctionne avec des offres gratuites : GitHub Pages, Render Free, Brevo Free (300 e-mails par jour) et Google Apps Script.

## Ce que fait le système

| Étape | Contenu | Contrôles bloquants |
|---|---|---|
| 1. Protocole | Règles essentielles et document officiel (4 pages) | Case « J'ai lu et j'accepte » |
| 2. EPI | Casque, gants, chaussures, gilet ou veste HV, pantalon | Les 5 EPI doivent être confirmés |
| 3. Identification | Transporteur, fournisseur, entreprise livrée, chauffeur, téléphone, immatriculation | Formats du téléphone et de la plaque |
| 4. Véhicule | Tonnage, hauteur < 4,2 m, longueur < 8 m, type de véhicule, moyens de manutention | Réponse obligatoire |
| 5. Marchandise | Opération, qui manutentionne, **matières transportées**, produits dangereux (SGH), conditionnement, poids et dimensions | **Matières obligatoires** (« rien », « RAS », « - »… refusés) ; pictogramme obligatoire si produits dangereux |
| 6. Signature | Récapitulatif modifiable et signature au doigt | Signature réelle exigée |

Les contrôles sont faits **deux fois** : dans le téléphone et sur le serveur. Même un formulaire trafiqué ne peut pas passer sans matières transportées.

Autres fonctions :
- Brouillon enregistré automatiquement pendant 12 h (en cas d'appel ou de réseau coupé).
- Coordonnées du chauffeur mémorisées pour sa prochaine livraison.
- Réveil du serveur Render dès l'ouverture de la page.
- Anti-doublon en cas de double appui ou de nouvel essai.
- Position GPS et distance au chantier.
- Écran « PROTOCOLE VALIDÉ » à montrer au chef de chantier.

L'e-mail reçu contient :
- en objet : ✅, ou ⚠️ en cas de point de vigilance (produits dangereux, véhicule hors gabarit, GPS loin du chantier…), puis l'entreprise, le transporteur, le chauffeur et l'heure ;
- les points de vigilance détaillés en tête de l'e-mail ;
- un résumé lisible sur téléphone ;
- en pièce jointe, le **PDF officiel rempli** : cases cochées, textes, signature en page 2, et une page d'attestation horodatée ajoutée à la fin.

## Fichiers

| Chemin | Rôle |
|---|---|
| `index.html`, `assets/css`, `assets/js` | Formulaire servi par GitHub Pages (`assets/js/i18n.js` contient les traductions FR, EN, PT, ES, PL, RO) |
| `server.js` | Serveur Render : `GET /health` et `POST /send` |
| `lib/config.js` | **Paramètres du chantier** (nom, adresse, contact, GPS) et variables d'environnement |
| `lib/validate.js` | Règles de validation côté serveur |
| `lib/pdf.js` | Remplissage du PDF officiel `assets/protocole-securite.pdf` |
| `lib/email.js` | E-mail Brevo (mode test sans clé : écrit dans `outbox/`) |
| `lib/registre.js` + `integrations/google-apps-script.gs` | Registre Google Sheets et archivage Drive (facultatif) |
| `docs/qr-code-protocole.png` / `.svg` | **Nouveau QR code statique**, sans publicité et sans expiration |
| `docs/affiche-gare-issy-v2.png` | Affiche du chantier avec le nouveau QR code |
| `tools/prepare-assets.py` | Régénère les images du formulaire à partir du PDF officiel |

## Variables d'environnement (Render → Environment)

Seule `BREVO_API_KEY` est indispensable. Elle est déjà en place, et les autres valeurs par défaut reproduisent l'ancien fonctionnement.

| Variable | Défaut | Rôle |
|---|---|---|
| `BREVO_API_KEY` | – | Clé API Brevo (**obligatoire** ; sans elle, mode test) |
| `MAIL_TO` | `bestafacilities@outlook.fr` | Destinataire(s), séparés par des virgules |
| `MAIL_BCC` | – | Copie cachée (ex. chef de chantier) |
| `MAIL_SENDER_EMAIL` | `bestafacilities@outlook.fr` | Expéditeur (doit être validé dans Brevo) |
| `MAIL_SENDER_NAME` | `Gare Logistique` | Nom de l'expéditeur |
| `MAIL_REPLY_TO` | `bestafacilities@outlook.fr` | Adresse de réponse |
| `ALLOWED_ORIGINS` | `https://bestafacilities.github.io` | Sites autorisés à envoyer un protocole |
| `SHEETS_WEBHOOK_URL` / `SHEETS_WEBHOOK_SECRET` | – | Registre Google Sheets (voir `integrations/google-apps-script.gs`) |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MIN` | `12` / `15` | Anti-abus : nombre d'envois max par adresse IP et par fenêtre (en minutes) |

## Déploiement

- **Render** (service `protocole-backend`) :
  - Root Directory **vide** (racine du dépôt) ;
  - Build `npm install` ;
  - Start `npm start` (ou `node server.js`) ;
  - Node 18 ou plus récent.
- **GitHub Pages** : branche `main`, dossier `/`.
- Les deux se redéploient automatiquement à chaque fusion sur `main`. Fusionnez de préférence en dehors des heures de livraison.

## Tester en local

```bash
npm install
npm test        # remplit un protocole d'exemple → outbox/exemple-protocole-rempli.pdf
npm start       # http://localhost:3000 (sans BREVO_API_KEY : e-mails écrits dans outbox/)
```

## Adapter à un autre chantier

1. Modifier `CHANTIER` dans `lib/config.js` (nom, adresse, contact, coordonnées GPS).
2. Modifier les règles de l'étape 1 dans `assets/js/i18n.js` (`rules.1` à `rules.9`).
3. Générer un QR code vers l'adresse du formulaire (`docs/qr-code-protocole.png` sert de modèle).
