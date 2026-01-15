// Configuration de l'API
const CONFIG = {
    API_URL: window.location.hostname === 'localhost'
        ? '' // En local, même serveur
        : 'https://quiquiz-production-645d.up.railway.app' // URL Railway
};
