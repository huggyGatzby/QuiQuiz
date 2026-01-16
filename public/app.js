// État de l'application
const state = {
    pseudo: '',
    selectedThemes: [],
    questions: [],
    currentIndex: 0,
    score: 0,
    timer: null,
    timeLeft: 10,
    answers: [],
    isMapMode: false,
    // Multijoueur
    isMultiplayer: false,
    socket: null,
    roomCode: null,
    isHost: false,
    playerId: null,
    players: [],
    multiScore: 0,
    multiRank: 1,
    allAnswers: null,
    hasAnswered: false
};

// Éléments DOM
const screens = {
    home: document.getElementById('home-screen'),
    mode: document.getElementById('mode-screen'),
    multiMenu: document.getElementById('multi-menu-screen'),
    lobby: document.getElementById('lobby-screen'),
    theme: document.getElementById('theme-screen'),
    quiz: document.getElementById('quiz-screen'),
    mapQuiz: document.getElementById('map-quiz-screen'),
    multiQuiz: document.getElementById('multi-quiz-screen'),
    result: document.getElementById('result-screen'),
    multiResult: document.getElementById('multi-result-screen'),
    countdown: document.getElementById('countdown-screen')
};

// Afficher un écran
function showScreen(screenName) {
    Object.values(screens).forEach(screen => {
        if (screen) screen.classList.remove('active');
    });
    if (screens[screenName]) {
        screens[screenName].classList.add('active');
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    setupHomeScreen();
    setupModeScreen();
    setupMultiMenuScreen();
    setupLobbyScreen();
    setupThemeScreen();
    setupQuizScreen();
    setupMapQuizScreen();
    setupResultScreen();
    setupMultiQuizScreen();
    setupMultiResultScreen();
});

// === ÉCRAN D'ACCUEIL ===
function setupHomeScreen() {
    const pseudoInput = document.getElementById('pseudo-input');
    const playBtn = document.getElementById('play-btn');

    pseudoInput.addEventListener('input', () => {
        const value = pseudoInput.value.trim();
        playBtn.disabled = value.length < 2;
    });

    pseudoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !playBtn.disabled) {
            playBtn.click();
        }
    });

    playBtn.addEventListener('click', () => {
        state.pseudo = pseudoInput.value.trim();
        document.getElementById('mode-player-name').textContent = state.pseudo;
        document.getElementById('player-name').textContent = state.pseudo;
        showScreen('mode');
    });
}

// === ÉCRAN CHOIX DE MODE ===
function setupModeScreen() {
    document.getElementById('solo-mode-btn').addEventListener('click', () => {
        state.isMultiplayer = false;
        loadThemes();
        showScreen('theme');
    });

    document.getElementById('multi-mode-btn').addEventListener('click', () => {
        state.isMultiplayer = true;
        initializeSocket();
        showScreen('multiMenu');
    });

    document.getElementById('back-to-home').addEventListener('click', () => {
        showScreen('home');
    });
}

// === ÉCRAN MENU MULTIJOUEUR ===
function setupMultiMenuScreen() {
    const roomCodeInput = document.getElementById('room-code-input');
    const joinBtn = document.getElementById('join-room-btn');

    roomCodeInput.addEventListener('input', () => {
        const value = roomCodeInput.value.trim().toUpperCase();
        roomCodeInput.value = value;
        joinBtn.disabled = value.length !== 6;
    });

    roomCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !joinBtn.disabled) {
            joinBtn.click();
        }
    });

    document.getElementById('create-room-btn').addEventListener('click', () => {
        createRoom();
    });

    joinBtn.addEventListener('click', () => {
        const code = roomCodeInput.value.trim().toUpperCase();
        joinRoom(code);
    });

    document.getElementById('back-to-mode').addEventListener('click', () => {
        if (state.socket) {
            state.socket.disconnect();
            state.socket = null;
        }
        showScreen('mode');
    });
}

