// 游戏状态
let gameState = {
    difficulty: 'easy',
    isMultiplayer: false,
    isNoteMode: false,
    lives: 5,
    timer: 0,
    timerInterval: null,
    board: [],
    solution: [],
    selectedCell: null,
    isGameOver: false,
    socket: null,
    roomCode: null,
    isRoomHost: false,
    opponentProgress: 0,
    hasRequestedRematch: false,
    // 技能相关状态
    skillCooldowns: {
        obscure: 0,
        eraser: 0,
        blackjack: 0
    },
    skillIntervals: {
        obscure: null,
        eraser: null,
        blackjack: null
    },
    obscuredCells: [],
    // 决战21点相关状态
    blackjackGame: {
        isActive: false,
        isWaiting: false,
        playerCards: [],
        opponentCards: [],
        playerTurn: true,
        playerStood: false,
        opponentStood: false
    }
};

// DOM元素
const startScreen = document.getElementById('start-screen');
const gameScreen = document.getElementById('game-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const waitingScreen = document.getElementById('waiting-screen');
const joinRoomScreen = document.getElementById('join-room-screen');
const sudokuGrid = document.getElementById('sudoku-grid');
const timerElement = document.getElementById('timer');
const livesContainer = document.getElementById('lives-container');
const noteModeBtn = document.getElementById('note-mode-btn');
const skillBtn = document.getElementById('skill-btn');
const opponentInfo = document.getElementById('opponent-info');
const opponentProgressBar = document.getElementById('opponent-progress-bar');
const roomIdElement = document.getElementById('room-id');
const roomCodeInput = document.getElementById('room-code-input');

// 初始化游戏
function initGame() {
    setupEventListeners();
    // 默认选中简单难度
    selectDifficulty('easy');
    showScreen('start-screen');
}

// 设置事件监听器
function setupEventListeners() {
    // 难度选择按钮
    document.getElementById('easy-btn').addEventListener('click', () => selectDifficulty('easy'));
    document.getElementById('normal-btn').addEventListener('click', () => selectDifficulty('normal'));
    document.getElementById('hard-btn').addEventListener('click', () => selectDifficulty('hard'));
    
    // 游戏模式按钮
    document.getElementById('single-player-btn').addEventListener('click', startSinglePlayerGame);
    document.getElementById('multiplayer-btn').addEventListener('click', showMultiplayerOptions);
    
    // 游戏控制按钮
    document.getElementById('back-btn').addEventListener('click', backToMenu);
    document.getElementById('note-mode-btn').addEventListener('click', toggleNoteMode);
    document.getElementById('skill-obscure-btn').addEventListener('click', () => useSkill('obscure'));
    document.getElementById('skill-eraser-btn').addEventListener('click', () => useSkill('eraser'));
    document.getElementById('skill-blackjack-btn').addEventListener('click', () => useSkill('blackjack'));
    document.getElementById('erase-btn').addEventListener('click', eraseCell);
    
    // 游戏结束按钮
    document.getElementById('restart-btn').addEventListener('click', restartGame);
    document.getElementById('rematch-btn').addEventListener('click', requestRematch);
    document.getElementById('menu-btn').addEventListener('click', handleGameEnd);
    
    // 联机相关按钮
    document.getElementById('cancel-waiting-btn').addEventListener('click', cancelWaiting);
    document.getElementById('join-room-btn').addEventListener('click', joinRoom);
    document.getElementById('back-to-menu-btn').addEventListener('click', backToMenu);
    
    // 数字按钮
    document.querySelectorAll('.number-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const number = parseInt(btn.getAttribute('data-number'));
            inputNumber(number);
        });
    });
    
    // 键盘事件
    document.addEventListener('keydown', handleKeyPress);
}

// 选择难度
function selectDifficulty(difficulty) {
    gameState.difficulty = difficulty;
    
    // 更新按钮样式
    document.querySelectorAll('.difficulty-buttons button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (difficulty === 'easy') {
        document.getElementById('easy-btn').classList.add('active');
    } else if (difficulty === 'normal') {
        document.getElementById('normal-btn').classList.add('active');
    } else if (difficulty === 'hard') {
        document.getElementById('hard-btn').classList.add('active');
    }
}

// 开始单人游戏
function startSinglePlayerGame() {
    gameState.isMultiplayer = false;
    initializeGame();
}

// 显示联机选项
function showMultiplayerOptions() {
    // 创建一个简单的模态框来选择创建房间或加入房间
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>联机对战</h3>
            <button id="create-room-btn">创建房间</button>
            <button id="join-existing-room-btn">加入房间</button>
            <button id="cancel-modal-btn">取消</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('create-room-btn').addEventListener('click', () => {
        document.body.removeChild(modal);
        createRoom();
    });
    
    document.getElementById('join-existing-room-btn').addEventListener('click', () => {
        document.body.removeChild(modal);
        showScreen('join-room-screen');
    });
    
    document.getElementById('cancel-modal-btn').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
}

// 创建房间
function createRoom() {
    gameState.isMultiplayer = true;
    gameState.isRoomHost = true;
    
    // 初始化Socket.IO连接
    if (!gameState.socket) {
        gameState.socket = io();
        setupSocketListeners();
    }
    
    // 生成房间代码
    gameState.roomCode = generateRoomCode();
    roomIdElement.textContent = gameState.roomCode;
    
    // 创建房间
    gameState.socket.emit('create-room', {
        roomCode: gameState.roomCode,
        difficulty: gameState.difficulty
    });
    
    showScreen('waiting-screen');
}

// 加入房间
function joinRoom() {
    const roomCode = roomCodeInput.value.trim();
    
    if (!roomCode) {
        alert('请输入房间号');
        return;
    }
    
    gameState.isMultiplayer = true;
    gameState.isRoomHost = false;
    gameState.roomCode = roomCode;
    
    // 初始化Socket.IO连接
    if (!gameState.socket) {
        gameState.socket = io();
        setupSocketListeners();
    }
    
    // 加入房间
    gameState.socket.emit('join-room', {
        roomCode: roomCode
    });
    
    showScreen('waiting-screen');
}

