const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
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
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(allowed => origin.startsWith(allowed.replace('www.', '')) || allowed.includes(origin))) {
      return callback(null, true);
    }
    callback(null, true);
  },
  credentials: true
}));

// Socket.IO avec CORS
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Charger les données
const capitals = JSON.parse(fs.readFileSync('./data/capitals.json', 'utf8'));
const departments = JSON.parse(fs.readFileSync('./data/departments.json', 'utf8'));
const departmentsMap = JSON.parse(fs.readFileSync('./data/departments-map.json', 'utf8'));

// ============================================
// GESTION DES SALLES MULTIJOUEUR (en mémoire)
// ============================================

const rooms = new Map();

// Générer un code de salle unique
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
}

// Récupérer les questions pour les thèmes sélectionnés
function getQuestionsForThemes(themes, count) {
  let allQuestions = [];

  themes.forEach(theme => {
    let data;
    if (theme === 'capitals') data = capitals;
    else if (theme === 'departments') data = departments;
    else if (theme === 'departments-map') data = departmentsMap;

    if (data) {
      allQuestions = allQuestions.concat(data.map(q => ({ ...q, theme })));
    }
  });

  // Mélanger et prendre le nombre demandé
  const shuffled = allQuestions.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Normaliser une réponse pour la comparaison
function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calcul de la distance de Levenshtein
function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Vérifier si une réponse est correcte
function checkAnswer(userAnswer, correctAnswer) {
  const normalizedUser = normalize(userAnswer);
  const normalizedCorrect = normalize(correctAnswer);

  if (normalizedUser === normalizedCorrect) return true;

  const isNumeric = /^\d+$/.test(correctAnswer.trim());
  if (isNumeric) return false;

  const distance = levenshtein(normalizedUser, normalizedCorrect);
  const maxLength = Math.max(normalizedUser.length, normalizedCorrect.length);

  let tolerance;
  if (maxLength <= 4) tolerance = 1;
  else if (maxLength <= 8) tolerance = 2;
  else tolerance = Math.floor(maxLength * 0.2);

  return distance <= tolerance;
}

// Calculer les points avec bonus de rapidité
function calculatePoints(isCorrect, responseTimeMs, timeLimitMs) {
  if (!isCorrect) return 0;
  const basePoints = 100;
  const maxBonus = 50;
  const timeRatio = Math.min(responseTimeMs / timeLimitMs, 1);
  const speedBonus = Math.round(maxBonus * (1 - timeRatio));
  return basePoints + speedBonus;
}

// Obtenir le classement d'une salle
function getRankings(room) {
  const players = Array.from(room.players.values());
  return players
    .sort((a, b) => b.score - a.score)
    .map((p, index) => ({
      playerId: p.id,
      playerName: p.name,
      score: p.score,
      rank: index + 1
    }));
}

// ============================================
// ÉVÉNEMENTS SOCKET.IO
// ============================================

io.on('connection', (socket) => {
  console.log(`Joueur connecté: ${socket.id}`);

  // Créer une salle
  socket.on('createRoom', ({ hostName, settings }) => {
    const roomCode = generateRoomCode();

    const room = {
      code: roomCode,
      hostId: socket.id,
      status: 'waiting',
      settings: {
        themes: settings.themes || ['capitals'],
        questionCount: settings.questionCount || 10,
        timePerQuestion: 10
      },
      players: new Map(),
      game: {
        questions: [],
        currentIndex: 0,
        questionStartTime: null,
        answeredThisQuestion: new Set(),
        timer: null
      }
    };

    // Ajouter l'hôte comme premier joueur
    room.players.set(socket.id, {
      id: socket.id,
      name: hostName,
      score: 0,
      isHost: true,
      answers: []
    });

    rooms.set(roomCode, room);
    socket.join(roomCode);

    socket.emit('roomCreated', { roomCode });
    console.log(`Salle ${roomCode} créée par ${hostName}`);
  });

  // Rejoindre une salle
  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const room = rooms.get(roomCode.toUpperCase());

    if (!room) {
      socket.emit('error', { message: 'Salle introuvable' });
      return;
    }

    if (room.status !== 'waiting') {
      socket.emit('error', { message: 'La partie a déjà commencé' });
      return;
    }

    // Ajouter le joueur
    room.players.set(socket.id, {
      id: socket.id,
      name: playerName,
      score: 0,
      isHost: false,
      answers: []
    });

    socket.join(roomCode);

    // Envoyer la liste des joueurs à tout le monde
    const playersList = Array.from(room.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost
    }));

    io.to(roomCode).emit('playerJoined', {
      player: { id: socket.id, name: playerName, isHost: false },
      players: playersList
    });

    // Envoyer les paramètres de la salle au nouveau joueur
    socket.emit('roomJoined', {
      roomCode,
      settings: room.settings,
      players: playersList,
      isHost: false
    });

    console.log(`${playerName} a rejoint la salle ${roomCode}`);
  });

  // Mettre à jour les paramètres (hôte uniquement)
  socket.on('updateSettings', ({ roomCode, settings }) => {
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== socket.id) return;

    room.settings = { ...room.settings, ...settings };
    io.to(roomCode).emit('settingsUpdated', { settings: room.settings });
  });

  // Lancer la partie (hôte uniquement)
  socket.on('startGame', ({ roomCode }) => {
    const room = rooms.get(roomCode);

    if (!room || room.hostId !== socket.id) {
      socket.emit('error', { message: 'Seul l\'hôte peut lancer la partie' });
      return;
    }

    if (room.players.size < 2) {
      socket.emit('error', { message: 'Il faut au moins 2 joueurs' });
      return;
    }

    room.status = 'playing';
    room.game.questions = getQuestionsForThemes(room.settings.themes, room.settings.questionCount);
    room.game.currentIndex = 0;

    // Réinitialiser les scores
    room.players.forEach(player => {
      player.score = 0;
      player.answers = [];
    });

    console.log(`Partie lancée dans la salle ${roomCode}`);

    // Compte à rebours de 3 secondes
    io.to(roomCode).emit('gameStarting', { countdown: 3 });

    setTimeout(() => {
      sendNextQuestion(roomCode);
    }, 3000);
  });

  // Soumettre une réponse
  socket.on('submitAnswer', ({ roomCode, answer }) => {
    const room = rooms.get(roomCode);
    if (!room || room.status !== 'playing') return;

    const player = room.players.get(socket.id);
    if (!player) return;

    // Vérifier si le joueur a déjà répondu
    if (room.game.answeredThisQuestion.has(socket.id)) return;

    room.game.answeredThisQuestion.add(socket.id);

    const question = room.game.questions[room.game.currentIndex];
    const responseTime = Date.now() - room.game.questionStartTime;
    const isCorrect = checkAnswer(answer, question.answer);
    const points = calculatePoints(isCorrect, responseTime, room.settings.timePerQuestion * 1000);

    player.score += points;
    player.answers.push({
      questionIndex: room.game.currentIndex,
      question: question.question,
      userAnswer: answer,
      correctAnswer: question.answer,
      isCorrect,
      points,
      responseTime
    });

    // Envoyer le résultat au joueur
    socket.emit('answerResult', {
      isCorrect,
      points,
      totalScore: player.score,
      correctAnswer: question.answer
    });

    // Notifier les autres qu'un joueur a répondu
    io.to(roomCode).emit('playerAnswered', {
      playerId: socket.id,
      playerName: player.name,
      answeredCount: room.game.answeredThisQuestion.size,
      totalPlayers: room.players.size
    });

    // Si tout le monde a répondu, passer à la question suivante
    if (room.game.answeredThisQuestion.size >= room.players.size) {
      clearInterval(room.game.timer);
      setTimeout(() => endQuestion(roomCode), 500);
    }
  });

  // Quitter une salle
  socket.on('leaveRoom', ({ roomCode }) => {
    handlePlayerLeave(socket, roomCode);
  });

  // Déconnexion
  socket.on('disconnect', () => {
    console.log(`Joueur déconnecté: ${socket.id}`);

    // Chercher la salle du joueur
    rooms.forEach((room, roomCode) => {
      if (room.players.has(socket.id)) {
        handlePlayerLeave(socket, roomCode);
      }
    });
  });
});

