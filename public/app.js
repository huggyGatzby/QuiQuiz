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
    isMapMode: false
};

// Éléments DOM
const screens = {
    home: document.getElementById('home-screen'),
    theme: document.getElementById('theme-screen'),
    quiz: document.getElementById('quiz-screen'),
    mapQuiz: document.getElementById('map-quiz-screen'),
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
    setupMapQuizScreen();
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

    // Gestion du clic sur les catégories (déplier/replier)
    container.querySelectorAll('.category-header').forEach(header => {
        header.addEventListener('click', (e) => {
            // Si on clique sur la checkbox de catégorie, ne pas toggle l'ouverture
            if (e.target.classList.contains('category-checkbox')) return;

            const category = header.parentElement;
            category.classList.toggle('expanded');
        });
    });

    // Gestion du clic sur la checkbox de catégorie (tout sélectionner)
    container.querySelectorAll('.category-checkbox').forEach(checkbox => {
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            const category = checkbox.closest('.category');
            const themeCards = category.querySelectorAll('.theme-card');
            const allSelected = Array.from(themeCards).every(card => card.classList.contains('selected'));

            themeCards.forEach(card => {
                const theme = card.dataset.theme;
                if (allSelected) {
                    // Tout désélectionner
                    card.classList.remove('selected');
                    state.selectedThemes = state.selectedThemes.filter(t => t !== theme);
                } else {
                    // Tout sélectionner
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

    // Gestion de la sélection des thèmes individuels
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

            // Mettre à jour la checkbox de catégorie
            const category = card.closest('.category');
            updateCategoryCheckbox(category);

            startBtn.disabled = state.selectedThemes.length === 0;
        });
    });

    // Ouvrir la première catégorie par défaut
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

    // Vérifier si on est en mode carte
    state.isMapMode = state.selectedThemes.includes('departments-map');

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

    if (state.isMapMode && state.selectedThemes.length === 1) {
        // Mode carte uniquement
        document.getElementById('map-total-questions').textContent = state.questions.length;
        document.getElementById('map-score').textContent = '0';
        showScreen('mapQuiz');
        loadMap().then(() => showMapQuestion());
    } else {
        // Mode texte classique
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

    // Réinitialiser tous les départements
    document.querySelectorAll('#map-container .departement').forEach(dept => {
        dept.classList.remove('correct', 'incorrect', 'highlight');
    });

    // Ajouter les listeners de clic
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
            submitMapAnswer(null, true); // Temps écoulé
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

    // Désactiver les clics pendant le feedback
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

    // Récupérer le nom du département cliqué
    let clickedName = '(Pas de réponse)';
    if (clickedId) {
        const clickedDept = document.querySelector(`#map-container [data-numerodepartement="${clickedId}"]`);
        if (clickedDept) {
            clickedName = clickedDept.getAttribute('data-nom') || clickedId;
        }
    }

    // Récupérer le nom du département correct
    const correctDept = document.querySelector(`#map-container [data-numerodepartement="${correctId}"]`);
    const correctName = correctDept ? correctDept.getAttribute('data-nom') : correctId;

    // Sauvegarder la réponse
    state.answers.push({
        question: question.question,
        userAnswer: clickedName,
        correctAnswer: correctName,
        isCorrect: isCorrect
    });

    // Afficher le feedback visuel sur la carte
    if (clickedId && !isCorrect) {
        const clickedDept = document.querySelector(`#map-container [data-numerodepartement="${clickedId}"]`);
        if (clickedDept) {
            clickedDept.classList.add('incorrect');
        }
    }

    // Toujours montrer le bon département
    if (correctDept) {
        correctDept.classList.add('correct');
    }

    // Afficher le feedback texte
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

    // Question suivante après 1.5s
    setTimeout(() => {
        state.currentIndex++;
        if (state.currentIndex < state.questions.length) {
            showMapQuestion();
        } else {
            showResults();
        }
    }, 1500);
}
