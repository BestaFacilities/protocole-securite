'use strict';
/**
 * Codes acceptés par l'API → libellés français (repris du protocole officiel).
 * Le formulaire envoie des codes (indépendants de la langue du chauffeur) ;
 * le serveur les traduit en français pour l'e-mail et le PDF.
 */
module.exports = {
    operation: {
        chargement: 'Chargement',
        dechargement: 'Déchargement',
        les_deux: 'Chargement et déchargement',
    },
    realisation: {
        transporteur: 'Réalisé par le transport/fournisseur',
        accueil: "Réalisé par l'entreprise d'accueil",
    },
    dangers: {
        explosif: 'Explosif (SGH01)',
        inflammable: 'Inflammable (SGH02)',
        comburant: 'Comburant (SGH03)',
        gaz: 'Gaz sous pression (SGH04)',
        nocif: 'Nocif / irritant (SGH07)',
        corrosif: 'Corrosif (SGH05)',
        toxique: 'Toxique (SGH06)',
        sante: 'Danger pour la santé (SGH08)',
        environnement: "Dangereux pour l'environnement (SGH09)",
    },
    conditionnement: {
        colis: 'Colis',
        palette: 'Palette filmée',
        panier: 'Panier',
        rack: 'Rack',
        caisse_palette: 'Caisse palette',
        big_bag: 'Big Bag',
        bidon: 'Bidon',
        benne: 'Benne',
        container: 'Container',
    },
    tonnage: {
        moins_3t5: 'Porteur de moins de 3,5 T',
        plus_3t5: 'Porteur de plus de 3,5 T',
    },
    caracteristiques: {
        articule: 'Ensemble articulé',
        toupie: 'Toupie',
        citerne: 'Citerne',
        benne: 'Benne',
        plateau: 'Plateau',
        bache_sol: 'Bâché depuis le sol',
        porte_engin: 'Porte-engin',
        fourgon: 'Fourgon / utilitaire',
    },
    manutention: {
        grue_aux: 'Grue auxiliaire',
        hayon: 'Hayon élévateur',
        benne_basc: 'Benne basculante',
        transpalette: 'Transpalette',
        diable: 'Diable',
        elingues: 'Élingues à demeure',
    },
    epi: {
        casque: 'Casque de chantier',
        gants: 'Gants de protection',
        chaussures: 'Chaussures de sécurité',
        haute_visibilite: 'Gilet ou veste haute visibilité',
        pantalon: 'Pantalon de travail',
    },
    langues: {
        fr: 'Français', en: 'Anglais', pt: 'Portugais', es: 'Espagnol', pl: 'Polonais', ro: 'Roumain',
    },
};
