'use strict';
/**
 * Test rapide, sans réseau : validation, génération du PDF rempli, contenu de l'e-mail
 * et appels HTTP sur le serveur (en mode test, sans clé Brevo).
 *   npm test          → écrit un exemple dans outbox/exemple-protocole-rempli.pdf
 */
process.env.BREVO_API_KEY = '';
process.env.SHEETS_WEBHOOK_URL = '';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { validate } = require('../lib/validate');
const { buildRecord } = require('../lib/record');
const { buildPdf } = require('../lib/pdf');
const { buildEmail } = require('../lib/email');

const signature = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'fixtures', 'signature.png')).toString('base64');

const exemple = {
    id: 'test-0001',
    lang: 'fr',
    lu_protocole: true,
    epi: ['casque', 'gants', 'chaussures', 'haute_visibilite', 'pantalon'],
    transporteur: 'Transports Łukasz & Fils <script>',
    fournisseur: 'Placoplatre',
    entreprise: 'Isoprotec Feu',
    adresse: '12 rue de l’Industrie, 93290 Tremblay-en-France',
    nom: 'Sadek Chebal',
    telephone: '06 12 34 56 78',
    immatriculation: 'ab-123-cd',
    tonnage: 'plus_3t5',
    hauteur_ok: 'oui',
    longueur_ok: 'non',
    caracteristiques: ['plateau', 'fourgon'],
    caracteristique_autre: '',
    manutention: ['grue_aux', 'transpalette'],
    operation: 'dechargement',
    realisation: 'transporteur',
    matieres: 'Plaques de plâtre BA13 et rails métalliques (staff), 12 palettes filmées – livraison lot cloisons niveau R+2',
    produits_dangereux: 'oui',
    dangers: ['inflammable', 'nocif'],
    conditionnement: ['palette', 'colis'],
    conditionnement_autre: 'Touret',
    poids_kg: '850',
    dim_longueur: '2,6',
    dim_largeur: '1.2',
    dim_hauteur: '1',
    gps: { lat: 48.82109, lng: 2.26053, accuracy: 12 },
    signature,
    website: '',
};

(async () => {
    // 1. Les matières transportées sont obligatoires (bug signalé)
    for (const m of ['', '   ', '-', '...', 'rien', 'RAS', 'x', 'ok']) {
        const r = validate({ ...exemple, matieres: m });
        assert(!r.ok && r.errors.matieres, `matières « ${m} » aurait dû être refusé`);
    }
    // 2. Autres champs obligatoires
    assert(validate({ ...exemple, epi: ['casque'] }).errors.epi);
    assert(validate({ ...exemple, lu_protocole: false }).errors.lu_protocole);
    assert(validate({ ...exemple, signature: '' }).errors.signature);
    assert(validate({ ...exemple, produits_dangereux: 'oui', dangers: [] }).errors.dangers);
    assert(validate({ ...exemple, realisation: 'accueil', poids_kg: '' }).errors.poids_kg);
    assert(validate({ ...exemple, telephone: '12' }).errors.telephone);
    assert(validate({ ...exemple, tonnage: 'nimportequoi' }).errors.tonnage);
    assert(validate({ ...exemple, caracteristiques: [], caracteristique_autre: '' }).errors.caracteristiques);

    // 3. Exemple complet valide
    const v = validate(exemple);
    assert(v.ok, JSON.stringify(v.errors));
    assert.strictEqual(v.data.immatriculation, 'AB-123-CD');
    assert.strictEqual(v.data.dim_longueur, 2.6);

    const record = buildRecord(v.data, new Date('2026-09-25T12:32:00Z'));
    assert.strictEqual(record.heure, '14:32', 'heure de Paris attendue');
    assert(record.gps.surSite, 'la position de test est sur le chantier');
    assert(record.alertes.some((a) => a.includes('8 m')));

    // 4. E-mail : le HTML saisi par le chauffeur doit être neutralisé
    const mail = buildEmail(v.data, record);
    assert(!mail.html.includes('<script>'), 'injection HTML non échappée');
    assert(mail.html.includes('&lt;script&gt;'));

    // 5. PDF rempli
    const pdf = await buildPdf(v.data, record);
    assert(pdf.length > 100000);
    const out = path.join(__dirname, '..', 'outbox');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'exemple-protocole-rempli.pdf'), pdf);
    fs.writeFileSync(path.join(out, 'exemple-email.html'), mail.html);

    // 6. Serveur HTTP
    const app = require('../server');
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        const h = await fetch(base + '/health').then((r) => r.json());
        assert(h.ok);
        const bad = await fetch(base + '/send', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...exemple, id: 'x1', matieres: '' }),
        });
        assert.strictEqual(bad.status, 400);
        assert((await bad.json()).errors.matieres);

        const evil = await fetch(base + '/send', {
            method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://pirate.example' },
            body: JSON.stringify(exemple),
        });
        assert.strictEqual(evil.status, 403);

        const good = await fetch(base + '/send', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...exemple, id: 'x2' }),
        }).then((r) => r.json());
        assert(good.ok && good.ref, JSON.stringify(good));
        const again = await fetch(base + '/send', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...exemple, id: 'x2' }),
        }).then((r) => r.json());
        assert(again.duplicate && again.ref === good.ref, 'le double envoi doit être ignoré');
    } finally {
        server.close();
    }

    console.log('✅ Tous les tests passent. Exemple : outbox/exemple-protocole-rempli.pdf');
    process.exit(0);
})().catch((e) => {
    console.error('❌', e);
    process.exit(1);
});