// === INITIALISATION SOCKET.IO ===
function initializeSocket() {
    if (state.socket && state.socket.connected) return;

    state.socket = io(CONFIG.API_URL || window.location.origin);

    state.socket.on('connect', () => {
        state.playerId = state.socket.id;
        console.log('Connecté au serveur Socket.IO');
    });

    // Événements de salle
    state.socket.on('roomCreated', handleRoomCreated);
    state.socket.on('roomJoined', handleRoomJoined);
    state.socket.on('playerJoined', handlePlayerJoined);
    state.socket.on('playerLeft', handlePlayerLeft);
    state.socket.on('hostChanged', handleHostChanged);
    state.socket.on('settingsUpdated', handleSettingsUpdated);
    state.socket.on('error', handleSocketError);

    // Événements de jeu
    state.socket.on('gameStarting', handleGameStarting);
    state.socket.on('newQuestion', handleNewQuestion);
    state.socket.on('timerTick', handleTimerTick);
    state.socket.on('answerResult', handleAnswerResult);
    state.socket.on('playerAnswered', handlePlayerAnswered);
    state.socket.on('questionEnded', handleQuestionEnded);
    state.socket.on('gameEnded', handleGameEnded);

    state.socket.on('disconnect', () => {
        console.log('Déconnecté du serveur');
    });
}

// === GESTION DES SALLES ===
function createRoom() {
    state.socket.emit('createRoom', {
        hostName: state.pseudo,
        settings: {
            themes: ['capitals'],
            questionCount: 10
        }
    });
}

function joinRoom(code) {
    state.socket.emit('joinRoom', {
        roomCode: code,
        playerName: state.pseudo
    });
}

function handleRoomCreated({ roomCode }) {
    state.roomCode = roomCode;
    state.isHost = true;
    document.getElementById('display-room-code').textContent = roomCode;

    // Afficher les paramètres pour l'hôte
    document.getElementById('lobby-settings').style.display = 'block';
    document.getElementById('lobby-settings-readonly').style.display = 'none';
    document.getElementById('start-multi-game-btn').style.display = 'block';

    loadLobbyThemes();
    updatePlayersList([{ id: state.playerId, name: state.pseudo, isHost: true }]);
    showScreen('lobby');
}

function handleRoomJoined({ roomCode, settings, players, isHost }) {
    state.roomCode = roomCode;
    state.isHost = isHost;
    document.getElementById('display-room-code').textContent = roomCode;

    // Masquer les paramètres pour les non-hôtes
    document.getElementById('lobby-settings').style.display = isHost ? 'block' : 'none';
    document.getElementById('lobby-settings-readonly').style.display = isHost ? 'none' : 'block';
    document.getElementById('start-multi-game-btn').style.display = isHost ? 'block' : 'none';

    // Afficher les paramètres en lecture seule
    const themeNames = settings.themes.map(t => {
        if (t === 'capitals') return 'Capitales';
        if (t === 'departments') return 'Départements';
        if (t === 'departments-map') return 'Carte';
        return t;
    }).join(', ');
    document.getElementById('readonly-themes').textContent = `Thèmes : ${themeNames}`;
    document.getElementById('readonly-questions').textContent = `Questions : ${settings.questionCount}`;

    if (isHost) loadLobbyThemes();
    updatePlayersList(players);
    showScreen('lobby');
}

function handlePlayerJoined({ player, players }) {
    updatePlayersList(players);
    updateStartButton();
}

function handlePlayerLeft({ playerId, playerName, players }) {
    updatePlayersList(players);
    updateStartButton();
}

function handleHostChanged({ newHostId, newHostName }) {
    state.isHost = (newHostId === state.playerId);

    document.getElementById('lobby-settings').style.display = state.isHost ? 'block' : 'none';
    document.getElementById('lobby-settings-readonly').style.display = state.isHost ? 'none' : 'block';
    document.getElementById('start-multi-game-btn').style.display = state.isHost ? 'block' : 'none';

    if (state.isHost) {
        loadLobbyThemes();
    }
}