// 设置Socket.IO监听器
function setupSocketListeners() {
    gameState.socket.on('room-created', (data) => {
        console.log('房间创建成功', data);
    });
    
    gameState.socket.on('room-joined', (data) => {
        console.log('成功加入房间', data);
        // 使用房主设置的难度
        gameState.difficulty = data.difficulty;
        // 更新难度按钮的显示状态
        selectDifficulty(data.difficulty);
        initializeGame();
    });
    
    gameState.socket.on('room-full', () => {
        alert('房间已满');
        backToMenu();
    });
    
    gameState.socket.on('opponent-left-menu', () => {
        alert('对手已返回菜单');
        backToMenu();
    });
    
    gameState.socket.on('room-not-found', () => {
        alert('房间不存在');
        showScreen('join-room-screen');
    });
    
    gameState.socket.on('game-start', (data) => {
        console.log('收到game-start事件', data);
        console.log('是否为房主:', gameState.isRoomHost);
        
        // 更新难度设置为房主的难度
        if (data.difficulty) {
            gameState.difficulty = data.difficulty;
            selectDifficulty(data.difficulty);
        }
        
        // 所有玩家都使用服务器发送的题目，确保双方题目一致
        console.log('使用服务器发送的题目初始化游戏');
        initializeGameWithBoard(data.board, data.solution);
    });
    
    gameState.socket.on('player-joined', (data) => {
        console.log('对手已加入房间', data);
        // 房主不需要在这里初始化游戏，等待服务器发送game-start事件
        // 这样可以确保所有玩家使用相同的题目
    });
    
    gameState.socket.on('start-game-request', (data) => {
        console.log('收到开始游戏请求', data);
        // 房主收到开始游戏请求，生成题目并通知服务器开始游戏
        if (gameState.isRoomHost) {
            // 生成新题目
            generateSudoku();
            // 保存初始题目状态，用于计算进度
            gameState.initialBoard = JSON.parse(JSON.stringify(gameState.board));
            // 通知服务器开始游戏，并发送题目
            gameState.socket.emit('start-game', {
                roomCode: gameState.roomCode,
                board: gameState.board,
                solution: gameState.solution,
                isRematch: false  // 标记这不是再来一局
            });
        }
    });
    
    gameState.socket.on('opponent-progress', (data) => {
        updateOpponentProgress(data.progress);
    });
    
    gameState.socket.on('timer-update', (data) => {
        const { time } = data;
        gameState.timer = time;
        updateTimerDisplay();
    });
    
    gameState.socket.on('opponent-finished', (data) => {
        // 只有在游戏还未结束时才处理对手完成游戏事件
        if (!gameState.isGameOver) {
            // 使用服务器发送的对手用时信息
            const message = data.message || '对手已完成游戏，你输了！';
            endGame(false, message);
            
            // 如果服务器发送了对手的用时，显示在结果中
            if (data.time !== undefined) {
                const resultTime = document.getElementById('result-time');
                resultTime.textContent = `对手用时: ${formatTime(data.time)}`;
            }
            
            // 根据玩家身份修改"返回菜单"按钮的文本
            const menuBtn = document.getElementById('menu-btn');
            if (gameState.isRoomHost) {
                menuBtn.textContent = '返回房间';
            } else {
                menuBtn.textContent = '返回主菜单';
            }
        }
    });
    
    // 格式化时间显示
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    gameState.socket.on('opponent-disconnected', () => {
        alert('对手已断开连接');
        gameState.isMultiplayer = false;
        opponentInfo.classList.add('hidden');
    });
    
    gameState.socket.on('return-to-waiting', () => {
        // 房主收到此事件，返回等待房间
        roomIdElement.textContent = gameState.roomCode;
        showScreen('waiting-screen');
        
        // 重置游戏状态但保持联机模式和房间信息
        gameState.isGameOver = false;
        gameState.lives = 5;
        gameState.timer = 0;
        gameState.selectedCell = null;
        gameState.isNoteMode = false;
        gameState.skillCooldown = 0;
        gameState.obscuredCells = [];
        if (gameState.skillInterval) {
            clearInterval(gameState.skillInterval);
            gameState.skillInterval = null;
        }
        
        // 重置再来一局状态
        gameState.hasRequestedRematch = false;
    });
    
    gameState.socket.on('force-back-to-menu', () => {
        // 房客收到此事件，强制返回主菜单
        alert('房主已返回菜单，您将被返回主菜单');
        
        // 重置游戏状态
        gameState.isMultiplayer = false;
        gameState.isRoomHost = false;
        gameState.roomCode = '';
        gameState.isGameOver = false;
        gameState.lives = 5;
        gameState.timer = 0;
        gameState.selectedCell = null;
        gameState.isNoteMode = false;
        gameState.skillCooldown = 0;
        gameState.obscuredCells = [];
        if (gameState.skillInterval) {
            clearInterval(gameState.skillInterval);
            gameState.skillInterval = null;
        }
        
        // 重置再来一局状态
        gameState.hasRequestedRematch = false;
        
        // 隐藏对手信息
        opponentInfo.classList.add('hidden');
        
        // 返回主菜单
        showScreen('start-screen');
    });
    
    gameState.socket.on('opponent-lost', (data) => {
        // 只有在游戏还未结束时才处理对手失败事件
        if (!gameState.isGameOver) {
            endGame(true, '对手失败，你赢了！');
            
            // 根据玩家身份修改"返回菜单"按钮的文本
            const menuBtn = document.getElementById('menu-btn');
            if (gameState.isRoomHost) {
                menuBtn.textContent = '返回房间';
            } else {
                menuBtn.textContent = '返回主菜单';
            }
        }
    });
    
    gameState.socket.on('game-lost-confirm', (data) => {
        // 处理生命值耗尽的确认信息
        const { time, message } = data;
        
        // 显示结果
        const resultTitle = document.getElementById('result-title');
        const resultMessage = document.getElementById('result-message');
        const resultTime = document.getElementById('result-time');
        const rematchBtn = document.getElementById('rematch-btn');
        const rematchStatus = document.getElementById('rematch-status');
        
        resultTitle.textContent = '游戏结束';
        resultMessage.textContent = message || '生命值耗尽！';
        
        // 显示对手用时
        if (time !== undefined) {
            resultTime.textContent = `对手用时: ${formatTime(time)}`;
        }
        
        // 在联机模式下显示再来一局按钮
        if (gameState.isMultiplayer) {
            rematchBtn.classList.remove('hidden');
            rematchStatus.textContent = '';
            // 重置按钮状态
            rematchBtn.textContent = '再来一局';
            rematchBtn.disabled = false;
            gameOverScreen.classList.add('multiplayer');
            
            // 根据玩家身份修改"返回菜单"按钮的文本
            const menuBtn = document.getElementById('menu-btn');
            if (gameState.isRoomHost) {
                menuBtn.textContent = '返回房间';
            } else {
                menuBtn.textContent = '返回主菜单';
            }
        } else {
            rematchBtn.classList.add('hidden');
            rematchStatus.textContent = '';
            gameOverScreen.classList.remove('multiplayer');
            
            // 单人模式下恢复按钮文本
            const menuBtn = document.getElementById('menu-btn');
            menuBtn.textContent = '返回主菜单';
        }
        
        showScreen('game-over-screen');
    });
    
    gameState.socket.on('rematch-requested', (data) => {
        // 忽略自己发送的请求
        if (data.playerId === gameState.socket.id) {
            return;
        }
        
        const rematchStatus = document.getElementById('rematch-status');
        const rematchBtn = document.getElementById('rematch-btn');
        
        // 如果自己已经请求了再来一局，则显示双方都同意
        if (gameState.hasRequestedRematch) {
            // 两个玩家都同意了，等待服务器开始新游戏
            rematchStatus.textContent = '双方都同意，准备开始新游戏...';
        } else {
            // 自己还没有请求，显示对手请求并显示同意按钮
            rematchStatus.textContent = '对手请求再来一局';
            rematchBtn.textContent = '同意再来一局';
            rematchBtn.disabled = false;
        }
    });
    
    gameState.socket.on('start-rematch', () => {
        // 重置再来一局状态
        gameState.hasRequestedRematch = false;
        
        // 隐藏游戏结束界面
        showScreen('game-screen');
        
        // 如果是房主，生成新题目并发送给服务器
        if (gameState.isRoomHost) {
            // 重置游戏状态但保持联机模式
            gameState.isGameOver = false;
            // 生成新题目
            generateSudoku();
            // 保存初始题目状态，用于计算进度
            gameState.initialBoard = JSON.parse(JSON.stringify(gameState.board));
            // 通知服务器开始重赛，并发送新题目
            gameState.socket.emit('start-game', {
                roomCode: gameState.roomCode,
                board: gameState.board,
                solution: gameState.solution,
                isRematch: true  // 标记这是再来一局
            });
            // 初始化游戏界面
            initializeGameWithBoard(gameState.board, gameState.solution);
        } else {
            // 如果不是房主，等待服务器发送新题目
            // 显示等待状态
            const rematchStatus = document.getElementById('rematch-status');
            rematchStatus.textContent = '等待房主准备新游戏...';
        }
    });
    
    // 监听技能使用事件
    gameState.socket.on('skill-used', (data) => {
        if (data.skillType === 'obscure') {
            // 飞沙走石技能：遮蔽指定的单元格
            obscureCells(data.cells);
        } else if (data.skillType === 'eraser') {
            // 橡皮擦技能：擦除一个填写正确的格子
            eraseCorrectCell(data.cell);
        } else if (data.skillType === 'blackjack') {
            // 对手也点击了决战21点技能，开始游戏
            if (gameState.blackjackGame.isWaiting) {
                initBlackjackGame();
            } else {
                // 对手先点击了，显示迎战提示并添加闪烁效果
                const button = document.getElementById('skill-blackjack-btn');
                const existingSubtitle = button.querySelector('.skill-subtitle');
                if (!existingSubtitle) {
                    const subtitle = document.createElement('div');
                    subtitle.className = 'skill-subtitle';
                    subtitle.textContent = '迎战';
                    button.appendChild(subtitle);
                    // 添加闪烁效果
                    button.classList.add('blinking');
                }
            }
        }
    });
    
    // 监听决战21点游戏开始
    gameState.socket.on('blackjack-started', (data) => {
        console.log('收到blackjack-started事件:', data);
        
        // 移除按钮的闪烁效果
        const blackjackBtn = document.getElementById('skill-blackjack-btn');
        if (blackjackBtn) {
            blackjackBtn.classList.remove('blinking');
        }
        
        const { currentTurn, playerHands, playerIds } = data;
        
        // 初始化决战21点游戏状态
        gameState.blackjackGame = {
            isActive: true,
            isWaiting: false,
            playerCards: [],
            opponentCards: [],
            playerTurn: false,
            playerStood: false,
            opponentStood: false
        };
        
        // 获取当前玩家和对手的ID
        const playerId = gameState.socket.id;
        const opponentId = playerIds.find(id => id !== playerId);
        
        console.log('当前玩家ID:', playerId);
        console.log('对手ID:', opponentId);
        console.log('当前回合:', currentTurn);
        
        // 更新对手ID
        gameState.playerId = playerId;
        gameState.opponentId = opponentId;
        
        // 更新玩家和对手的牌
        gameState.blackjackGame.playerCards = playerHands[playerId] || [];
        gameState.blackjackGame.opponentCards = playerHands[opponentId] || [];
        
        // 更新当前回合
        gameState.blackjackGame.playerTurn = currentTurn === playerId;
        
        console.log('设置playerTurn为:', gameState.blackjackGame.playerTurn);
        
        // 清空牌面
        document.getElementById('player-cards').innerHTML = '';
        document.getElementById('opponent-cards').innerHTML = '';
        document.getElementById('player-value').textContent = '点数: 0';
        document.getElementById('opponent-value').textContent = '点数: 0';
        document.getElementById('blackjack-result').textContent = '';
        document.getElementById('blackjack-status').textContent = '游戏开始！';
        
        // 显示决战21点模态框
        document.getElementById('blackjack-modal').classList.remove('hidden');
        
        // 更新UI
        updateBlackjackUI();
        
        // 添加事件监听器（确保只添加一次）
    const hitBtn = document.getElementById('hit-btn');
    const standBtn = document.getElementById('stand-btn');
    
    // 移除旧的事件监听器
    hitBtn.removeEventListener('click', window.playerHit);
    standBtn.removeEventListener('click', window.playerStand);
    
    // 添加新的事件监听器
    hitBtn.addEventListener('click', window.playerHit);
    standBtn.addEventListener('click', window.playerStand);
    
    console.log('blackjack-started事件处理完成');
    });
    
    // 监听决战21点抽牌
    gameState.socket.on('blackjack-draw', (data) => {
        updateBlackjackUIFromServer(data);
    });
    
    // 监听决战21点停牌
    gameState.socket.on('blackjack-stand', (data) => {
        updateBlackjackUIFromServer(data);
    });
    
    // 监听决战21点游戏结束
    gameState.socket.on('blackjack-ended', (data) => {
        endBlackjackGame(data);
    });
    
    // 监听游戏结束事件（由决战21点触发）
    gameState.socket.on('game-over', (data) => {
        // 延迟处理游戏结束，给玩家时间查看摸牌结果
        setTimeout(() => {
            // 如果是21点胜利导致游戏结束
            if (data.winner === gameState.socket.id) {
                // 显示21点胜利消息
                endGame(true, '恭喜！你在决战21点中获胜，赢得了数独游戏！');
            } else {
                // 显示21点失败消息
                endGame(false, '很遗憾，你在决战21点中失败，输掉了数独游戏！');
            }
        }, 3000); // 5秒后处理游戏结束
    });
}

