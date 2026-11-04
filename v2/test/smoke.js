'use strict';
/**
 * Test rapide, sans Internet : validation, génération du PDF rempli, contenu de l'e-mail
 * et appels HTTP sur le serveur (mode test, sans clé Brevo). Un faux « Apps Script » local
 * permet de tester l'envoi par Gmail, le secours Brevo, le registre et les alertes.
 *   npm test          → écrit un exemple dans outbox/exemple-protocole-rempli.pdf
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

// ---------------------------------------------------------------- faux script Google Apps Script
const recus = [];
let fauxEnPanne = false;
const faux = http.createServer((req, res) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => {
        const j = JSON.parse(b);
        recus.push(j);
        res.setHeader('content-type', 'application/json');
        if (fauxEnPanne) { res.statusCode = 500; return res.end('{}'); }
        if (j.secret !== 'secret-test') return res.end(JSON.stringify({ ok: false, error: 'secret invalide' }));
        return res.end(JSON.stringify({ ok: true, archived: !j.alerte, mailed: Boolean(j.mail || j.alerte) }));
    });
});
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

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
    await new Promise((r) => faux.listen(0, '127.0.0.1', r));
    process.env.BREVO_API_KEY = '';
    process.env.SHEETS_WEBHOOK_URL = `http://127.0.0.1:${faux.address().port}/exec`;
    process.env.SHEETS_WEBHOOK_SECRET = 'secret-test';
    process.env.MAIL_VIA = 'gmail';
    process.env.DAILY_MAX = '5';
    process.env.DAILY_ALERT = '3';
    const { validate } = require('../lib/validate');
    const { buildRecord } = require('../lib/record');
    const { buildPdf } = require('../lib/pdf');
    const { buildEmail } = require('../lib/email');
    const { decrireAppareil } = require('../lib/appareil');

    // 0. Description de l'appareil
    assert.strictEqual(decrireAppareil('Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'), 'Android 14 · Chrome 130');
    assert.strictEqual(decrireAppareil('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'), 'iPhone iOS 17.5 · Safari 17.5');
    assert.strictEqual(decrireAppareil(''), 'Inconnu');

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

    const record = buildRecord(v.data, new Date('2026-09-25T12:32:00Z'), { ip: '203.0.113.7', appareil: 'Android 14 · Chrome 130' });
    assert.strictEqual(record.heure, '14:32', 'heure de Paris attendue');
    assert(record.gps.surSite, 'la position de test est sur le chantier');
    assert(record.alertes.some((a) => a.includes('8 m')));
    assert(record.fichier.includes('Lukasz'), `lettre Ł perdue dans le nom du fichier : ${record.fichier}`);
    assert(!('lat' in record.gps) && !('lng' in record.gps), 'les coordonnées GPS exactes ne doivent pas être conservées');

    // 4. E-mail : le HTML saisi par le chauffeur doit être neutralisé ; pas de coordonnées GPS
    record.empreinte = 'a'.repeat(64);
    const mail = buildEmail(v.data, record);
    assert(!mail.html.includes('<script>'), 'injection HTML non échappée');
    assert(mail.html.includes('&lt;script&gt;'));
    assert(!mail.html.includes('48.82') && !mail.html.includes('google.com/maps'), 'coordonnées GPS dans l’e-mail');
    assert(mail.html.includes('a'.repeat(64)) && mail.text.includes('a'.repeat(64)), 'empreinte absente de l’e-mail');
    assert(mail.html.includes('203.0.113.7'));
    record.empreinte = '';

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

        const ANDROID = 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
        const envoyer = (id) => fetch(base + '/send', {
            method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': ANDROID },
            body: JSON.stringify({ ...exemple, id }),
        });

        // a) Envoi par Gmail (Apps Script) : un seul appel qui archive ET envoie l'e-mail
        const good = await envoyer('x2').then((r) => r.json());
        assert(good.ok && good.ref, JSON.stringify(good));
        assert.strictEqual(recus.length, 1);
        const appel = recus[0];
        assert.strictEqual(appel.ligne.reference, good.ref);
        assert.match(appel.ligne.empreinte, /^[0-9a-f]{64}$/, 'empreinte SHA-256 attendue dans le registre');
        assert.strictEqual(appel.ligne.appareil, 'Android 14 · Chrome 130');
        assert(!('gps' in appel.ligne) && appel.ligne.distance_chantier_m >= 0, 'seule la distance doit partir au registre');
        assert(appel.mail && appel.mail.subject.includes(exemple.entreprise) && appel.mail.html.includes(appel.ligne.empreinte));
        const pdfRecu = Buffer.from(appel.pdf.base64, 'base64');
        assert.strictEqual(require('crypto').createHash('sha256').update(pdfRecu).digest('hex'), appel.ligne.empreinte,
            'l’empreinte doit correspondre au PDF envoyé');

        // b) Double envoi ignoré
        const again = await envoyer('x2').then((r) => r.json());
        assert(again.duplicate && again.ref === good.ref, 'le double envoi doit être ignoré');
        assert.strictEqual(recus.length, 1);

        // c) Apps Script en panne → secours Brevo (mode test : outbox/) et le chauffeur est quand même validé
        fauxEnPanne = true;
        const secours = await envoyer('x3').then((r) => r.json());
        assert(secours.ok, JSON.stringify(secours));
        assert(fs.existsSync(path.join(__dirname, '..', 'outbox', `${secours.ref}.html`)), 'e-mail de secours Brevo attendu');
        fauxEnPanne = false;

        // d) Plafond journalier (DAILY_MAX=5, alerte à 3)
        const avant = recus.length;
        assert((await envoyer('x4').then((r) => r.json())).ok); // 3e envoi du jour → alerte
        await attendre(300);
        assert(recus.slice(avant).some((j) => j.alerte && j.alerte.subject.includes('3 envois')), 'alerte de seuil attendue');
        assert((await envoyer('x5').then((r) => r.json())).ok);
        assert((await envoyer('x6').then((r) => r.json())).ok);
        const bloque = await envoyer('x7');
        assert.strictEqual(bloque.status, 503);
        assert.strictEqual((await bloque.json()).code, 'quota');
        await attendre(300);
        assert(recus.some((j) => j.alerte && j.alerte.subject.includes('plafond')), 'alerte de plafond attendue');
    } finally {
        server.close();
        faux.close();
    }

    console.log('✅ Tous les tests passent. Exemple : outbox/exemple-protocole-rempli.pdf');
    process.exit(0);
})().catch((e) => {
    console.error('❌', e);
    process.exit(1);
});