// Gérer le départ d'un joueur
function handlePlayerLeave(socket, roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const player = room.players.get(socket.id);
  if (!player) return;

  room.players.delete(socket.id);
  socket.leave(roomCode);

  // Si plus aucun joueur, supprimer la salle
  if (room.players.size === 0) {
    if (room.game.timer) clearInterval(room.game.timer);
    rooms.delete(roomCode);
    console.log(`Salle ${roomCode} supprimée (vide)`);
    return;
  }

  // Si l'hôte part, transférer le rôle
  if (player.isHost) {
    const newHost = room.players.values().next().value;
    newHost.isHost = true;
    room.hostId = newHost.id;

    io.to(roomCode).emit('hostChanged', {
      newHostId: newHost.id,
      newHostName: newHost.name
    });
  }

  io.to(roomCode).emit('playerLeft', {
    playerId: socket.id,
    playerName: player.name,
    players: Array.from(room.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost
    }))
  });
}

// Envoyer la prochaine question
function sendNextQuestion(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'playing') return;

  const question = room.game.questions[room.game.currentIndex];
  room.game.questionStartTime = Date.now();
  room.game.answeredThisQuestion.clear();

  io.to(roomCode).emit('newQuestion', {
    index: room.game.currentIndex,
    total: room.game.questions.length,
    question: question.question,
    timeLimit: room.settings.timePerQuestion
  });

  // Timer de la question
  let timeLeft = room.settings.timePerQuestion;

  room.game.timer = setInterval(() => {
    timeLeft--;
    io.to(roomCode).emit('timerTick', { timeLeft });

    if (timeLeft <= 0) {
      clearInterval(room.game.timer);
      endQuestion(roomCode);
    }
  }, 1000);
}

