require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const SibApiV3Sdk = require('sib-api-v3-sdk');

const app = express();
const PORT = 3000;

app.use(cors({ origin: '*' }));
app.use(bodyParser.json({ limit: '50mb' }));

const client = SibApiV3Sdk.ApiClient.instance;
const apiKey = client.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

app.post('/send', async (req, res) => {
    try {
        const { 
            raison, societe, entreprise, type_operation, matieres,
            type_vehicule, caracteristiques, livraison_mode,
            date, heure, nom, pdfBase64, signatureImage, 
            coords, epi_verifies, filename
        } = req.body;

        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSmtpEmail.subject = `✅ PROTOCOLE VALIDÉ - ${entreprise} - ${nom}`;
        
        sendSmtpEmail.htmlContent = `
            <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; border: 1px solid #ddd; padding: 20px; border-radius: 10px;">
                <h2 style="color: #003366; border-bottom: 4px solid #FF6600; padding-bottom: 10px;">Validation Entrée Chantier</h2>
                
                <p style="background: #fdf2f2; padding: 10px; border-radius: 5px; color: #c53030; font-weight: bold;">
                    🛡️ EPI Vérifiés : OUI | 📍 GPS : ${coords || 'Non détecté'}
                </p>

                <h3 style="color: #FF6600;">1. Transport & Intervenants</h3>
                <p><strong>Transporteur :</strong> ${raison}</p>
                <p><strong>Société Livraison :</strong> ${societe || 'N/A'}</p>
                <p><strong>Entreprise livrée :</strong> ${entreprise}</p>

                <h3 style="color: #FF6600;">2. Véhicule & Logistique</h3>
                <p><strong>Type :</strong> ${type_vehicule}</p>
                <p><strong>Caractéristiques :</strong> ${caracteristiques}</p>
                <p><strong>Mode :</strong> ${livraison_mode}</p>
                <p><strong>Matières :</strong> ${matieres || 'Non précisées'}</p>

                <h3 style="color: #FF6600;">3. Opération</h3>
                <p><strong>Type Opération :</strong> ${type_operation}</p>
                <p><strong>Chauffeur :</strong> ${nom}</p>
                <p><strong>Date/Heure :</strong> ${date} à ${heure}</p>
            </div>
        `;
        
        sendSmtpEmail.sender = { "name": "Gare Logistique", "email": "bestafacilities@outlook.fr" };
        sendSmtpEmail.to = [{ "email": "bestafacilities@outlook.fr" }];
        sendSmtpEmail.attachment = [
            { "content": pdfBase64, "name": filename || "protocole.pdf" },
            { "content": signatureImage, "name": `Signature_${nom.replace(/\s+/g, '_')}.png` }
        ];

        await apiInstance.sendTransacEmail(sendSmtpEmail);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.listen(PORT, () => console.log(`🚀 Serveur démarré sur le port ${PORT}`));