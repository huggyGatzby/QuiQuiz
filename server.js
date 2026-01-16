const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS pour permettre les requêtes depuis Hostinger
const allowedOrigins = [
  'http://localhost:3000',
  'https://quiquiz.fr',
  'https://www.quiquiz.fr',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    // Autoriser les requêtes sans origin (Postman, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(allowed => origin.startsWith(allowed.replace('www.', '')) || allowed.includes(origin))) {
      return callback(null, true);
    }
    callback(null, true); // En dev, on autorise tout
  },
  credentials: true
}));

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Charger les données
const capitals = JSON.parse(fs.readFileSync('./data/capitals.json', 'utf8'));
const departments = JSON.parse(fs.readFileSync('./data/departments.json', 'utf8'));
const departmentsMap = JSON.parse(fs.readFileSync('./data/departments-map.json', 'utf8'));

// API: Liste des thèmes organisés par catégories
app.get('/api/themes', (req, res) => {
  res.json([
    {
      category: 'Géographie',
      icon: '🌍',
      themes: [
        { id: 'capitals', name: 'Capitales du monde', count: capitals.length },
        { id: 'departments', name: 'Départements français', count: departments.length },
        { id: 'departments-map', name: 'Départements (Carte)', count: departmentsMap.length, isMap: true }
      ]
    }
  ]);
});

// API: Générer un quiz
app.get('/api/quiz/:theme', (req, res) => {
  const { theme } = req.params;
  const count = parseInt(req.query.count) || 10;

  let data;
  if (theme === 'capitals') {
    data = capitals;
  } else if (theme === 'departments') {
    data = departments;
  } else if (theme === 'departments-map') {
    data = departmentsMap;
  } else {
    return res.status(400).json({ error: 'Thème inconnu' });
  }

  // Mélanger et prendre X questions
  const shuffled = [...data].sort(() => Math.random() - 0.5);
  const questions = shuffled.slice(0, count).map((item, index) => ({
    id: index + 1,
    question: item.question,
    answer: item.answer
  }));

  res.json(questions);
});

// Calcul de la distance de Levenshtein (similarité entre deux chaînes)
function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // suppression
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// API: Vérifier une réponse (avec tolérance aux fautes)
app.post('/api/check', (req, res) => {
  const { userAnswer, correctAnswer } = req.body;

  const normalize = (str) => {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Enlever accents
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')            // Normaliser espaces multiples
      .trim();
  };

  const normalizedUser = normalize(userAnswer);
  const normalizedCorrect = normalize(correctAnswer);

  // Correspondance exacte
  if (normalizedUser === normalizedCorrect) {
    return res.json({ correct: true });
  }

  // Si la réponse correcte est un numéro (département), pas de tolérance
  const isNumeric = /^\d+$/.test(correctAnswer.trim());
  if (isNumeric) {
    return res.json({ correct: false });
  }

  // Tolérance aux fautes de frappe basée sur la longueur du mot
  const distance = levenshtein(normalizedUser, normalizedCorrect);
  const maxLength = Math.max(normalizedUser.length, normalizedCorrect.length);

  // Seuil de tolérance :
  // - Mots courts (≤4 chars) : 1 erreur max
  // - Mots moyens (5-8 chars) : 2 erreurs max
  // - Mots longs (>8 chars) : ~20% d'erreurs max
  let tolerance;
  if (maxLength <= 4) {
    tolerance = 1;
  } else if (maxLength <= 8) {
    tolerance = 2;
  } else {
    tolerance = Math.floor(maxLength * 0.2);
  }

  const isCorrect = distance <= tolerance;

  res.json({ correct: isCorrect });
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════╗
  ║     🎮 QuiQuiz Beta - Serveur local    ║
  ║                                        ║
  ║     http://localhost:${PORT}              ║
  ║                                        ║
  ║     Ctrl+C pour arrêter                ║
  ╚════════════════════════════════════════╝
  `);
});