function handleSettingsUpdated({ settings }) {
    const themeNames = settings.themes.map(t => {
        if (t === 'capitals') return 'Capitales';
        if (t === 'departments') return 'Départements';
        if (t === 'departments-map') return 'Carte';
        return t;
    }).join(', ');
    document.getElementById('readonly-themes').textContent = `Thèmes : ${themeNames}`;
    document.getElementById('readonly-questions').textContent = `Questions : ${settings.questionCount}`;
}

function handleSocketError({ message }) {
    alert(message);
}

// === ÉCRAN LOBBY ===
function setupLobbyScreen() {
    document.getElementById('copy-code-btn').addEventListener('click', () => {
        const code = document.getElementById('display-room-code').textContent;
        navigator.clipboard.writeText(code).then(() => {
            const btn = document.getElementById('copy-code-btn');
            btn.textContent = 'Copié !';
            setTimeout(() => btn.textContent = 'Copier', 2000);
        });
    });

    document.getElementById('start-multi-game-btn').addEventListener('click', () => {
        if (state.isHost && state.players.length >= 2) {
            // Envoyer les paramètres mis à jour
            const selectedThemes = getLobbySelectedThemes();
            const questionCount = parseInt(document.getElementById('lobby-question-count').value);

            state.socket.emit('updateSettings', {
                roomCode: state.roomCode,
                settings: { themes: selectedThemes, questionCount }
            });

            state.socket.emit('startGame', { roomCode: state.roomCode });
        }
    });

    document.getElementById('leave-room-btn').addEventListener('click', () => {
        state.socket.emit('leaveRoom', { roomCode: state.roomCode });
        state.roomCode = null;
        state.isHost = false;
        state.players = [];
        showScreen('multiMenu');
    });
}

async function loadLobbyThemes() {
    const response = await fetch(`${CONFIG.API_URL}/api/themes`);
    const categories = await response.json();
    const container = document.getElementById('lobby-themes-list');

    // Version simplifiée pour le lobby
    let themesHtml = '';
    categories.forEach(cat => {
        cat.themes.forEach(theme => {
            // Ne pas inclure la carte en multijoueur
            if (theme.isMap) return;
            themesHtml += `
                <div class="theme-card selected" data-theme="${theme.id}">
                    <div class="checkbox"></div>
                    <h4>${theme.name}</h4>
                </div>
            `;
        });
    });
    container.innerHTML = themesHtml;

    // Gestion de la sélection
    container.querySelectorAll('.theme-card').forEach(card => {
        card.addEventListener('click', () => {
            card.classList.toggle('selected');

            // S'assurer qu'au moins un thème est sélectionné
            const selected = container.querySelectorAll('.theme-card.selected');
            if (selected.length === 0) {
                card.classList.add('selected');
            }
        });
    });
}

function getLobbySelectedThemes() {
    const container = document.getElementById('lobby-themes-list');
    const selected = container.querySelectorAll('.theme-card.selected');
    return Array.from(selected).map(card => card.dataset.theme);
}

function updatePlayersList(players) {
    state.players = players;
    const list = document.getElementById('players-list');
    document.getElementById('player-count').textContent = players.length;

    list.innerHTML = players.map(p => `
        <li class="player-item ${p.isHost ? 'host' : ''}">
            <span class="player-name">${p.name}</span>
            ${p.isHost ? '<span class="host-badge">Hôte</span>' : ''}
        </li>
    `).join('');

    updateStartButton();
}

function updateStartButton() {
    const btn = document.getElementById('start-multi-game-btn');
    btn.disabled = !state.isHost || state.players.length < 2;
    btn.textContent = state.players.length < 2
        ? 'En attente de joueurs...'
        : 'Lancer la partie';
}

