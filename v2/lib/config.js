'use strict';
/**
 * Configuration du chantier et du serveur.
 *
 * Tout ce qui est propre au chantier est regroupé ici. Pour un autre chantier
 * utilisant le même modèle Demathieu Bard (DB-PRE-F-V2022-09), il suffit de
 * dupliquer l'objet CHANTIER et de remplacer le PDF.
 *
 * Les paramètres sensibles (clé Brevo, destinataires…) sont lus dans les
 * variables d'environnement (sur Render : Dashboard → Environment).
 */
const path = require('path');

const env = (name, fallback) => {
    const v = process.env[name];
    return v === undefined || v === '' ? fallback : v;
};

const list = (value) => String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const CHANTIER = {
    code: 'ISSY',
    nom: 'GARE ISSY RER',
    // Texte écrit dans le cadre « NOM DU CHANTIER » (page 3 du protocole)
    nomComplet: "GARE D'ISSY RER – Ligne 15 Sud",
    adresse: ['Place Léon Blum', '92130 Issy-les-Moulineaux'],
    // Position du chantier (Place Léon Blum) pour contrôler la position GPS du chauffeur
    latitude: 48.8210,
    longitude: 2.2602,
    rayonAlerteMetres: 500,
    contact: {
        nom: 'Paul-Henri TIBERGHIEN',
        tel: '06 27 44 46 79',
        email: '', // laisser vide si vous ne souhaitez pas l'imprimer sur le protocole
    },
    // Limite de vitesse à cocher en page 4 (10, 20 ou 30). null = ne rien cocher.
    vitesseMax: null,
    // Équipements disponibles sur le chantier (page 2, rempli par l'entreprise d'accueil).
    // Codes possibles : quai, pir, grue_tour, grue_mobile, pont_roulant, accessoires_levage,
    // chariot, transpalette, diable. Laisser vide pour que l'encadrement les coche lui-même.
    equipementsSite: [],
    pdfModele: path.join(__dirname, '..', 'assets', 'protocole-securite.pdf'),
    referenceDocument: 'DB-PRE-F-V2022-09',
};

const CONFIG = {
    port: Number(env('PORT', 3000)),
    production: env('NODE_ENV', '') === 'production' || Boolean(process.env.RENDER),
    timezone: 'Europe/Paris',

    brevoApiKey: env('BREVO_API_KEY', ''),
    expediteur: {
        email: env('MAIL_SENDER_EMAIL', 'bestafacilities@outlook.fr'),
        nom: env('MAIL_SENDER_NAME', 'Gare Logistique'),
    },
    destinataires: list(env('MAIL_TO', 'bestafacilities@outlook.fr')),
    copieCachee: list(env('MAIL_BCC', '')),
    repondreA: env('MAIL_REPLY_TO', 'bestafacilities@outlook.fr'),

    // Domaines autorisés à appeler l'API depuis un navigateur
    originesAutorisees: list(env('ALLOWED_ORIGINS', 'https://bestafacilities.github.io')),

    // Registre Google Sheets / Drive (optionnel) — voir integrations/google-apps-script.gs
    registreUrl: env('SHEETS_WEBHOOK_URL', ''),
    registreSecret: env('SHEETS_WEBHOOK_SECRET', ''),

    // Anti-abus : nombre maximum d'envois par adresse IP sur la fenêtre donnée
    limiteEnvois: Number(env('RATE_LIMIT_MAX', 12)),
    limiteFenetreMinutes: Number(env('RATE_LIMIT_WINDOW_MIN', 15)),
};

module.exports = { CHANTIER, CONFIG };