// 生成房间代码
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// 取消等待
function cancelWaiting() {
    if (gameState.socket && gameState.roomCode) {
        gameState.socket.emit('back-to-menu', {
            roomCode: gameState.roomCode
        });
    }
    backToMenu();
}

// 初始化游戏
function initializeGame() {
    // 重置游戏状态
    gameState.lives = 5;
    gameState.timer = 0;  // 重置计时器显示
    gameState.selectedCell = null;
    gameState.isGameOver = false;
    gameState.isNoteMode = false;
    noteModeBtn.classList.remove('active');
    gameState.blackjackGame = {
        isActive: false,
        isWaiting: false,
        playerCards: [],
        opponentCards: [],
        playerTurn: true,
        playerStood: false,
        opponentStood: false
    };
    
    // 重置技能状态
    gameState.skillCooldowns = {
        obscure: 0,
        eraser: 0
    };
    gameState.obscuredCells = [];
    gameState.blackjackGame = {
        isActive: false,
        isWaiting: false,
        playerCards: [],
        opponentCards: [],
        playerTurn: true,
        playerStood: false,
        opponentStood: false
    };
    
    // 清除所有技能冷却定时器
    if (gameState.skillIntervals.obscure) {
        clearInterval(gameState.skillIntervals.obscure);
        gameState.skillIntervals.obscure = null;
    }
    if (gameState.skillIntervals.eraser) {
        clearInterval(gameState.skillIntervals.eraser);
        gameState.skillIntervals.eraser = null;
    }
    
    // 更新生命值显示
    updateLivesDisplay();
    
    // 生成数独
    generateSudoku();
    
    // 保存初始题目状态，用于计算进度
    gameState.initialBoard = JSON.parse(JSON.stringify(gameState.board));
    
    // 渲染数独网格
    renderSudokuGrid();
    
    // 开始计时（现在由服务器管理）
    startTimer();
    
    // 显示游戏界面
    showScreen('game-screen');
    
    // 如果是联机模式，显示对手信息和技能按钮，并重置对手进度
    if (gameState.isMultiplayer) {
        opponentInfo.classList.remove('hidden');
        const skillsContainer = document.querySelector('.skills-container');
        if (skillsContainer) {
            skillsContainer.classList.remove('hidden');
        }
        // 重置对手进度显示
        gameState.opponentProgress = 0;
        opponentProgressBar.style.width = '0%';
        // 初始化技能按钮
        updateSkillButtons();
    } else {
        opponentInfo.classList.add('hidden');
        const skillsContainer = document.querySelector('.skills-container');
        if (skillsContainer) {
            skillsContainer.classList.add('hidden');
        }
    }
    
    // 如果是房主，通知服务器游戏开始
    if (gameState.isMultiplayer && gameState.isRoomHost && gameState.socket) {
        gameState.socket.emit('start-game', {
            roomCode: gameState.roomCode,
            board: gameState.board,
            solution: gameState.solution,
            isRematch: true  // 标记这是再来一局
        });
    }
}