// === ÉVÉNEMENTS DE JEU ===
function handleGameStarting({ countdown }) {
    showScreen('countdown');
    let count = countdown;
    document.getElementById('countdown-number').textContent = count;

    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            document.getElementById('countdown-number').textContent = count;
        } else {
            clearInterval(interval);
        }
    }, 1000);
}

function handleNewQuestion({ index, total, question, timeLimit }) {
    state.currentIndex = index;
    state.hasAnswered = false;

    document.getElementById('multi-current-question').textContent = index + 1;
    document.getElementById('multi-total-questions').textContent = total;
    document.getElementById('multi-question-text').textContent = question;
    document.getElementById('multi-answer-input').value = '';
    document.getElementById('multi-answer-input').disabled = false;
    document.getElementById('multi-submit-answer').disabled = false;
    document.getElementById('multi-feedback').className = 'feedback';
    document.getElementById('answered-count').textContent = '0';
    document.getElementById('total-players').textContent = state.players.length;

    showScreen('multiQuiz');
    document.getElementById('multi-answer-input').focus();
}

function handleTimerTick({ timeLeft }) {
    const timerEl = document.getElementById('multi-timer');
    timerEl.textContent = timeLeft;

    timerEl.classList.remove('warning', 'danger');
    if (timeLeft <= 3) {
        timerEl.classList.add('danger');
    } else if (timeLeft <= 5) {
        timerEl.classList.add('warning');
    }
}

function handleAnswerResult({ isCorrect, points, totalScore, correctAnswer }) {
    state.multiScore = totalScore;
    document.getElementById('multi-score').textContent = totalScore;

    const feedback = document.getElementById('multi-feedback');
    if (isCorrect) {
        feedback.textContent = `Correct ! +${points} points`;
        feedback.className = 'feedback correct';
    } else {
        feedback.textContent = `Incorrect ! La réponse était : ${correctAnswer}`;
        feedback.className = 'feedback incorrect';
    }
}

function handlePlayerAnswered({ playerId, playerName, answeredCount, totalPlayers }) {
    document.getElementById('answered-count').textContent = answeredCount;
    document.getElementById('total-players').textContent = totalPlayers;
}

function handleQuestionEnded({ correctAnswer, rankings }) {
    // Mettre à jour le classement
    updateLiveRankings(rankings);

    // Trouver notre rang
    const myRank = rankings.find(r => r.playerId === state.playerId);
    if (myRank) {
        state.multiRank = myRank.rank;
        document.getElementById('multi-rank').textContent = myRank.rank;
    }
}

function handleGameEnded({ finalRankings, allAnswers }) {
    state.allAnswers = allAnswers;

    // Afficher le podium
    displayPodium(finalRankings);

    // Afficher le classement complet
    displayFullRankings(finalRankings);

    // Afficher le détail des réponses pour l'hôte
    if (state.isHost) {
        document.getElementById('host-details-section').style.display = 'block';
        populateAnswersTable(allAnswers);
    } else {
        document.getElementById('host-details-section').style.display = 'none';
    }

    showScreen('multiResult');
}

// === ÉCRAN QUIZ MULTIJOUEUR ===
function setupMultiQuizScreen() {
    const submitBtn = document.getElementById('multi-submit-answer');
    const answerInput = document.getElementById('multi-answer-input');

    submitBtn.addEventListener('click', () => submitMultiAnswer());

    answerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !state.hasAnswered) {
            submitMultiAnswer();
        }
    });
}

function submitMultiAnswer() {
    if (state.hasAnswered) return;

    const answer = document.getElementById('multi-answer-input').value.trim();
    if (!answer) return;

    state.hasAnswered = true;
    document.getElementById('multi-answer-input').disabled = true;
    document.getElementById('multi-submit-answer').disabled = true;

    state.socket.emit('submitAnswer', {
        roomCode: state.roomCode,
        answer: answer
    });
}

