# Protocole de sécurité v2 – Chargement / Déchargement

> Cette version vit entièrement dans le dossier `v2/`. **L'ancien système** (fichiers à la racine du dépôt, service Render `protocole-backend`, ancien QR code ME-QR) **n'est pas modifié** et continue de fonctionner en parallèle.

**Chantier Demathieu Bard – GARE D'ISSY RER (Ligne 15 Sud)**

Le chauffeur scanne le QR code affiché à l'entrée du chantier. Il remplit le protocole sur son téléphone, en 6 étapes et en 6 langues, puis signe au doigt.
Le coordinateur logistique reçoit par e-mail **le protocole officiel DB-PRE-F-V2022-09, rempli et signé**, au format PDF.

```
Téléphone du chauffeur ──► GitHub Pages (formulaire)            ──►  Render (serveur Node)   ──►  Google Apps Script : registre Sheets + PDF dans Drive
   (QR code statique)      …github.io/protocole-securite/v2/       protocole-securite-v2         + e-mail envoyé par Gmail (si MAIL_VIA=gmail)
                                                                         │                         + résumé du soir
                                                                         └── secours : Brevo (e-mail + PDF) ──► bestafacilities@outlook.fr
```

Tout fonctionne avec des offres gratuites : GitHub Pages, Render Free, Google Apps Script (Gmail ≈ 100 e-mails/jour) et Brevo Free (300 e-mails/jour, en secours).

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
- **Renvoi automatique** : si le réseau ou le serveur ne répond pas, le protocole signé reste dans le téléphone et repart tout seul dès que possible (même après fermeture de la page, pendant 12 h).
- Distance au chantier mesurée par GPS (les coordonnées exactes ne sont ni envoyées par e-mail, ni archivées).
- **Empreinte numérique SHA-256** du PDF dans l'e-mail et le registre, plus l'appareil et l'adresse IP sur l'attestation : preuve que le document n'a pas été modifié.
- **Plafond journalier** (150 par défaut) avec e-mail d'alerte (à 60 par défaut, puis au plafond) : protège les quotas gratuits.
- Envoi par **Gmail** (Apps Script) avec **secours automatique par Brevo**.
- **Résumé du soir** des livraisons du jour (registre Google Sheets).
- Messages d'erreur renvoyant vers le **protocole papier au poste de garde** si la panne dure.
- Écran « PROTOCOLE VALIDÉ » à montrer au chef de chantier.

L'e-mail reçu contient :
- en objet : ✅, ou ⚠️ en cas de point de vigilance (produits dangereux, véhicule hors gabarit, GPS loin du chantier…), puis l'entreprise, le transporteur, le chauffeur et l'heure ;
- les points de vigilance détaillés en tête de l'e-mail (dont la distance au chantier) ;
- un résumé lisible sur téléphone ;
- en pièce jointe, le **PDF officiel rempli** : cases cochées, textes, signature en page 2, et une page d'attestation horodatée ajoutée à la fin ;
- en bas de l'e-mail, l'**empreinte SHA-256** du PDF joint.

## Fichiers (tous dans `v2/`)