// Terminer une question
function endQuestion(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const question = room.game.questions[room.game.currentIndex];

  // Marquer les joueurs qui n'ont pas répondu
  room.players.forEach((player, playerId) => {
    if (!room.game.answeredThisQuestion.has(playerId)) {
      player.answers.push({
        questionIndex: room.game.currentIndex,
        question: question.question,
        userAnswer: '(Pas de réponse)',
        correctAnswer: question.answer,
        isCorrect: false,
        points: 0,
        responseTime: room.settings.timePerQuestion * 1000
      });
    }
  });

  const rankings = getRankings(room);

  io.to(roomCode).emit('questionEnded', {
    correctAnswer: question.answer,
    rankings
  });

  // Passer à la question suivante ou terminer
  room.game.currentIndex++;

  if (room.game.currentIndex >= room.game.questions.length) {
    setTimeout(() => endGame(roomCode), 2000);
  } else {
    setTimeout(() => sendNextQuestion(roomCode), 2000);
  }
}

// Terminer la partie
function endGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  room.status = 'finished';

  const finalRankings = getRankings(room);

  // Collecter toutes les réponses pour l'hôte
  const allAnswers = {};
  room.players.forEach((player, playerId) => {
    allAnswers[playerId] = {
      playerName: player.name,
      answers: player.answers,
      totalScore: player.score
    };
  });

  io.to(roomCode).emit('gameEnded', {
    finalRankings,
    allAnswers
  });

  console.log(`Partie terminée dans la salle ${roomCode}`);

  // Nettoyer la salle après 5 minutes
  setTimeout(() => {
    if (rooms.has(roomCode)) {
      rooms.delete(roomCode);
      console.log(`Salle ${roomCode} nettoyée`);
    }
  }, 5 * 60 * 1000);
}

// ============================================
// ROUTES API EXISTANTES
// ============================================

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

app.get('/api/quiz/:theme', (req, res) => {
  const { theme } = req.params;
  const count = parseInt(req.query.count) || 10;

  let data;
  if (theme === 'capitals') data = capitals;
  else if (theme === 'departments') data = departments;
  else if (theme === 'departments-map') data = departmentsMap;
  else return res.status(400).json({ error: 'Thème inconnu' });

  const shuffled = [...data].sort(() => Math.random() - 0.5);
  const questions = shuffled.slice(0, count).map((item, index) => ({
    id: index + 1,
    question: item.question,
    answer: item.answer
  }));

  res.json(questions);
});

app.post('/api/check', (req, res) => {
  const { userAnswer, correctAnswer } = req.body;
  const isCorrect = checkAnswer(userAnswer, correctAnswer);
  res.json({ correct: isCorrect });
});

// API: Vérifier si une salle existe
app.get('/api/rooms/:code', (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) {
    return res.json({ exists: false });
  }
  res.json({
    exists: true,
    status: room.status,
    playerCount: room.players.size,
    settings: room.settings
  });
});

// ============================================
// DÉMARRAGE DU SERVEUR
// ============================================

server.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════╗
  ║   🎮 QuiQuiz - Serveur Multijoueur     ║
  ║                                        ║
  ║     http://localhost:${PORT}              ║
  ║                                        ║
  ║     Ctrl+C pour arrêter                ║
  ╚════════════════════════════════════════╝
  `);
});