// 使用房主发送的题目初始化游戏
function initializeGameWithBoard(board, solution) {
    console.log('使用房主发送的题目初始化游戏');
    console.log('接收到的board:', board);
    console.log('接收到的solution:', solution);
    
    // 重置游戏状态
    gameState.lives = 5;
    gameState.timer = 0;  // 重置计时器显示
    gameState.selectedCell = null;
    gameState.isGameOver = false;
    gameState.isNoteMode = false;
    noteModeBtn.classList.remove('active');
    
    // 使用房主发送的题目，包括哪些数字是已经填好的
    gameState.board = JSON.parse(JSON.stringify(board));
    gameState.solution = JSON.parse(JSON.stringify(solution));
    
    // 保存初始题目状态，用于计算进度
    gameState.initialBoard = JSON.parse(JSON.stringify(board));
    
    // 重置blackjackGame状态
    gameState.blackjackGame = {
        isActive: false,
        isWaiting: false,
        playerCards: [],
        opponentCards: [],
        playerTurn: true,
        playerStood: false,
        opponentStood: false
    };
    
    // 重置技能状态和冷却
    gameState.skillCooldowns = {
        obscure: 0,
        eraser: 0,
        blackjack: 0
    };
    gameState.obscuredCells = [];
    
    // 清除所有技能冷却定时器
    if (gameState.skillIntervals.obscure) {
        clearInterval(gameState.skillIntervals.obscure);
        gameState.skillIntervals.obscure = null;
    }
    if (gameState.skillIntervals.eraser) {
        clearInterval(gameState.skillIntervals.eraser);
        gameState.skillIntervals.eraser = null;
    }
    if (gameState.skillIntervals.blackjack) {
        clearInterval(gameState.skillIntervals.blackjack);
        gameState.skillIntervals.blackjack = null;
    }
    
    // 重置决战21点按钮状态
    const blackjackBtn = document.getElementById('skill-blackjack-btn');
    if (blackjackBtn) {
        const subtitle = blackjackBtn.querySelector('.skill-subtitle');
        if (subtitle) {
            blackjackBtn.removeChild(subtitle);
        }
        // 移除闪烁效果
        blackjackBtn.classList.remove('blinking');
    }
    
    console.log('设置后的gameState.board:', gameState.board);
    console.log('保存的初始题目状态:', gameState.initialBoard);
    
    // 更新生命值显示
    updateLivesDisplay();
    
    // 渲染数独网格
    renderSudokuGrid();
    
    // 开始计时（现在由服务器管理）
    startTimer();
    
    // 显示游戏界面
    showScreen('game-screen');
    
    // 如果是联机模式，显示对手信息和技能按钮，并重置对手进度
    if (gameState.isMultiplayer) {
        opponentInfo.classList.remove('hidden');
        const skillsContainer = document.querySelector('.skills-container');
        if (skillsContainer) {
            skillsContainer.classList.remove('hidden');
        }
        // 重置对手进度显示
        gameState.opponentProgress = 0;
        opponentProgressBar.style.width = '0%';
        // 初始化技能按钮
        updateSkillButtons();
    } else {
        opponentInfo.classList.add('hidden');
        const skillsContainer = document.querySelector('.skills-container');
        if (skillsContainer) {
            skillsContainer.classList.add('hidden');
        }
    }
}

// 生成数独
function generateSudoku() {
    // 这里简化处理，实际应用中应该使用更复杂的算法生成数独
    // 首先生成一个完整的数独解
    gameState.solution = generateCompleteSudoku();
    
    // 根据难度移除一些数字
    const cellsToRemove = getCellsToRemove(gameState.difficulty);
    gameState.board = JSON.parse(JSON.stringify(gameState.solution));
    
    // 使用当前时间作为随机种子，确保每次生成不同的题目
    let removed = 0;
    let seed = Date.now(); // 使用当前时间作为种子
    
    // 简单的伪随机数生成器
    function pseudoRandom() {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    }
    
    while (removed < cellsToRemove) {
        const row = Math.floor(pseudoRandom() * 9);
        const col = Math.floor(pseudoRandom() * 9);
        
        if (gameState.board[row][col] !== 0) {
            gameState.board[row][col] = 0;
            removed++;
        }
    }
}

// 生成完整的数独解
function generateCompleteSudoku() {
    // 创建一个基础的数独解
    const baseSolution = [
        [5, 3, 4, 6, 7, 8, 9, 1, 2],
        [6, 7, 2, 1, 9, 5, 3, 4, 8],
        [1, 9, 8, 3, 4, 2, 5, 6, 7],
        [8, 5, 9, 7, 6, 1, 4, 2, 3],
        [4, 2, 6, 8, 5, 3, 7, 9, 1],
        [7, 1, 3, 9, 2, 4, 8, 5, 6],
        [9, 6, 1, 5, 3, 7, 2, 8, 4],
        [2, 8, 7, 4, 1, 9, 6, 3, 5],
        [3, 4, 5, 2, 8, 6, 1, 7, 9]
    ];
    
    // 使用当前时间作为随机种子
    let seed = Date.now();
    
    // 简单的伪随机数生成器
    function pseudoRandom() {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    }
    
    // 创建新解的副本
    const solution = JSON.parse(JSON.stringify(baseSolution));
    
    // 随机交换行（在同一个宫格内）
    for (let block = 0; block < 3; block++) {
        for (let i = 0; i < 2; i++) {
            const row1 = block * 3 + Math.floor(pseudoRandom() * 3);
            const row2 = block * 3 + Math.floor(pseudoRandom() * 3);
            
            // 交换行
            if (row1 !== row2) {
                [solution[row1], solution[row2]] = [solution[row2], solution[row1]];
            }
        }
    }
    
    // 随机交换列（在同一个宫格内）
    for (let block = 0; block < 3; block++) {
        for (let i = 0; i < 2; i++) {
            const col1 = block * 3 + Math.floor(pseudoRandom() * 3);
            const col2 = block * 3 + Math.floor(pseudoRandom() * 3);
            
            // 交换列
            if (col1 !== col2) {
                for (let row = 0; row < 9; row++) {
                    [solution[row][col1], solution[row][col2]] = [solution[row][col2], solution[row][col1]];
                }
            }
        }
    }
    
    // 随机交换宫格行
    for (let i = 0; i < 2; i++) {
        const block1 = Math.floor(pseudoRandom() * 3);
        const block2 = Math.floor(pseudoRandom() * 3);
        
        if (block1 !== block2) {
            for (let row = 0; row < 3; row++) {
                [solution[block1 * 3 + row], solution[block2 * 3 + row]] = [solution[block2 * 3 + row], solution[block1 * 3 + row]];
            }
        }
    }
    
    // 随机交换宫格列
    for (let i = 0; i < 2; i++) {
        const block1 = Math.floor(pseudoRandom() * 3);
        const block2 = Math.floor(pseudoRandom() * 3);
        
        if (block1 !== block2) {
            for (let col = 0; col < 3; col++) {
                for (let row = 0; row < 9; row++) {
                    [solution[row][block1 * 3 + col], solution[row][block2 * 3 + col]] = [solution[row][block2 * 3 + col], solution[row][block1 * 3 + col]];
                }
            }
        }
    }
    
    // 随机交换数字
    const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (let i = numbers.length - 1; i > 0; i--) {
        const j = Math.floor(pseudoRandom() * (i + 1));
        [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }
    
    // 创建映射
    const mapping = {};
    for (let i = 0; i < 9; i++) {
        mapping[i + 1] = numbers[i];
    }
    
    // 应用数字映射
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
            solution[row][col] = mapping[solution[row][col]];
        }
    }
    
    return solution;
}

// 根据难度获取需要移除的单元格数量
function getCellsToRemove(difficulty) {
    switch (difficulty) {
        case 'easy':
            return 30;
        case 'normal':
            return 40;
        case 'hard':
            return 50;
        default:
            return 30;
    }
}

// 渲染数独网格
function renderSudokuGrid() {
    console.log('渲染数独网格，当前board:', gameState.board);
    sudokuGrid.innerHTML = '';
    
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = row;
            cell.dataset.col = col;
            
            const value = gameState.board[row][col];
            
            if (value !== 0) {
                cell.textContent = value;
                cell.classList.add('fixed');
            } else {
                cell.addEventListener('click', selectCell);
            }
            
            sudokuGrid.appendChild(cell);
        }
    }
}

// 选择单元格
function selectCell(e) {
    if (gameState.isGameOver) return;
    
    // 移除之前选中的单元格
    document.querySelectorAll('.cell.selected').forEach(cell => {
        cell.classList.remove('selected');
    });
    
    // 选中当前单元格
    const cell = e.target;
    cell.classList.add('selected');
    gameState.selectedCell = {
        row: parseInt(cell.dataset.row),
        col: parseInt(cell.dataset.col)
    };
    
    // 高亮相关单元格
    highlightRelatedCells(cell);
}

// 高亮相关单元格
function highlightRelatedCells(selectedCell) {
    const row = parseInt(selectedCell.dataset.row);
    const col = parseInt(selectedCell.dataset.col);
    
    // 清除之前的高亮
    document.querySelectorAll('.cell.highlighted').forEach(cell => {
        cell.classList.remove('highlighted');
    });
    
    // 高亮同行、同列和同一宫格
    document.querySelectorAll('.cell').forEach(cell => {
        const cellRow = parseInt(cell.dataset.row);
        const cellCol = parseInt(cell.dataset.col);
        
        if (cellRow === row || cellCol === col || 
            (Math.floor(cellRow / 3) === Math.floor(row / 3) && 
             Math.floor(cellCol / 3) === Math.floor(col / 3))) {
            cell.classList.add('highlighted');
        }
    });
}

