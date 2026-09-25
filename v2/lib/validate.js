'use strict';
/**
 * Validation stricte des données envoyées par le formulaire.
 * Rien n'est fait confiance côté navigateur : tout est revérifié ici.
 */
const L = require('./labels');

// Réponses « vides » refusées pour les champs texte obligatoires (ex. matières transportées)
const REPONSES_VIDES = new Set([
    '-', '--', '.', '..', '...', '/', '?', 'x', 'xx', 'xxx', 'na', 'n/a', 'nc', 'n.c', 'nr',
    'rien', 'aucun', 'aucune', 'ras', 'r.a.s', 'non', 'oui', 'idem', 'test', 'divers', 'autre',
    'none', 'nothing', 'nada', 'ok',
]);

function clean(value, max = 200) {
    if (value === undefined || value === null) return '';
    return String(value)
        .normalize('NFC')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
}

function hasLetters(value, min) {
    const letters = value.match(/\p{L}/gu);
    return Boolean(letters) && letters.length >= min;
}

function codes(value, dict, max = 20) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((c) => typeof c === 'string' && Object.hasOwn(dict, c)))].slice(0, max);
}

function number(value, min, max) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(String(value).replace(',', '.').replace(/\s/g, ''));
    if (!Number.isFinite(n) || n < min || n > max) return NaN;
    return Math.round(n * 100) / 100;
}