function updateLiveRankings(rankings) {
    const list = document.getElementById('live-rankings-list');
    list.innerHTML = rankings.slice(0, 5).map(r => `
        <li class="${r.playerId === state.playerId ? 'current-player' : ''}">
            <span class="player-rank">${r.rank}.</span>
            <span class="player-name">${r.playerName}</span>
            <span class="player-score">${r.score}</span>
        </li>
    `).join('');
}

// === ÉCRAN RÉSULTATS MULTIJOUEUR ===
function setupMultiResultScreen() {
    document.getElementById('multi-replay-btn').addEventListener('click', () => {
        // Retourner au lobby
        state.multiScore = 0;
        state.multiRank = 1;
        state.allAnswers = null;
        showScreen('lobby');
    });

    document.getElementById('multi-back-menu-btn').addEventListener('click', () => {
        state.socket.emit('leaveRoom', { roomCode: state.roomCode });
        state.roomCode = null;
        state.isHost = false;
        state.players = [];
        state.multiScore = 0;
        state.multiRank = 1;
        state.allAnswers = null;
        showScreen('mode');
    });

    // Filtre des réponses par joueur
    document.getElementById('player-filter-select').addEventListener('change', (e) => {
        filterAnswersTable(e.target.value);
    });
}

function displayPodium(rankings) {
    const places = [
        { element: document.getElementById('podium-1'), rank: 1 },
        { element: document.getElementById('podium-2'), rank: 2 },
        { element: document.getElementById('podium-3'), rank: 3 }
    ];

    places.forEach(({ element, rank }) => {
        const player = rankings.find(r => r.rank === rank);
        if (player) {
            element.querySelector('.podium-name').textContent = player.playerName;
            element.querySelector('.podium-score').textContent = player.score;
            element.style.display = 'block';
        } else {
            element.style.display = 'none';
        }
    });
}

function displayFullRankings(rankings) {
    const list = document.getElementById('full-rankings-list');
    list.innerHTML = rankings.map(r => `
        <li class="${r.playerId === state.playerId ? 'current-player' : ''}">
            <span>${r.rank}. ${r.playerName}</span>
            <span>${r.score} pts</span>
        </li>
    `).join('');
}

function populateAnswersTable(allAnswers) {
    const select = document.getElementById('player-filter-select');
    const tbody = document.getElementById('answers-table-body');

    // Remplir le select avec les joueurs
    select.innerHTML = '<option value="all">Tous les joueurs</option>';
    Object.entries(allAnswers).forEach(([playerId, data]) => {
        select.innerHTML += `<option value="${playerId}">${data.playerName}</option>`;
    });

    // Remplir le tableau
    let rows = '';
    Object.entries(allAnswers).forEach(([playerId, data]) => {
        data.answers.forEach((answer, idx) => {
            rows += `
                <tr class="${answer.isCorrect ? 'correct' : 'incorrect'}" data-player="${playerId}">
                    <td>${idx + 1}</td>
                    <td>${data.playerName}</td>
                    <td>${answer.userAnswer}</td>
                    <td>${answer.isCorrect ? '✓' : '✗'} ${answer.correctAnswer}</td>
                    <td>${answer.points}</td>
                </tr>
            `;
        });
    });
    tbody.innerHTML = rows;
}