| Chemin | Rôle |
|---|---|
| `index.html`, `assets/css`, `assets/js` | Formulaire servi par GitHub Pages ; l'adresse du serveur Render est dans la balise `<meta name="api-base">` de `index.html`, et `assets/js/i18n.js` contient les traductions FR, EN, PT, ES, PL, RO |
| `server.js` | Serveur Render (service distinct de l'ancien) : `GET /health` et `POST /send` |
| `lib/config.js` | **Paramètres du chantier** (nom, adresse, contact, GPS) et variables d'environnement |
| `lib/validate.js` | Règles de validation côté serveur |
| `lib/pdf.js` | Remplissage du PDF officiel `assets/protocole-securite.pdf` |
| `lib/envoi.js` | Choix du canal d'envoi : Gmail (Apps Script) puis secours Brevo |
| `lib/email.js` | Contenu de l'e-mail et envoi Brevo (mode test sans clé : écrit dans `outbox/`) |
| `lib/registre.js` + `integrations/google-apps-script.gs` | Registre Google Sheets, archivage Drive, envoi Gmail, alertes, résumé du soir |
| `lib/quota.js` | Plafond journalier et e-mails d'alerte |
| `lib/appareil.js` | Description lisible du téléphone (preuve sur l'attestation) |
| `docs/ANALYSE-ANCIEN-SYSTEME-2026-09.md` | Audit historique de l'**ancien** système |
| `docs/qr-code-protocole.png` / `.svg` | **Nouveau QR code statique**, sans publicité et sans expiration |
| `docs/affiche-gare-issy-v2.png` | Affiche du chantier avec le nouveau QR code |
| `tools/prepare-assets.py` | Régénère les images du formulaire à partir du PDF officiel |

## Variables d'environnement (service Render `protocole-securite-v2` → Environment)

`BREVO_API_KEY` reste indispensable (envoi principal, ou secours si `MAIL_VIA=gmail`) : c'est la même clé que l'ancien service.

| Variable | Défaut | Rôle |
|---|---|---|
| `BREVO_API_KEY` | – | Clé API Brevo (**obligatoire** ; sans elle, mode test) |
| `MAIL_VIA` | `brevo` | `gmail` = e-mail envoyé par Gmail via le script Apps Script (nécessite `SHEETS_WEBHOOK_URL`), Brevo en secours |
| `MAIL_TO` | `bestafacilities@outlook.fr` | Destinataire(s), séparés par des virgules |
| `MAIL_BCC` | – | Copie cachée (ex. chef de chantier) |
| `MAIL_SENDER_EMAIL` | `bestafacilities@outlook.fr` | Expéditeur (doit être validé dans Brevo) |
| `MAIL_SENDER_NAME` | `Gare Logistique` | Nom de l'expéditeur |
| `MAIL_REPLY_TO` | `bestafacilities@outlook.fr` | Adresse de réponse |
| `ALLOWED_ORIGINS` | `https://bestafacilities.github.io` | Sites autorisés à envoyer un protocole |
| `SHEETS_WEBHOOK_URL` / `SHEETS_WEBHOOK_SECRET` | – | Script Google : registre, Drive, Gmail (voir `integrations/google-apps-script.gs`) |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MIN` | `12` / `15` | Anti-abus : nombre d'envois max par adresse IP et par fenêtre (en minutes) |
| `DAILY_MAX` / `DAILY_ALERT` | `150` / `60` | Plafond de protocoles par jour (au-delà : refus + renvoi vers le papier) et seuil d'e-mail d'alerte. Compteur remis à zéro à minuit et à chaque mise en veille de Render |

## Déploiement

| | Ancien système (inchangé) | v2 |
|---|---|---|
| Formulaire | `https://bestafacilities.github.io/protocole-securite/` | `https://bestafacilities.github.io/protocole-securite/v2/` |
| Serveur Render | `protocole-backend`, Root Directory vide | `protocole-securite-v2`, Root Directory **`v2`** |
| QR code | ME-QR (ancienne affiche) | `docs/qr-code-protocole.png` (nouvelle affiche) |

Réglages du nouveau service Render :
- Build `npm install` ;
- Start `npm start` ;
- offre Free ;
- même région que l'ancien service.

Si Render attribue une autre adresse que `https://protocole-securite-v2.onrender.com`, modifiez la balise `<meta name="api-base">` dans `v2/index.html`.

**Revenir à l'ancien système** : il suffit de réafficher l'ancienne affiche. Rien d'autre à faire, car l'ancien formulaire et l'ancien serveur n'ont jamais été modifiés.

## Mise en service et surveillance (à faire une fois)

1. **Outlook – expéditeurs approuvés** : Paramètres → Courrier → Courrier indésirable → Expéditeurs et domaines approuvés → ajouter l'adresse Gmail qui envoie les protocoles **et** l'adresse expéditrice Brevo telle qu'elle apparaît dans un e-mail reçu.
2. **Registre + Gmail** : suivre les étapes en tête de `integrations/google-apps-script.gs`, puis sur Render : `SHEETS_WEBHOOK_URL`, `SHEETS_WEBHOOK_SECRET`, `MAIL_VIA=gmail`.
3. **Surveillance gratuite** (cron-job.org) : tâche qui appelle `https://protocole-securite-v2.onrender.com/health` toutes les 10 minutes, **du lundi au vendredi de 6 h à 18 h** (fuseau Europe/Paris), avec notification par e-mail en cas d'échec. Le serveur est ainsi déjà réveillé quand les chauffeurs arrivent (≈ 260 h/mois, sous la limite gratuite de 750 h de Render).
4. **Secours papier** : quelques protocoles papier au poste de garde, et une mention sur l'affiche : « En cas de problème : protocole papier au poste de garde ».

### Vérifier qu'un PDF n'a pas été modifié

L'e-mail et le registre indiquent l'empreinte SHA-256 du PDF. Pour la recalculer sous Windows :
ouvrir « Invite de commandes » dans le dossier du fichier, puis taper `certutil -hashfile "nom-du-fichier.pdf" SHA256`.
Si les deux suites de caractères sont identiques, le fichier est exactement celui signé par le chauffeur.

## Tester en local

```bash
cd v2
npm install
npm test        # remplit un protocole d'exemple → outbox/exemple-protocole-rempli.pdf
npm start       # http://localhost:3000 (sans BREVO_API_KEY : e-mails écrits dans outbox/)
```

## Adapter à un autre chantier

1. Modifier `CHANTIER` dans `lib/config.js` (nom, adresse, contact, coordonnées GPS).
2. Modifier les règles de l'étape 1 dans `assets/js/i18n.js` (`rules.1` à `rules.9`).
3. Générer un QR code vers l'adresse du formulaire (`docs/qr-code-protocole.png` sert de modèle).
