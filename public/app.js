// État de l'application
const state = {
    pseudo: '',
    selectedThemes: [],
    questions: [],
    currentIndex: 0,
    score: 0,
    timer: null,
    timeLeft: 10,
    answers: []
};

// Éléments DOM
const screens = {
    home: document.getElementById('home-screen'),
    theme: document.getElementById('theme-screen'),
    quiz: document.getElementById('quiz-screen'),
    result: document.getElementById('result-screen')
};

// Afficher un écran
function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    screens[screenName].classList.add('active');
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    setupHomeScreen();
    setupThemeScreen();
    setupQuizScreen();
    setupResultScreen();
});

// === ÉCRAN D'ACCUEIL ===
function setupHomeScreen() {
    const pseudoInput = document.getElementById('pseudo-input');
    const playBtn = document.getElementById('play-btn');

    pseudoInput.addEventListener('input', () => {
        const value = pseudoInput.value.trim();
        playBtn.disabled = value.length < 2;
    });

    // Entrée = valider
    pseudoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !playBtn.disabled) {
            playBtn.click();
        }
    });

    playBtn.addEventListener('click', () => {
        state.pseudo = pseudoInput.value.trim();
        document.getElementById('player-name').textContent = state.pseudo;
        loadThemes();
        showScreen('theme');
    });
}

// === ÉCRAN DES THÈMES ===
async function loadThemes() {
    const response = await fetch(`${CONFIG.API_URL}/api/themes`);
    const themes = await response.json();
    const container = document.getElementById('themes-list');

    container.innerHTML = themes.map(theme => `
        <div class="theme-card" data-theme="${theme.id}">
            <div class="checkbox"></div>
            <h4>${theme.name}</h4>
            <span>${theme.count} questions disponibles</span>
        </div>
    `).join('');

    // Gestion de la sélection multiple
    const startBtn = document.getElementById('start-quiz-btn');
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

            // Activer/désactiver le bouton selon la sélection
            startBtn.disabled = state.selectedThemes.length === 0;
        });
    });
}

function setupThemeScreen() {
    document.getElementById('back-home').addEventListener('click', () => {
        showScreen('home');
    });

    // Bouton pour démarrer le quiz
    document.getElementById('start-quiz-btn').addEventListener('click', () => {
        if (state.selectedThemes.length > 0) {
            startQuiz();
        }
    });
}

// === ÉCRAN DU QUIZ ===
async function startQuiz() {
    if (state.selectedThemes.length === 0) return;

    const count = parseInt(document.getElementById('question-count').value);

    // Récupérer les questions de tous les thèmes sélectionnés
    let allQuestions = [];
    for (const theme of state.selectedThemes) {
        const response = await fetch(`${CONFIG.API_URL}/api/quiz/${theme}?count=50`);
        const questions = await response.json();
        allQuestions = allQuestions.concat(questions);
    }

    // Mélanger toutes les questions
    allQuestions.sort(() => Math.random() - 0.5);

    // Prendre le nombre demandé
    state.questions = allQuestions.slice(0, count);
    state.currentIndex = 0;
    state.score = 0;
    state.answers = [];

    document.getElementById('total-questions').textContent = state.questions.length;
    document.getElementById('score').textContent = '0';

    showScreen('quiz');
    showQuestion();
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
            submitAnswer(true); // Temps écoulé
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
        // Vérifier la réponse
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

    // Sauvegarder la réponse
    state.answers.push({
        question: question.question,
        userAnswer: userAnswer || '(Pas de réponse)',
        correctAnswer: question.answer,
        isCorrect: isCorrect
    });

    // Afficher le feedback
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

    // Question suivante après 1.5s
    setTimeout(() => {
        state.currentIndex++;
        if (state.currentIndex < state.questions.length) {
            showQuestion();
        } else {
            showResults();
        }
    }, 1500);
}

// === ÉCRAN DES RÉSULTATS ===
function showResults() {
    const total = state.questions.length;
    const score = state.score;
    const percentage = Math.round((score / total) * 100);

    document.getElementById('final-score').textContent = score;
    document.getElementById('final-total').textContent = total;

    // Message selon le score
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

    // Récap des réponses
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