function filterAnswersTable(playerId) {
    const rows = document.querySelectorAll('#answers-table-body tr');
    rows.forEach(row => {
        if (playerId === 'all' || row.dataset.player === playerId) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// === ÉCRAN DES THÈMES (SOLO) ===
async function loadThemes() {
    const response = await fetch(`${CONFIG.API_URL}/api/themes`);
    const categories = await response.json();
    const container = document.getElementById('themes-list');

    container.innerHTML = categories.map(cat => `
        <div class="category" data-category="${cat.category}">
            <div class="category-header">
                <div class="category-checkbox"></div>
                <span class="category-icon">${cat.icon}</span>
                <h4>${cat.category}</h4>
                <span class="category-toggle">▼</span>
            </div>
            <div class="category-themes">
                ${cat.themes.map(theme => `
                    <div class="theme-card" data-theme="${theme.id}" ${theme.isMap ? 'data-is-map="true"' : ''}>
                        <div class="checkbox"></div>
                        <h4>${theme.name}</h4>
                        <span>${theme.count} questions</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');

    const startBtn = document.getElementById('start-quiz-btn');

    container.querySelectorAll('.category-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.classList.contains('category-checkbox')) return;
            const category = header.parentElement;
            category.classList.toggle('expanded');
        });
    });

    container.querySelectorAll('.category-checkbox').forEach(checkbox => {
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            const category = checkbox.closest('.category');
            const themeCards = category.querySelectorAll('.theme-card');
            const allSelected = Array.from(themeCards).every(card => card.classList.contains('selected'));

            themeCards.forEach(card => {
                const theme = card.dataset.theme;
                if (allSelected) {
                    card.classList.remove('selected');
                    state.selectedThemes = state.selectedThemes.filter(t => t !== theme);
                } else {
                    card.classList.add('selected');
                    if (!state.selectedThemes.includes(theme)) {
                        state.selectedThemes.push(theme);
                    }
                }
            });

            updateCategoryCheckbox(category);
            startBtn.disabled = state.selectedThemes.length === 0;
        });
    });

    container.querySelectorAll('.theme-card').forEach(card => {
        card.addEventListener('click', () => {
            card.classList.toggle('selected');
            const theme = card.dataset.theme;

            if (card.classList.contains('selected')) {
                if (!state.selectedThemes.includes(theme)) {
                    state.selectedThemes.push(theme);
                }
            } else {
                state.selectedThemes = state.selectedThemes.filter(t => t !== theme);
            }

            const category = card.closest('.category');
            updateCategoryCheckbox(category);

            startBtn.disabled = state.selectedThemes.length === 0;
        });
    });

    const firstCategory = container.querySelector('.category');
    if (firstCategory) {
        firstCategory.classList.add('expanded');
    }
}

function updateCategoryCheckbox(category) {
    const themeCards = category.querySelectorAll('.theme-card');
    const selectedCount = category.querySelectorAll('.theme-card.selected').length;
    const checkbox = category.querySelector('.category-checkbox');

    checkbox.classList.remove('checked', 'partial');
    if (selectedCount === themeCards.length) {
        checkbox.classList.add('checked');
    } else if (selectedCount > 0) {
        checkbox.classList.add('partial');
    }
}

function setupThemeScreen() {
    document.getElementById('back-home').addEventListener('click', () => {
        showScreen('mode');
    });

    document.getElementById('start-quiz-btn').addEventListener('click', () => {
        if (state.selectedThemes.length > 0) {
            startQuiz();
        }
    });
}

// === ÉCRAN DU QUIZ (SOLO) ===
async function startQuiz() {
    if (state.selectedThemes.length === 0) return;

    const count = parseInt(document.getElementById('question-count').value);
    state.isMapMode = state.selectedThemes.includes('departments-map');

    let allQuestions = [];
    for (const theme of state.selectedThemes) {
        const response = await fetch(`${CONFIG.API_URL}/api/quiz/${theme}?count=50`);
        const questions = await response.json();
        allQuestions = allQuestions.concat(questions);
    }

    allQuestions.sort(() => Math.random() - 0.5);
    state.questions = allQuestions.slice(0, count);
    state.currentIndex = 0;
    state.score = 0;
    state.answers = [];

    if (state.isMapMode && state.selectedThemes.length === 1) {
        document.getElementById('map-total-questions').textContent = state.questions.length;
        document.getElementById('map-score').textContent = '0';
        showScreen('mapQuiz');
        loadMap().then(() => showMapQuestion());
    } else {
        document.getElementById('total-questions').textContent = state.questions.length;
        document.getElementById('score').textContent = '0';
        showScreen('quiz');
        showQuestion();
    }
}