function validate(body) {
    const errors = {};
    const err = (field, message) => { if (!errors[field]) errors[field] = message; };
    const b = body && typeof body === 'object' ? body : {};

    const d = {
        id: clean(b.id, 64).replace(/[^a-zA-Z0-9-]/g, ''),
        lang: Object.hasOwn(L.langues, b.lang) ? b.lang : 'fr',

        lu_protocole: b.lu_protocole === true,
        epi: codes(b.epi, L.epi),

        transporteur: clean(b.transporteur, 80),
        fournisseur: clean(b.fournisseur, 80),
        entreprise: clean(b.entreprise, 80),
        adresse: clean(b.adresse, 140),
        nom: clean(b.nom, 60),
        fonction: clean(b.fonction, 40) || 'Chauffeur livreur',
        telephone: clean(b.telephone, 25),
        immatriculation: clean(b.immatriculation, 15).toUpperCase(),

        tonnage: Object.hasOwn(L.tonnage, b.tonnage) ? b.tonnage : '',
        hauteur_ok: ['oui', 'non'].includes(b.hauteur_ok) ? b.hauteur_ok : '',
        longueur_ok: ['oui', 'non'].includes(b.longueur_ok) ? b.longueur_ok : '',
        caracteristiques: codes(b.caracteristiques, L.caracteristiques),
        caracteristique_autre: clean(b.caracteristique_autre, 40),
        manutention: codes(b.manutention, L.manutention),

        operation: Object.hasOwn(L.operation, b.operation) ? b.operation : '',
        realisation: Object.hasOwn(L.realisation, b.realisation) ? b.realisation : '',
        matieres: clean(b.matieres, 300),
        produits_dangereux: ['oui', 'non'].includes(b.produits_dangereux) ? b.produits_dangereux : '',
        dangers: codes(b.dangers, L.dangers),
        conditionnement: codes(b.conditionnement, L.conditionnement),
        conditionnement_autre: clean(b.conditionnement_autre, 40),

        poids_kg: number(b.poids_kg, 0.1, 200000),
        dim_longueur: number(b.dim_longueur, 0.01, 40),
        dim_largeur: number(b.dim_largeur, 0.01, 40),
        dim_hauteur: number(b.dim_hauteur, 0.01, 40),

        gps: null,
        signature: null,
    };

    // --- Engagements
    if (!d.lu_protocole) err('lu_protocole', 'La lecture du protocole doit être confirmée.');
    const epiManquants = Object.keys(L.epi).filter((c) => !d.epi.includes(c));
    if (epiManquants.length) err('epi', 'Tous les EPI obligatoires doivent être confirmés.');

    // --- Identification
    if (!hasLetters(d.transporteur, 2)) err('transporteur', 'Raison sociale du transporteur obligatoire.');
    if (!hasLetters(d.entreprise, 2)) err('entreprise', 'Entreprise livrée obligatoire.');
    if (!hasLetters(d.nom, 3)) err('nom', 'Nom et prénom du chauffeur obligatoires.');
    const digits = d.telephone.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) err('telephone', 'Numéro de téléphone invalide.');
    const plaque = d.immatriculation.replace(/[\s-]/g, '');
    if (!/^[A-Z0-9]{4,12}$/.test(plaque)) err('immatriculation', 'Immatriculation invalide.');

    // --- Véhicule
    if (!d.tonnage) err('tonnage', 'Type de véhicule obligatoire.');
    if (!d.hauteur_ok) err('hauteur_ok', 'Indiquez si le véhicule mesure moins de 4,2 m de haut.');
    if (!d.longueur_ok) err('longueur_ok', 'Indiquez si le véhicule mesure moins de 8 m de long.');
    if (!d.caracteristiques.length && !hasLetters(d.caracteristique_autre, 2)) {
        err('caracteristiques', 'Sélectionnez au moins une caractéristique du véhicule.');
    }

    // --- Opération & marchandise
    if (!d.operation) err('operation', "Type d'opération obligatoire.");
    if (!d.realisation) err('realisation', 'Indiquez qui réalise le chargement/déchargement.');
    const matieresNorm = d.matieres.toLowerCase().replace(/[\s.]+$/g, '');
    if (!hasLetters(d.matieres, 3) || REPONSES_VIDES.has(matieresNorm)) {
        err('matieres', 'Précisez les matières transportées (ex. : acier, béton, palettes de plaques de plâtre…).');
    }
    if (!d.produits_dangereux) err('produits_dangereux', 'Indiquez si vous transportez des produits dangereux.');
    if (d.produits_dangereux === 'oui' && !d.dangers.length) err('dangers', 'Sélectionnez les pictogrammes de danger.');
    if (d.produits_dangereux === 'non') d.dangers = [];
    if (!d.conditionnement.length && !hasLetters(d.conditionnement_autre, 2)) {
        err('conditionnement', 'Sélectionnez au moins un conditionnement.');
    }

    for (const f of ['poids_kg', 'dim_longueur', 'dim_largeur', 'dim_hauteur']) {
        if (Number.isNaN(d[f])) err(f, 'Valeur invalide.');
    }
    if (d.realisation === 'accueil') {
        if (d.poids_kg === null) err('poids_kg', "Le poids est obligatoire quand l'entreprise d'accueil réalise la manutention.");
        for (const f of ['dim_longueur', 'dim_largeur', 'dim_hauteur']) {
            if (d[f] === null) err(f, "Les dimensions sont obligatoires quand l'entreprise d'accueil réalise la manutention.");
        }
    }

    // --- GPS (facultatif : le chauffeur peut refuser la géolocalisation)
    if (b.gps && typeof b.gps === 'object') {
        const lat = Number(b.gps.lat);
        const lng = Number(b.gps.lng);
        const acc = Number(b.gps.accuracy);
        if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
            d.gps = { lat, lng, accuracy: Number.isFinite(acc) ? Math.round(acc) : null };
        }
    }

    // --- Signature (PNG en base64)
    const sig = typeof b.signature === 'string' ? b.signature : '';
    const m = sig.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
    if (!m) {
        err('signature', 'Signature obligatoire.');
    } else {
        const buf = Buffer.from(m[1], 'base64');
        const isPng = buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47;
        if (!isPng || buf.length < 800 || buf.length > 700 * 1024) err('signature', 'Signature invalide.');
        else d.signature = buf;
    }

    return { ok: Object.keys(errors).length === 0, data: d, errors };
}

module.exports = { validate, clean };