// 输入数字
function inputNumber(number) {
    if (gameState.isGameOver || !gameState.selectedCell) return;
    
    const { row, col } = gameState.selectedCell;
    
    // 如果是笔记模式
    if (gameState.isNoteMode) {
        toggleNote(row, col, number);
        return;
    }
    
    // 检查是否是固定单元格
    if (gameState.board[row][col] !== 0) return;
    
    // 设置数字
    gameState.board[row][col] = number;
    
    // 更新单元格显示
    const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
    cell.textContent = number;
    
    // 清除笔记
    const notesContainer = cell.querySelector('.cell-notes');
    if (notesContainer) {
        cell.removeChild(notesContainer);
    }
    
    // 检查是否正确
    if (number === gameState.solution[row][col]) {
        cell.classList.add('correct');
        cell.classList.remove('incorrect');
        
        // 发送进度更新和棋盘状态（如果是联机模式）
        if (gameState.isMultiplayer && gameState.socket) {
            const progress = calculateProgress();
            gameState.socket.emit('progress-update', {
                roomCode: gameState.roomCode,
                progress: progress,
                board: gameState.board
            });
        }
        
        // 检查是否完成
        if (checkGameComplete()) {
            endGame(true);
        }
    } else {
        cell.classList.add('incorrect');
        cell.classList.remove('correct');
        
        // 扣除生命值
        gameState.lives--;
        updateLivesDisplay();
        
        // 检查是否游戏结束
        if (gameState.lives <= 0) {
            // 如果是联机模式，通知服务器游戏失败
            if (gameState.isMultiplayer && gameState.socket) {
                gameState.socket.emit('game-lost', {
                    roomCode: gameState.roomCode,
                    reason: '生命值耗尽！'
                });
            } else {
                // 单人模式直接结束游戏
                endGame(false, '生命值耗尽！');
            }
        }
    }
}

// 切换笔记
function toggleNote(row, col, number) {
    const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
    
    // 获取或创建笔记容器
    let notesContainer = cell.querySelector('.cell-notes');
    if (!notesContainer) {
        notesContainer = document.createElement('div');
        notesContainer.className = 'cell-notes';
        cell.appendChild(notesContainer);
    }
    
    // 查找是否已有该数字的笔记
    const existingNote = notesContainer.querySelector(`.note[data-number="${number}"]`);
    
    if (existingNote) {
        // 如果已有，则移除
        notesContainer.removeChild(existingNote);
    } else {
        // 如果没有，则添加
        const note = document.createElement('div');
        note.className = 'note';
        note.dataset.number = number;
        note.textContent = number;
        
        // 计算位置（3x3网格）
        const noteRow = Math.floor((number - 1) / 3);
        const noteCol = (number - 1) % 3;
        note.style.gridRow = noteRow + 1;
        note.style.gridColumn = noteCol + 1;
        
        notesContainer.appendChild(note);
    }
}