function showQuestion() {
    const question = state.questions[state.currentIndex];

    document.getElementById('current-question').textContent = state.currentIndex + 1;
    document.getElementById('question-text').textContent = question.question;
    document.getElementById('answer-input').value = '';
    document.getElementById('answer-input').focus();
    document.getElementById('feedback').className = 'feedback';
    document.getElementById('submit-answer').disabled = false;

    startTimer();
}

function startTimer() {
    state.timeLeft = 10;
    updateTimerDisplay();

    state.timer = setInterval(() => {
        state.timeLeft--;
        updateTimerDisplay();

        if (state.timeLeft <= 0) {
            clearInterval(state.timer);
            submitAnswer(true);
        }
    }, 1000);
}

function updateTimerDisplay() {
    const timerEl = document.getElementById('timer');
    timerEl.textContent = state.timeLeft;

    timerEl.classList.remove('warning', 'danger');
    if (state.timeLeft <= 3) {
        timerEl.classList.add('danger');
    } else if (state.timeLeft <= 5) {
        timerEl.classList.add('warning');
    }
}

function setupQuizScreen() {
    const submitBtn = document.getElementById('submit-answer');
    const answerInput = document.getElementById('answer-input');

    submitBtn.addEventListener('click', () => submitAnswer(false));

    answerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            submitAnswer(false);
        }
    });
}

