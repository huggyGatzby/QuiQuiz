// Configuration de l'API
// En production, remplacer par l'URL Railway
const CONFIG = {
    API_URL: window.location.hostname === 'localhost'
        ? '' // En local, même serveur
        : 'https://quiquiz-api.up.railway.app' // URL Railway (à mettre à jour après déploiement)
};
