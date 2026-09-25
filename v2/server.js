'use strict';
/**
 * Serveur du protocole de sécurité (hébergé sur Render).
 *
 *   GET  /health  → réveil / état du serveur (appelé dès l'ouverture du formulaire)
 *   POST /send    → reçoit le formulaire, remplit le PDF officiel, envoie l'e-mail Brevo
 *
 * Il sert aussi le formulaire (index.html + assets) pour les tests en local :
 *   npm install && npm start   →  http://localhost:3000
 */
require('dotenv').config();
const path = require('path');
const express = require('express');

const { CHANTIER, CONFIG } = require('./lib/config');
const { validate } = require('./lib/validate');
const { buildRecord } = require('./lib/record');
const { buildPdf } = require('./lib/pdf');
const { sendEmail } = require('./lib/email');
const { enregistrer } = require('./lib/registre');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render est derrière un proxy : nécessaire pour lire la vraie IP

// ------------------------------------------------------------------ en-têtes de sécurité
app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// ------------------------------------------------------------------ CORS (liste blanche)
app.use((req, res, next) => {
    const origin = req.get('origin');
    if (!origin) return next(); // appels hors navigateur : filtrés par la validation + limite de débit
    const selfOrigin = `${req.protocol}://${req.get('host')}`;
    const allowed = CONFIG.originesAutorisees.includes(origin)
        || origin === selfOrigin
        || (!CONFIG.production && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
    if (!allowed) {
        return res.status(403).json({ ok: false, error: 'Origine non autorisée.' });
    }
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
});

// ------------------------------------------------------------------ formulaire (tests locaux)
const ROOT = __dirname;
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.use('/assets', express.static(path.join(ROOT, 'assets'), { maxAge: '1h', fallthrough: false }));

// ------------------------------------------------------------------ santé / réveil
app.get('/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, chantier: CHANTIER.nom, email: CONFIG.brevoApiKey ? 'brevo' : 'test' });
});

// ------------------------------------------------------------------ limite de débit (mémoire)
const hits = new Map();
function rateLimit(req, res, next) {
    const now = Date.now();
    const windowMs = CONFIG.limiteFenetreMinutes * 60 * 1000;
    const list = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
    if (list.length >= CONFIG.limiteEnvois) {
        res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({ ok: false, error: 'Trop d’envois depuis cet appareil. Réessayez dans quelques minutes.' });
    }
    list.push(now);
    hits.set(req.ip, list);
    return next();
}
setInterval(() => {
    const limit = Date.now() - CONFIG.limiteFenetreMinutes * 60 * 1000;
    for (const [ip, list] of hits) if (!list.some((t) => t > limit)) hits.delete(ip);
}, 10 * 60 * 1000).unref();

// Anti double envoi : un même identifiant de formulaire n'est traité qu'une fois (1 h)
const traites = new Map();
setInterval(() => {
    const limit = Date.now() - 60 * 60 * 1000;
    for (const [id, v] of traites) if (v.at < limit) traites.delete(id);
}, 10 * 60 * 1000).unref();

// ------------------------------------------------------------------ réception du protocole
app.post(['/send', '/api/protocole'], express.json({ limit: '1mb' }), async (req, res) => {
    const started = Date.now();
    const body = req.body || {};

    // Pot de miel anti-robots : champ invisible pour un humain
    if (body.website) {
        console.warn('Envoi robot ignoré (honeypot) depuis', req.ip);
        return res.json({ ok: true, ref: 'OK', date: '', heure: '' });
    }

    const { ok, data, errors } = validate(body);
    if (!ok) {
        console.warn('Formulaire refusé :', Object.keys(errors).join(', '));
        return res.status(400).json({ ok: false, error: 'Formulaire incomplet.', errors });
    }

    if (data.id && traites.has(data.id)) {
        const prev = traites.get(data.id);
        return res.json({ ok: true, duplicate: true, ...prev.result });
    }

    return rateLimit(req, res, async () => {
        try {
            const record = buildRecord(data);
            const pdf = await buildPdf(data, record);
            const mail = await sendEmail(data, record, pdf);

            const result = {
                ref: record.ref,
                date: record.date,
                heure: record.heure,
                nom: data.nom,
                entreprise: data.entreprise,
                transporteur: data.transporteur,
                immatriculation: data.immatriculation,
                alertes: record.alertes.length,
            };
            if (data.id) traites.set(data.id, { at: Date.now(), result });

            console.log(`✅ ${record.ref} – ${data.transporteur} / ${data.nom} → ${data.entreprise} `
                + `(PDF ${Math.round(pdf.length / 1024)} Ko, e-mail ${mail.messageId}, ${Date.now() - started} ms)`);

            // Registre (optionnel) : n'empêche jamais la réponse au chauffeur
            enregistrer(data, record, pdf)
                .then((r) => { if (!r.skipped) console.log(`   registre OK – ${record.ref}`); })
                .catch((e) => console.error(`   registre KO – ${record.ref} :`, e.message));

            return res.json({ ok: true, ...result });
        } catch (e) {
            console.error('❌ Échec de l’envoi :', e.message);
            return res.status(502).json({ ok: false, error: 'L’envoi a échoué. Réessayez dans un instant.' });
        }
    });
});

// ------------------------------------------------------------------ erreurs
app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ ok: false, error: 'Envoi trop volumineux.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: 'Données illisibles.' });
    if (err.status === 404 || err.statusCode === 404) return res.status(404).send('Introuvable');
    console.error(err);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
});

if (require.main === module) {
    app.listen(CONFIG.port, '0.0.0.0', () => {
        console.log(`🚀 Protocole ${CHANTIER.nom} – serveur démarré sur le port ${CONFIG.port}`);
        if (!CONFIG.brevoApiKey) console.log('   ⚠️  BREVO_API_KEY absente : mode test, les e-mails sont écrits dans ./outbox/');
        if (!CONFIG.registreUrl) console.log('   ℹ️  Registre Google Sheets non configuré (facultatif).');
    });
}

module.exports = app;