async function submitAnswer(timeUp) {
    clearInterval(state.timer);
    document.getElementById('submit-answer').disabled = true;

    const question = state.questions[state.currentIndex];
    const userAnswer = document.getElementById('answer-input').value.trim();
    const feedback = document.getElementById('feedback');

    let isCorrect = false;

    if (!timeUp && userAnswer) {
        const response = await fetch(`${CONFIG.API_URL}/api/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userAnswer: userAnswer,
                correctAnswer: question.answer
            })
        });
        const result = await response.json();
        isCorrect = result.correct;
    }

    state.answers.push({
        question: question.question,
        userAnswer: userAnswer || '(Pas de réponse)',
        correctAnswer: question.answer,
        isCorrect: isCorrect
    });

    if (isCorrect) {
        state.score++;
        document.getElementById('score').textContent = state.score;
        feedback.textContent = 'Correct !';
        feedback.className = 'feedback correct';
    } else {
        feedback.textContent = timeUp
            ? `Temps écoulé ! La réponse était : ${question.answer}`
            : `Incorrect ! La réponse était : ${question.answer}`;
        feedback.className = 'feedback incorrect';
    }

    setTimeout(() => {
        state.currentIndex++;
        if (state.currentIndex < state.questions.length) {
            showQuestion();
        } else {
            showResults();
        }
    }, 1500);
}

// === ÉCRAN DES RÉSULTATS (SOLO) ===
function showResults() {
    const total = state.questions.length;
    const score = state.score;
    const percentage = Math.round((score / total) * 100);

    document.getElementById('final-score').textContent = score;
    document.getElementById('final-total').textContent = total;

    let message = '';
    if (percentage === 100) {
        message = 'Parfait ! Vous êtes un expert !';
    } else if (percentage >= 80) {
        message = 'Excellent ! Très bonne performance !';
    } else if (percentage >= 60) {
        message = 'Bien joué ! Continuez comme ça !';
    } else if (percentage >= 40) {
        message = 'Pas mal ! Vous pouvez faire mieux !';
    } else {
        message = 'Continuez à vous entraîner !';
    }
    document.getElementById('result-message').textContent = message;

    const recap = document.getElementById('answers-recap');
    recap.innerHTML = state.answers.map(a => `
        <div class="recap-item ${a.isCorrect ? 'correct' : 'incorrect'}">
            <span class="icon">${a.isCorrect ? '✓' : '✗'}</span>
            <span class="question">${a.question}</span>
            <span class="answer">${a.isCorrect ? a.userAnswer : a.correctAnswer}</span>
        </div>
    `).join('');

    showScreen('result');
}

function setupResultScreen() {
    document.getElementById('replay-btn').addEventListener('click', () => {
        startQuiz();
    });

    document.getElementById('change-theme-btn').addEventListener('click', () => {
        state.selectedThemes = [];
        document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('selected'));
        document.getElementById('start-quiz-btn').disabled = true;
        showScreen('theme');
    });
}

// === ÉCRAN DU QUIZ CARTE ===
async function loadMap() {
    const response = await fetch('france-departments.svg');
    const svgText = await response.text();
    document.getElementById('map-container').innerHTML = svgText;
}

function setupMapQuizScreen() {
    // Le click listener sera ajouté dynamiquement après le chargement de la carte
}

function showMapQuestion() {
    const question = state.questions[state.currentIndex];

    document.getElementById('map-current-question').textContent = state.currentIndex + 1;
    document.getElementById('map-question-text').textContent = question.question;
    document.getElementById('map-feedback').className = 'feedback';

    document.querySelectorAll('#map-container .departement').forEach(dept => {
        dept.classList.remove('correct', 'incorrect', 'highlight');
    });

    document.querySelectorAll('#map-container .departement').forEach(dept => {
        const deptNum = dept.getAttribute('data-numerodepartement');
        dept.onclick = () => handleMapClick(deptNum);
    });

    startMapTimer();
}

function startMapTimer() {
    state.timeLeft = 10;
    updateMapTimerDisplay();

    state.timer = setInterval(() => {
        state.timeLeft--;
        updateMapTimerDisplay();

        if (state.timeLeft <= 0) {
            clearInterval(state.timer);
            submitMapAnswer(null, true);
        }
    }, 1000);
}

function updateMapTimerDisplay() {
    const timerEl = document.getElementById('map-timer');
    timerEl.textContent = state.timeLeft;

    timerEl.classList.remove('warning', 'danger');
    if (state.timeLeft <= 3) {
        timerEl.classList.add('danger');
    } else if (state.timeLeft <= 5) {
        timerEl.classList.add('warning');
    }
}

function handleMapClick(departmentId) {
    clearInterval(state.timer);

    document.querySelectorAll('#map-container .departement').forEach(dept => {
        dept.onclick = null;
    });

    submitMapAnswer(departmentId, false);
}

function submitMapAnswer(clickedId, timeUp) {
    const question = state.questions[state.currentIndex];
    const correctId = question.answer;
    const feedback = document.getElementById('map-feedback');

    const isCorrect = clickedId === correctId;

    let clickedName = '(Pas de réponse)';
    if (clickedId) {
        const clickedDept = document.querySelector(`#map-container [data-numerodepartement="${clickedId}"]`);
        if (clickedDept) {
            clickedName = clickedDept.getAttribute('data-nom') || clickedId;
        }
    }

    const correctDept = document.querySelector(`#map-container [data-numerodepartement="${correctId}"]`);
    const correctName = correctDept ? correctDept.getAttribute('data-nom') : correctId;

    state.answers.push({
        question: question.question,
        userAnswer: clickedName,
        correctAnswer: correctName,
        isCorrect: isCorrect
    });

    if (clickedId && !isCorrect) {
        const clickedDept = document.querySelector(`#map-container [data-numerodepartement="${clickedId}"]`);
        if (clickedDept) {
            clickedDept.classList.add('incorrect');
        }
    }

    if (correctDept) {
        correctDept.classList.add('correct');
    }

    if (isCorrect) {
        state.score++;
        document.getElementById('map-score').textContent = state.score;
        feedback.textContent = `Correct ! C'est bien ${correctName}`;
        feedback.className = 'feedback correct';
    } else {
        feedback.textContent = timeUp
            ? `Temps écoulé ! C'était ${correctName}`
            : `Incorrect ! C'était ${correctName}`;
        feedback.className = 'feedback incorrect';
    }

    setTimeout(() => {
        state.currentIndex++;
        if (state.currentIndex < state.questions.length) {
            showMapQuestion();
        } else {
            showResults();
        }
    }, 1500);
}
