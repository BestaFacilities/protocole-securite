'use strict';
/**
 * Construit l'« enregistrement » d'une validation à partir des données validées :
 * référence unique, horodatage serveur (heure de Paris), contrôle GPS, alertes.
 */
const crypto = require('crypto');
const L = require('./labels');
const { CHANTIER, CONFIG } = require('./config');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I pour éviter les confusions

function randomCode(n) {
    const bytes = crypto.randomBytes(n);
    return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

function partsInParis(date) {
    const fmt = new Intl.DateTimeFormat('fr-FR', {
        timeZone: CONFIG.timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
    return p; // { day, month, year, hour, minute, second }
}

function distanceMetres(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(lat2 - lat1);
    const dLng = rad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

function formatDistance(m) {
    return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

function buildRecord(d, now = new Date()) {
    const p = partsInParis(now);
    const ref = `${CHANTIER.code}-${p.year}${p.month}${p.day}-${p.hour}${p.minute}-${randomCode(4)}`;

    let gps = null;
    if (d.gps) {
        const distance = distanceMetres(d.gps.lat, d.gps.lng, CHANTIER.latitude, CHANTIER.longitude);
        gps = {
            ...d.gps,
            distance,
            distanceTexte: formatDistance(distance),
            surSite: distance <= CHANTIER.rayonAlerteMetres,
            lien: `https://www.google.com/maps?q=${d.gps.lat.toFixed(6)},${d.gps.lng.toFixed(6)}`,
            texte: `${d.gps.lat.toFixed(6)}, ${d.gps.lng.toFixed(6)}`,
        };
    }

    const caracteristiques = d.caracteristiques.map((c) => L.caracteristiques[c]);
    if (d.caracteristique_autre) caracteristiques.push(d.caracteristique_autre);
    const conditionnement = d.conditionnement.map((c) => L.conditionnement[c]);
    if (d.conditionnement_autre) conditionnement.push(d.conditionnement_autre);

    // Alertes à signaler en tête de l'e-mail
    const alertes = [];
    if (!gps) alertes.push('Position GPS non transmise (refusée ou indisponible)');
    else if (!gps.surSite) alertes.push(`Validation faite à ${gps.distanceTexte} du chantier`);
    if (d.hauteur_ok === 'non') alertes.push('Véhicule de 4,2 m de haut ou plus');
    if (d.longueur_ok === 'non') alertes.push('Véhicule de 8 m de long ou plus');
    if (d.produits_dangereux === 'oui') alertes.push(`Produits dangereux : ${d.dangers.map((c) => L.dangers[c]).join(', ')}`);
    if (d.realisation === 'accueil') alertes.push("Manutention à réaliser par l'entreprise d'accueil (engin / grue du chantier)");

    const dims = [d.dim_longueur, d.dim_largeur, d.dim_hauteur];
    const dimensionsTexte = dims.every((v) => v !== null)
        ? dims.map((v) => String(v).replace('.', ',')).join(' × ') + ' m'
        : '';

    return {
        ref,
        chantier: CHANTIER.nom,
        date: `${p.day}/${p.month}/${p.year}`,
        heure: `${p.hour}:${p.minute}`,
        horodatage: `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`,
        iso: now.toISOString(),
        parts: p,
        gps,
        alertes,
        libelles: {
            operation: L.operation[d.operation],
            realisation: L.realisation[d.realisation],
            tonnage: L.tonnage[d.tonnage],
            caracteristiques,
            manutention: d.manutention.map((c) => L.manutention[c]),
            dangers: d.dangers.map((c) => L.dangers[c]),
            conditionnement,
            epi: d.epi.map((c) => L.epi[c]),
            langue: L.langues[d.lang],
            poids: d.poids_kg !== null ? `${String(d.poids_kg).replace('.', ',')} kg` : '',
            dimensions: dimensionsTexte,
        },
        fichier: `Protocole_${CHANTIER.code}_${p.year}-${p.month}-${p.day}_${p.hour}h${p.minute}_${slug(d.transporteur)}_${slug(d.nom)}.pdf`,
    };
}

function slug(s) {
    return String(s)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || 'inconnu';
}

module.exports = { buildRecord, distanceMetres };