// 擦除单元格
function eraseCell() {
    if (gameState.isGameOver || !gameState.selectedCell) return;
    
    const { row, col } = gameState.selectedCell;
    
    // 检查是否是固定单元格
    if (gameState.board[row][col] !== 0 && 
        document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`).classList.contains('fixed')) {
        return;
    }
    
    // 清除单元格
    gameState.board[row][col] = 0;
    
    // 更新单元格显示
    const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
    cell.textContent = '';
    cell.classList.remove('correct', 'incorrect');
    
    // 清除笔记
    const notesContainer = cell.querySelector('.cell-notes');
    if (notesContainer) {
        cell.removeChild(notesContainer);
    }
    
    // 计算新进度
    const progress = calculateProgress();
    
    // 更新进度显示
    document.getElementById('progress').textContent = `${progress}%`;
    
    // 发送进度更新和棋盘状态（如果是联机模式）
    if (gameState.isMultiplayer && gameState.socket) {
        gameState.socket.emit('progress-update', {
            roomCode: gameState.roomCode,
            progress: progress,
            board: gameState.board
        });
    }
}

// 擦除一个填写正确的格子
function eraseCorrectCell(cell) {
    const { row, col } = cell;
    
    // 检查该格子是否填写了正确的数字
    if (gameState.board[row][col] !== 0 && gameState.board[row][col] === gameState.solution[row][col]) {
        // 擦除格子内容
        gameState.board[row][col] = 0;
        
        // 更新单元格显示
        const cellElement = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
        if (cellElement) {
            cellElement.textContent = '';
            cellElement.classList.remove('correct');
            
            // 添加橡皮擦动画效果
            cellElement.classList.add('erased');
            setTimeout(() => {
                cellElement.classList.remove('erased');
            }, 1000);
        }
        
        // 计算新进度
        const progress = calculateProgress();
        
        // 更新进度显示
        document.getElementById('progress').textContent = `${progress}%`;
        
        // 发送进度更新和棋盘状态（如果是联机模式）
        if (gameState.isMultiplayer && gameState.socket) {
            gameState.socket.emit('progress-update', {
                roomCode: gameState.roomCode,
                progress: progress,
                board: gameState.board
            });
        }
    }
}

// 使用技能
function useSkill(skillType) {
    // 检查是否在冷却中
    if (gameState.skillCooldowns[skillType] > 0) {
        return;
    }
    
    // 检查是否是联机模式
    if (!gameState.isMultiplayer || !gameState.socket) {
        return;
    }
    
    // 如果是橡皮擦技能，检查是否在飞沙走石生效期间
    if (skillType === 'eraser' && gameState.obscuredCells.length > 0) {
        alert('飞沙走石生效期间无法使用橡皮擦！');
        return;
    }
    

    
    // 如果是决战21点技能，检查是否已经在等待或游戏中
    if (skillType === 'blackjack' && (gameState.blackjackGame.isWaiting || gameState.blackjackGame.isActive)) {
        return;
    }
    
    // 通知服务器使用技能
    gameState.socket.emit('use-skill', {
        roomCode: gameState.roomCode,
        skillType: skillType
    });
    
    // 如果是决战21点技能，设置等待状态
    if (skillType === 'blackjack') {
        gameState.blackjackGame.isWaiting = true;
        updateBlackjackButton(true);
    }
    
    // 开始冷却
    startSkillCooldown(skillType);
}

// 开始技能冷却
function startSkillCooldown(skillType) {
    // 初始化冷却时间对象（如果不存在）
    if (!gameState.skillCooldowns) {
        gameState.skillCooldowns = {};
        gameState.skillIntervals = {};
    }
    
    // 决战21点技能不设置冷却时间
    if (skillType === 'blackjack') {
        return;
    }
    
    gameState.skillCooldowns[skillType] = 30; // 30秒冷却时间
    updateSkillButton(skillType);
    
    // 每秒更新冷却时间
    gameState.skillIntervals[skillType] = setInterval(() => {
        gameState.skillCooldowns[skillType]--;
        updateSkillButton(skillType);
        
        // 冷却结束
        if (gameState.skillCooldowns[skillType] <= 0) {
            clearInterval(gameState.skillIntervals[skillType]);
            gameState.skillIntervals[skillType] = null;
        }
    }, 1000);
}

// 更新技能按钮状态
function updateSkillButton(skillType) {
    let buttonId;
    switch (skillType) {
        case 'obscure':
            buttonId = 'skill-obscure-btn';
            break;
        case 'eraser':
            buttonId = 'skill-eraser-btn';
            break;
        case 'blackjack':
            buttonId = 'skill-blackjack-btn';
            break;
        default:
            return;
    }
    
    const button = document.getElementById(buttonId);
    
    if (!gameState.skillCooldowns) {
        gameState.skillCooldowns = {};
    }
    
    if (gameState.skillCooldowns[skillType] > 0) {
        button.disabled = true;
        button.classList.add('cooldown');
        button.setAttribute('data-cooldown', `${gameState.skillCooldowns[skillType]}s`);
    } else {
        button.disabled = false;
        button.classList.remove('cooldown');
        button.removeAttribute('data-cooldown');
    }
}

// 更新决战21点按钮状态
function updateBlackjackButton(isWaiting) {
    const button = document.getElementById('skill-blackjack-btn');
    
    // 更新按钮可用性（移除5分钟限制）
    if (gameState.skillCooldowns.blackjack > 0) {
        button.disabled = true;
        button.classList.add('cooldown');
        button.classList.remove('disabled', 'blinking');
        button.removeAttribute('title');
    } else {
        button.disabled = false;
        button.classList.remove('disabled', 'cooldown');
        button.removeAttribute('title');
    }
    
    // 更新等待状态的小字
    if (isWaiting) {
        const existingSubtitle = button.querySelector('.skill-subtitle');
        if (!existingSubtitle) {
            const subtitle = document.createElement('div');
            subtitle.className = 'skill-subtitle';
            subtitle.textContent = '碰碰运气吧！';
            button.appendChild(subtitle);
        }
        // 等待状态不闪烁
        button.classList.remove('blinking');
    } else {
        const existingSubtitle = button.querySelector('.skill-subtitle');
        if (existingSubtitle) {
            button.removeChild(existingSubtitle);
        }
        // 移除闪烁效果
        button.classList.remove('blinking');
    }
}

// 更新所有技能按钮
function updateSkillButtons() {
    updateSkillButton('obscure');
    updateSkillButton('eraser');
}

// 遮蔽单元格
function obscureCells(cells) {
    // 清除之前的遮蔽
    clearObscuredCells();
    
    // 遮蔽新的单元格
    cells.forEach(({ row, col }) => {
        const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
        if (cell) {
            cell.classList.add('obscured');
            
            // 添加沙尘粒子元素
            for (let i = 1; i <= 3; i++) {
                const particle = document.createElement('div');
                particle.className = 'sand-particle';
                cell.appendChild(particle);
            }
            
            gameState.obscuredCells.push({ row, col });
        }
    });
    
    // 5秒后恢复
    setTimeout(() => {
        clearObscuredCells();
    }, 5000);
}

// 清除遮蔽的单元格
function clearObscuredCells() {
    gameState.obscuredCells.forEach(({ row, col }) => {
        const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
        if (cell) {
            cell.classList.remove('obscured');
            
            // 移除所有沙尘粒子
            const particles = cell.querySelectorAll('.sand-particle');
            particles.forEach(particle => particle.remove());
        }
    });
    gameState.obscuredCells = [];
}

// 擦除一个填写正确的格子
function eraseCorrectCell(cell) {
    const { row, col } = cell;
    
    // 检查该格子是否填写了正确的数字
    if (gameState.board[row][col] !== 0 && gameState.board[row][col] === gameState.solution[row][col]) {
        // 擦除格子内容
        gameState.board[row][col] = 0;
        
        // 更新单元格显示
        const cellElement = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
        if (cellElement) {
            cellElement.textContent = '';
            cellElement.classList.remove('correct');
            
            // 添加橡皮擦动画效果
            cellElement.classList.add('erased');
            setTimeout(() => {
                cellElement.classList.remove('erased');
            }, 1000);
        }
        
        // 发送进度更新（如果是联机模式）
        if (gameState.isMultiplayer && gameState.socket) {
            const progress = calculateProgress();
            gameState.socket.emit('progress-update', {
                roomCode: gameState.roomCode,
                progress: progress
            });
        }
    }
}

// 切换笔记模式
function toggleNoteMode() {
    gameState.isNoteMode = !gameState.isNoteMode;
    
    if (gameState.isNoteMode) {
        noteModeBtn.classList.add('active');
    } else {
        noteModeBtn.classList.remove('active');
    }
}

// 处理键盘输入
function handleKeyPress(e) {
    if (gameState.isGameOver) return;
    
    // 数字键 1-9
    if (e.key >= '1' && e.key <= '9') {
        const number = parseInt(e.key);
        inputNumber(number);
    }
    
    // 删除键
    else if (e.key === 'Delete' || e.key === 'Backspace') {
        eraseCell();
    }
    
    // 笔记模式切换键
    else if (e.key === 'n' || e.key === 'N') {
        toggleNoteMode();
    }
    
    // 方向键移动选中单元格
    else if (gameState.selectedCell) {
        let { row, col } = gameState.selectedCell;
        let moved = false;
        
        switch (e.key) {
            case 'ArrowUp':
                if (row > 0) {
                    row--;
                    moved = true;
                }
                break;
            case 'ArrowDown':
                if (row < 8) {
                    row++;
                    moved = true;
                }
                break;
            case 'ArrowLeft':
                if (col > 0) {
                    col--;
                    moved = true;
                }
                break;
            case 'ArrowRight':
                if (col < 8) {
                    col++;
                    moved = true;
                }
                break;
        }
        
        if (moved) {
            e.preventDefault();
            const newCell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
            if (newCell && !newCell.classList.contains('fixed')) {
                newCell.click();
            }
        }
    }
}

// 初始化决战21点游戏
function initBlackjackGame() {
    console.log('initBlackjackGame被调用');
    
    // 设置当前玩家ID
    gameState.playerId = gameState.socket.id;
    console.log('设置玩家ID:', gameState.playerId);
    
    // 重置游戏状态
    gameState.blackjackGame = {
        isActive: true,
        isWaiting: false,
        playerCards: [],
        opponentCards: [],
        playerTurn: false,  // 初始设置为false，等待服务器确认
        playerStood: false,
        opponentStood: false
    };
    
    console.log('初始化blackjackGame状态:', gameState.blackjackGame);
    
    // 清空牌面
    document.getElementById('player-cards').innerHTML = '';
    document.getElementById('opponent-cards').innerHTML = '';
    document.getElementById('player-value').textContent = '点数: 0';
    document.getElementById('opponent-value').textContent = '点数: 0';
    document.getElementById('blackjack-result').textContent = '';
    document.getElementById('blackjack-status').textContent = '等待游戏开始...';
    
    // 显示决战21点模态框
    document.getElementById('blackjack-modal').classList.remove('hidden');
    
    // 通知服务器开始21点游戏
    console.log('发送blackjack-start事件');
    gameState.socket.emit('blackjack-start', {
        roomCode: gameState.roomCode
    });
    
    // 添加事件监听器
    const hitBtn = document.getElementById('hit-btn');
    const standBtn = document.getElementById('stand-btn');
    
    // 移除旧的事件监听器
    hitBtn.removeEventListener('click', window.playerHit);
    standBtn.removeEventListener('click', window.playerStand);
    
    // 添加新的事件监听器
    hitBtn.addEventListener('click', window.playerHit);
    standBtn.addEventListener('click', window.playerStand);
    
    console.log('事件监听器已绑定');
}

// 玩家要牌
window.playerHit = function() {
    console.log('playerHit被调用');
    console.log('gameState.blackjackGame:', gameState.blackjackGame);
    console.log('gameState.socket:', gameState.socket);
    
    if (!gameState.blackjackGame) {
        console.log('blackjackGame不存在');
        return;
    }
    
    if (!gameState.blackjackGame.isActive) {
        console.log('游戏未激活');
        return;
    }
    
    if (!gameState.blackjackGame.playerTurn) {
        console.log('不是玩家回合');
        return;
    }
    
    console.log('发送blackjack-draw事件');
    // 通知服务器玩家要牌
    gameState.socket.emit('blackjack-draw', {
        roomCode: gameState.roomCode
    });
}

// 玩家停牌
window.playerStand = function() {
    console.log('playerStand被调用');
    console.log('gameState.blackjackGame:', gameState.blackjackGame);
    console.log('gameState.socket:', gameState.socket);
    
    if (!gameState.blackjackGame) {
        console.log('blackjackGame不存在');
        return;
    }
    
    if (!gameState.blackjackGame.isActive) {
        console.log('游戏未激活');
        return;
    }
    
    if (!gameState.blackjackGame.playerTurn) {
        console.log('不是玩家回合');
        return;
    }
    
    console.log('设置玩家停牌状态');
    gameState.blackjackGame.playerStood = true;
    
    console.log('发送blackjack-stand事件');
    // 通知服务器玩家停牌
    gameState.socket.emit('blackjack-stand', {
        roomCode: gameState.roomCode
    });
}

// 计算牌面点数
function calculateCardValue(cards) {
    let value = 0;
    let aces = 0;
    
    for (const card of cards) {
        if (card.value === 1) {
            aces++;
            value += 11;
        } else if (card.value > 10) {
            value += 10;
        } else {
            value += card.value;
        }
    }
    
    // 处理A的特殊情况
    while (value > 21 && aces > 0) {
        value -= 10;
        aces--;
    }
    
    return value;
}

// 更新决战21点UI
function updateBlackjackUI() {
    // 更新玩家牌面
    const playerCardsEl = document.getElementById('player-cards');
    playerCardsEl.innerHTML = '';
    
    for (const card of gameState.blackjackGame.playerCards) {
        const cardEl = document.createElement('div');
        cardEl.className = 'card';
        
        let displayValue = card.value;
        if (card.value === 1) displayValue = 'A';
        else if (card.value === 11) displayValue = 'J';
        else if (card.value === 12) displayValue = 'Q';
        else if (card.value === 13) displayValue = 'K';
        
        cardEl.innerHTML = `<div class="card-value ${card.suit === '♥' || card.suit === '♦' ? 'red' : 'black'}">${displayValue}${card.suit}</div>`;
        playerCardsEl.appendChild(cardEl);
    }
    
    // 更新对手牌面
    const opponentCardsEl = document.getElementById('opponent-cards');
    opponentCardsEl.innerHTML = '';
    
    for (const card of gameState.blackjackGame.opponentCards) {
        const cardEl = document.createElement('div');
        cardEl.className = 'card';
        
        let displayValue = card.value;
        if (card.value === 1) displayValue = 'A';
        else if (card.value === 11) displayValue = 'J';
        else if (card.value === 12) displayValue = 'Q';
        else if (card.value === 13) displayValue = 'K';
        
        cardEl.innerHTML = `<div class="card-value ${card.suit === '♥' || card.suit === '♦' ? 'red' : 'black'}">${displayValue}${card.suit}</div>`;
        opponentCardsEl.appendChild(cardEl);
    }
    
    // 更新点数
    const playerValue = calculateCardValue(gameState.blackjackGame.playerCards);
    const opponentValue = calculateCardValue(gameState.blackjackGame.opponentCards);
    
    document.getElementById('player-value').textContent = `点数: ${playerValue}`;
    document.getElementById('opponent-value').textContent = `点数: ${opponentValue}`;
    
    // 获取按钮元素
    const hitBtn = document.getElementById('hit-btn');
    const standBtn = document.getElementById('stand-btn');
    
    // 更新按钮状态
    if (hitBtn && standBtn) {
        // 如果是当前玩家的回合，启用按钮
        if (gameState.blackjackGame.playerTurn) {
            hitBtn.disabled = false;
            standBtn.disabled = false;
            document.getElementById('blackjack-status').textContent = '你的回合';
            console.log('按钮已启用 - 当前玩家回合');
        } else {
            hitBtn.disabled = true;
            standBtn.disabled = true;
            document.getElementById('blackjack-status').textContent = '等待对手...';
            console.log('按钮已禁用 - 对手回合');
        }
    } else {
        console.error('无法找到按钮元素');
    }
}

// 更新决战21点UI（从服务器数据）
function updateBlackjackUIFromServer(data) {
    console.log('updateBlackjackUIFromServer被调用，数据:', data);
    
    if (!gameState.blackjackGame) {
        console.error('blackjackGame未初始化');
        return;
    }
    
    // 确保data包含所有必要的字段
    const { playerHands, currentTurn, playerIds } = data;
    
    // 如果没有playerIds，则使用现有的playerId和opponentId
    if (playerIds) {
        // 获取当前玩家和对手的ID
        const playerId = gameState.socket.id;
        const opponentId = playerIds.find(id => id !== playerId);
        
        console.log('从服务器数据更新玩家ID:', playerId);
        console.log('从服务器数据更新对手ID:', opponentId);
        
        // 保存玩家ID和对手ID
        gameState.playerId = playerId;
        gameState.opponentId = opponentId;
        
        // 更新玩家和对手的牌
        gameState.blackjackGame.playerCards = playerHands[playerId] || [];
        gameState.blackjackGame.opponentCards = playerHands[opponentId] || [];
    } else {
        // 使用现有的playerId和opponentId
        const playerId = gameState.playerId || gameState.socket.id;
        const opponentId = gameState.opponentId;
        
        console.log('使用现有玩家ID:', playerId);
        console.log('使用现有对手ID:', opponentId);
        
        // 更新玩家和对手的牌
        gameState.blackjackGame.playerCards = playerHands[playerId] || [];
        gameState.blackjackGame.opponentCards = playerHands[opponentId] || [];
    }
    
    // 更新当前回合
    const isPlayerTurn = currentTurn === (gameState.playerId || gameState.socket.id);
    gameState.blackjackGame.playerTurn = isPlayerTurn;
    console.log('设置playerTurn为:', isPlayerTurn, '(当前回合:', currentTurn, ')');
    
    // 更新UI
    updateBlackjackUI();
    console.log('updateBlackjackUIFromServer处理完成');
}

// 结束决战21点游戏
function endBlackjackGame(data) {
    gameState.blackjackGame.isActive = false;
    
    const { winner, playerValues, playerHands } = data;
    
    // 获取当前玩家ID
    const playerId = gameState.socket.id;
    
    // 更新玩家和对手的牌
    gameState.blackjackGame.playerCards = playerHands[playerId] || [];
    
    // 找出对手ID
    for (const id in playerHands) {
        if (id !== playerId) {
            gameState.blackjackGame.opponentCards = playerHands[id] || [];
            break;
        }
    }
    
    // 更新UI
    updateBlackjackUI();
    
    let result;
    
    if (winner === 'draw') {
        result = '平局！';
    } else if (winner === playerId) {
        result = '你赢了21点！';
    } else {
        result = '对手赢了21点！';
    }
    
    document.getElementById('blackjack-result').textContent = result;
    document.getElementById('blackjack-status').textContent = '游戏结束';
    
    // 禁用按钮
    document.getElementById('hit-btn').disabled = true;
    document.getElementById('stand-btn').disabled = true;
    
    // 如果是平局，3秒后关闭模态框并重置技能按钮
    if (winner === 'draw') {
        setTimeout(() => {
            document.getElementById('blackjack-modal').classList.add('hidden');
            
            // 重置决战21点技能按钮状态
            const blackjackBtn = document.getElementById('skill-blackjack-btn');
            const subtitle = blackjackBtn.querySelector('.skill-subtitle');
            if (subtitle) {
                blackjackBtn.removeChild(subtitle);
            }
            // 移除闪烁效果
            blackjackBtn.classList.remove('blinking');
            
            // 重置blackjackGame状态
            gameState.blackjackGame = {
                isActive: false,
                isWaiting: false,
                playerCards: [],
                opponentCards: [],
                playerTurn: true,
                playerStood: false,
                opponentStood: false
            };
            
            // 重置技能冷却（如果需要）
            gameState.skillCooldowns.blackjack = 0;
            updateSkillButtons();
        }, 3000);
    } else {
        // 如果有胜者，显示5秒摸牌结果，然后结束游戏
        setTimeout(() => {
            document.getElementById('blackjack-modal').classList.add('hidden');
        }, 5000);
    }
}

// 计算游戏进度
function calculateProgress() {
    let filledCells = 0;
    let totalEmptyCells = 0;
    
    // 首先保存初始题目状态（如果还没有保存的话）
    if (!gameState.initialBoard) {
        gameState.initialBoard = JSON.parse(JSON.stringify(gameState.board));
    }
    
    // 计算需要填写的单元格总数和已正确填写的单元格数量
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
            // 初始为空的单元格是需要填写的
            if (gameState.initialBoard[row][col] === 0) {
                totalEmptyCells++;
                
                // 如果当前单元格已正确填写
                if (gameState.board[row][col] !== 0 && gameState.board[row][col] === gameState.solution[row][col]) {
                    filledCells++;
                }
            }
        }
    }
    
    console.log(`进度计算: 已填写${filledCells}个，需要填写${totalEmptyCells}个，进度${Math.floor((filledCells / totalEmptyCells) * 100)}%`);
    
    // 如果没有需要填写的单元格，返回100%
    if (totalEmptyCells === 0) {
        return 100;
    }
    
    return Math.floor((filledCells / totalEmptyCells) * 100);
}

// 更新对手进度
function updateOpponentProgress(progress) {
    console.log('更新对手进度:', progress);
    gameState.opponentProgress = progress;
    opponentProgressBar.style.width = `${progress}%`;
}

// 检查游戏是否完成
function checkGameComplete() {
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
            if (gameState.board[row][col] !== gameState.solution[row][col]) {
                return false;
            }
        }
    }
    return true;
}

// 开始计时（现在由服务器管理，客户端只显示）
function startTimer() {
    // 客户端不再管理计时，只显示服务器发送的时间
    // 计时器由服务器管理，通过timer-update事件更新
}

// 停止计时（现在由服务器管理）
function stopTimer() {
    // 客户端不再管理计时，只显示服务器发送的时间
    // 计时器由服务器管理
}

// 更新计时器显示
function updateTimerDisplay() {
    const minutes = Math.floor(gameState.timer / 60);
    const seconds = gameState.timer % 60;
    timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// 更新生命值显示
function updateLivesDisplay() {
    const lifeElements = livesContainer.querySelectorAll('.life');
    
    lifeElements.forEach((life, index) => {
        if (index >= gameState.lives) {
            life.classList.add('lost');
        } else {
            life.classList.remove('lost');
        }
    });
}

// 结束游戏
function endGame(isWin, message = '') {
    gameState.isGameOver = true;
    gameState.hasRequestedRematch = false; // 重置再来一局状态
    stopTimer();
    
    // 如果是联机模式且获胜，通知服务器（不发送时间，由服务器计算）
    if (gameState.isMultiplayer && isWin && gameState.socket) {
        gameState.socket.emit('game-finished', {
            roomCode: gameState.roomCode
        });
    }
    
    // 如果是联机模式且失败，通知服务器（不发送时间，由服务器计算）
    if (gameState.isMultiplayer && !isWin && gameState.socket) {
        gameState.socket.emit('game-lost', {
            roomCode: gameState.roomCode
        });
    }
    
    // 显示结果
    const resultTitle = document.getElementById('result-title');
    const resultMessage = document.getElementById('result-message');
    const resultTime = document.getElementById('result-time');
    const rematchBtn = document.getElementById('rematch-btn');
    const rematchStatus = document.getElementById('rematch-status');
    
    if (isWin) {
        resultTitle.textContent = '恭喜你赢了！';
        resultMessage.textContent = message || '你成功完成了数独！';
    } else {
        resultTitle.textContent = '游戏结束';
        resultMessage.textContent = message || '再接再厉！';
    }
    
    // 只有在自己完成游戏时才显示自己的用时
    // 如果是因为对手完成而结束游戏，时间信息会在opponent-finished事件中更新
    if (isWin) {
        resultTime.textContent = `用时: ${timerElement.textContent}`;
    }
    
    // 在联机模式下显示再来一局按钮
    if (gameState.isMultiplayer) {
        rematchBtn.classList.remove('hidden');
        rematchStatus.textContent = '';
        // 重置按钮状态
        rematchBtn.textContent = '再来一局';
        rematchBtn.disabled = false;
        gameOverScreen.classList.add('multiplayer');
        
        // 根据玩家身份修改"返回菜单"按钮的文本
        const menuBtn = document.getElementById('menu-btn');
        if (gameState.isRoomHost) {
            menuBtn.textContent = '返回房间';
        } else {
            menuBtn.textContent = '返回主菜单';
        }
    } else {
        rematchBtn.classList.add('hidden');
        rematchStatus.textContent = '';
        gameOverScreen.classList.remove('multiplayer');
        
        // 单人模式下恢复按钮文本
        const menuBtn = document.getElementById('menu-btn');
        menuBtn.textContent = '返回主菜单';
    }
    
    showScreen('game-over-screen');
}

// 重新开始游戏
function restartGame() {
    initializeGame();
}

// 返回菜单
function backToMenu() {
    stopTimer();
    
    // 如果是联机模式，通知对手并离开房间
    if (gameState.isMultiplayer && gameState.socket && gameState.roomCode) {
        gameState.socket.emit('back-to-menu', {
            roomCode: gameState.roomCode
        });
    }
    
    // 重置游戏状态
    gameState.isMultiplayer = false;
    gameState.roomCode = null;
    gameState.isRoomHost = false;
    
    showScreen('start-screen');
}

// 请求再来一局
function requestRematch() {
    if (gameState.isMultiplayer && gameState.socket && gameState.roomCode) {
        // 标记自己已经请求了再来一局
        gameState.hasRequestedRematch = true;
        
        // 显示等待状态
        const rematchStatus = document.getElementById('rematch-status');
        rematchStatus.textContent = '等待对手响应...';
        
        // 将按钮变为锁定状态
        const rematchBtn = document.getElementById('rematch-btn');
        rematchBtn.textContent = '已请求再来一局';
        rematchBtn.disabled = true;
        
        // 发送再来一局请求
        gameState.socket.emit('rematch-request', {
            roomCode: gameState.roomCode
        });
    } else {
        // 单人模式直接重新开始
        restartGame();
    }
}

// 游戏结束界面返回菜单
function backToMenuFromGameOver() {
    stopTimer();
    
    // 如果是联机模式，通知对手并离开房间
    if (gameState.isMultiplayer && gameState.socket && gameState.roomCode) {
        gameState.socket.emit('back-to-menu', {
            roomCode: gameState.roomCode
        });
    }
    
    // 重置游戏状态
    gameState.isMultiplayer = false;
    gameState.roomCode = null;
    gameState.isRoomHost = false;
    
    showScreen('start-screen');
}

// 游戏结束后，房主返回等待房间，房客返回主菜单
function handleGameEnd() {
    stopTimer();
    
    if (gameState.isMultiplayer && gameState.socket && gameState.roomCode) {
        if (gameState.isRoomHost) {
            // 房主返回等待房间
            roomIdElement.textContent = gameState.roomCode;
            showScreen('waiting-screen');
            
            // 重置游戏状态但保持联机模式和房间信息
            gameState.isGameOver = false;
            gameState.lives = 5;
            gameState.timer = 0;
            gameState.selectedCell = null;
            gameState.isNoteMode = false;
            gameState.skillCooldown = 0;
            gameState.obscuredCells = [];
            if (gameState.skillInterval) {
                clearInterval(gameState.skillInterval);
                gameState.skillInterval = null;
            }
            
            // 重置再来一局状态
            gameState.hasRequestedRematch = false;
        } else {
            // 房客返回主菜单
            gameState.socket.emit('back-to-menu', {
                roomCode: gameState.roomCode
            });
            
            // 重置游戏状态
            gameState.isMultiplayer = false;
            gameState.roomCode = null;
            gameState.isRoomHost = false;
            
            showScreen('start-screen');
        }
    } else {
        // 单人模式返回主菜单
        showScreen('start-screen');
    }
}

// 显示指定屏幕
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    document.getElementById(screenId).classList.add('active');
}

// 添加模态框样式
const modalStyles = `
    .modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }
    
    .modal-content {
        background-color: white;
        padding: 20px;
        border-radius: 10px;
        text-align: center;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    .modal-content h3 {
        margin-bottom: 15px;
    }
    
    .modal-content button {
        margin: 5px;
    }
`;

// 添加模态框样式到页面
const styleSheet = document.createElement('style');
styleSheet.textContent = modalStyles;
document.head.appendChild(styleSheet);

// 初始化游戏
document.addEventListener('DOMContentLoaded', initGame);