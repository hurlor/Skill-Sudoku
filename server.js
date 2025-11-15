// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 存储房间信息
const rooms = {};

// 处理Socket.IO连接
io.on('connection', (socket) => {
    console.log('用户已连接:', socket.id);
    
    // 创建房间
    socket.on('create-room', (data) => {
        const { roomCode, difficulty } = data;
        
        // 创建房间
        rooms[roomCode] = {
            host: socket.id,
            players: [socket.id],
            difficulty: difficulty,
            gameStarted: false
        };
        
        // 加入房间
        socket.join(roomCode);
        
        // 通知客户端房间创建成功
        socket.emit('room-created', { roomCode });
        
        console.log(`房间 ${roomCode} 已创建`);
    });
    
    // 加入房间
    socket.on('join-room', (data) => {
        const { roomCode } = data;
        
        // 检查房间是否存在
        if (!rooms[roomCode]) {
            socket.emit('room-not-found');
            return;
        }
        
        // 检查房间是否已满
        if (rooms[roomCode].players.length >= 2) {
            socket.emit('room-full');
            return;
        }
        
        // 加入房间
        socket.join(roomCode);
        rooms[roomCode].players.push(socket.id);
        
        // 初始化玩家游戏状态
        if (!rooms[roomCode].playerStates) {
            rooms[roomCode].playerStates = {};
        }
        rooms[roomCode].playerStates[socket.id] = {
            board: null,
            solution: null,
            correctCells: [],
            progress: 0
        };
        
        // 通知客户端加入成功
        socket.emit('room-joined', { 
            roomCode,
            difficulty: rooms[roomCode].difficulty
        });
        
        // 通知房主有新玩家加入
        io.to(rooms[roomCode].host).emit('player-joined', { playerId: socket.id });
        
        // 如果房间现在有2个玩家，自动通知房主开始游戏
        if (rooms[roomCode].players.length === 2) {
            io.to(rooms[roomCode].host).emit('start-game-request', { roomCode });
        }
        
        console.log(`玩家 ${socket.id} 已加入房间 ${roomCode}`);
    });
    
    // 开始游戏
    socket.on('start-game', (data) => {
        const { roomCode, board, solution, isRematch } = data;
        
        if (rooms[roomCode] && rooms[roomCode].host === socket.id) {
            // 如果是再来一局，需要重置游戏状态
            if (isRematch) {
                console.log(`房间 ${roomCode} 开始再来一局`);
            }
            
            rooms[roomCode].gameStarted = true;
            rooms[roomCode].board = board;
            rooms[roomCode].solution = solution;
            // 保存初始棋盘状态，用于技能系统识别非固定格子
            rooms[roomCode].initialBoard = JSON.parse(JSON.stringify(board));
            
            // 初始化房间计时器
            rooms[roomCode].gameStartTime = Date.now();
            rooms[roomCode].gameTime = 0;
            
            // 如果房间已经有计时器，先清除
            if (rooms[roomCode].timerInterval) {
                clearInterval(rooms[roomCode].timerInterval);
            }
            
            // 创建新的计时器
            rooms[roomCode].timerInterval = setInterval(() => {
                rooms[roomCode].gameTime++;
                // 向房间内所有玩家发送时间更新
                io.to(roomCode).emit('timer-update', { 
                    time: rooms[roomCode].gameTime 
                });
            }, 1000);
            
            // 通知房间内所有玩家游戏开始
            // 确保发送的是深拷贝的board和solution，避免引用问题
            const boardCopy = JSON.parse(JSON.stringify(board));
            const solutionCopy = JSON.parse(JSON.stringify(solution));
            
            console.log(`房间 ${roomCode} 游戏开始，发送题目给所有玩家`);
            io.to(roomCode).emit('game-start', { 
                board: boardCopy, 
                solution: solutionCopy,
                difficulty: rooms[roomCode].difficulty,
                initialTime: 0  // 初始时间为0
            });
        }
    });
    
    // 进度更新
    socket.on('progress-update', (data) => {
        const { roomCode, progress, board } = data;
        
        if (rooms[roomCode]) {
            // 更新玩家进度
            if (!rooms[roomCode].playerProgress) {
                rooms[roomCode].playerProgress = {};
            }
            rooms[roomCode].playerProgress[socket.id] = progress;
            
            // 更新玩家棋盘状态（用于橡皮擦技能）
            if (!rooms[roomCode].playerBoards) {
                rooms[roomCode].playerBoards = {};
            }
            if (board) {
                rooms[roomCode].playerBoards[socket.id] = board;
            }
            
            // 通知房间内其他玩家进度更新
            socket.to(roomCode).emit('opponent-progress', { progress });
        }
    });
    
    // 处理玩家更新格子
    socket.on('cell-update', (data) => {
        const { roomCode, progress, board } = data;
        const room = rooms[roomCode];
        
        if (!room) return;
        
        // 更新玩家进度
        if (!room.playerProgress) {
            room.playerProgress = {};
        }
        room.playerProgress[socket.id] = progress;
        
        // 更新玩家游戏状态
        if (board) {
            if (!room.playerBoards) {
                room.playerBoards = {};
            }
            room.playerBoards[socket.id] = board;
        }
        
        // 检查是否获胜
        if (progress === 100) {
            // 停止房间计时器
            if (room.timerInterval) {
                clearInterval(room.timerInterval);
                room.timerInterval = null;
            }
            
            const serverTime = room.gameTime;
            
            // 通知房间内所有玩家游戏结束
            io.to(roomCode).emit('game-over', {
                winner: socket.id,
                time: serverTime,
                players: room.players.map(p => p === socket.id ? 'you' : 'opponent')
            });
        }
        
        // 通知对手进度更新
        socket.to(roomCode).emit('opponent-progress', {
            progress: progress
        });
    });
    
    // 游戏完成
    socket.on('game-finished', (data) => {
        const { roomCode } = data;
        
        if (rooms[roomCode]) {
            // 停止房间计时器
            if (rooms[roomCode].timerInterval) {
                clearInterval(rooms[roomCode].timerInterval);
                rooms[roomCode].timerInterval = null;
            }
            
            // 使用服务器计时而不是客户端发送的时间
            const serverTime = rooms[roomCode].gameTime;
            
            // 通知房间内其他玩家游戏完成，包含胜利方的用时
            socket.to(roomCode).emit('opponent-finished', { 
                time: serverTime,
                message: `对手已完成游戏，用时: ${formatTime(serverTime)}`
            });
            
            // 通知完成游戏的玩家其用时（使用服务器时间）
            socket.emit('game-finished-confirm', { 
                time: serverTime,
                message: `恭喜你赢了！用时: ${formatTime(serverTime)}`
            });
        }
    });
    
    // 格式化时间显示
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    // 游戏失败
    socket.on('game-lost', (data) => {
        const { roomCode, reason } = data;
        
        if (rooms[roomCode]) {
            // 停止房间计时器
            if (rooms[roomCode].timerInterval) {
                clearInterval(rooms[roomCode].timerInterval);
                rooms[roomCode].timerInterval = null;
            }
            
            // 使用服务器计时
            const serverTime = rooms[roomCode].gameTime;
            
            // 通知房间内其他玩家对手失败
            socket.to(roomCode).emit('opponent-lost', { 
                reason: reason,
                time: serverTime,
                message: `对手失败，你赢了！对手用时: ${formatTime(serverTime)}`
            });
            
            // 通知失败玩家其用时
            socket.emit('game-lost-confirm', { 
                time: serverTime,
                message: `游戏结束。用时: ${formatTime(serverTime)}`
            });
        }
    });
    
    // 使用技能
    socket.on('use-skill', (data) => {
        const { roomCode, skillType } = data;
        
        if (rooms[roomCode]) {
            // 确保initialBoard存在，如果不存在则使用board作为初始状态
            if (!rooms[roomCode].initialBoard && rooms[roomCode].board) {
                rooms[roomCode].initialBoard = JSON.parse(JSON.stringify(rooms[roomCode].board));
            }
            
            if (skillType === 'eraser') {
                // 橡皮擦技能：随机擦除对手一个已填写的正确格子
                const correctCells = [];
                
                // 获取对手的ID（不是当前使用技能的玩家）
                const opponentId = rooms[roomCode].players.find(id => id !== socket.id);
                
                // 如果对手不存在或者对手没有棋盘状态，则无法使用技能
                if (!opponentId || !rooms[roomCode].playerBoards || !rooms[roomCode].playerBoards[opponentId]) {
                    console.log('橡皮擦技能：找不到对手或对手的棋盘状态');
                    return;
                }
                
                const opponentBoard = rooms[roomCode].playerBoards[opponentId];
                
                // 找出对手所有已填写的正确格子（非初始格子）
                for (let row = 0; row < 9; row++) {
                    for (let col = 0; col < 9; col++) {
                        // 检查是否是初始为空的格子且当前已填写
                        if (rooms[roomCode].initialBoard && 
                            rooms[roomCode].initialBoard[row] && 
                            rooms[roomCode].initialBoard[row][col] === 0 && 
                            opponentBoard[row] && 
                            opponentBoard[row][col] !== 0 &&
                            // 检查填写的数字是否正确（与解答对比）
                            rooms[roomCode].solution &&
                            rooms[roomCode].solution[row] &&
                            opponentBoard[row][col] === rooms[roomCode].solution[row][col]) {
                            correctCells.push({ row, col });
                        }
                    }
                }
                
                // 如果有填写正确的格子，随机选择一个
                if (correctCells.length > 0) {
                    const randomIndex = Math.floor(Math.random() * correctCells.length);
                    const cellToErase = correctCells[randomIndex];
                    
                    // 更新对手的棋盘状态
                    if (rooms[roomCode].playerBoards[opponentId]) {
                        rooms[roomCode].playerBoards[opponentId][cellToErase.row][cellToErase.col] = 0;
                    }
                    
                    // 通知对手擦除格子
                    socket.to(roomCode).emit('skill-used', {
                        cell: cellToErase,
                        skillType: 'eraser'
                    });
                    
                    console.log(`橡皮擦技能：擦除了对手格子 (${cellToErase.row}, ${cellToErase.col})`);
                } else {
                    console.log('橡皮擦技能：没有找到可以擦除的正确格子');
                }
            } else if (skillType === 'obscure') {
                // 飞沙走石技能：随机选择5个格子（包括固定格子）
                const cells = [];
                const availableCells = [];
                
                // 找出所有格子
                for (let row = 0; row < 9; row++) {
                    for (let col = 0; col < 9; col++) {
                        availableCells.push({ row, col });
                    }
                }
                
                // 随机选择5个格子
                for (let i = 0; i < 5; i++) {
                    const randomIndex = Math.floor(Math.random() * availableCells.length);
                    cells.push(availableCells[randomIndex]);
                    availableCells.splice(randomIndex, 1);
                }
                
                // 通知对手使用技能，并明确指定技能类型
                socket.to(roomCode).emit('skill-used', { 
                    cells: cells,
                    skillType: 'obscure'
                });
            } else if (skillType === 'blackjack') {
                // 决战21点技能：通知对手
                socket.to(roomCode).emit('skill-used', {
                    skillType: 'blackjack'
                });
            } else {
                // 未知技能类型，不处理
                console.log('Unknown skill type:', skillType);
            }
        }
    });
    
    // 请求再来一局
    socket.on('rematch-request', (data) => {
        const { roomCode } = data;
        
        if (rooms[roomCode]) {
            // 记录玩家请求再来一局
            if (!rooms[roomCode].rematchRequests) {
                rooms[roomCode].rematchRequests = [];
            }
            
            // 如果玩家还没有请求过，则添加到请求列表
            if (!rooms[roomCode].rematchRequests.includes(socket.id)) {
                rooms[roomCode].rematchRequests.push(socket.id);
            }
            
            // 通知房间内所有玩家有人请求再来一局
            io.to(roomCode).emit('rematch-requested', { 
                playerId: socket.id,
                totalRequests: rooms[roomCode].rematchRequests.length
            });
            
            // 如果两个玩家都同意再来一局，则开始新游戏
            if (rooms[roomCode].rematchRequests.length === 2) {
                // 停止房间计时器
                if (rooms[roomCode].timerInterval) {
                    clearInterval(rooms[roomCode].timerInterval);
                    rooms[roomCode].timerInterval = null;
                }
                
                rooms[roomCode].gameStarted = false;
                rooms[roomCode].rematchRequests = [];
                
                // 通知房主开始新游戏
                io.to(rooms[roomCode].host).emit('start-rematch');
            }
        }
    });
    
    // 离开房间
    socket.on('leave-room', (data) => {
        const { roomCode } = data;
        
        if (rooms[roomCode]) {
            // 判断当前玩家是否是房主
            const isHost = rooms[roomCode].host === socket.id;
            
            // 从房间中移除玩家
            const playerIndex = rooms[roomCode].players.indexOf(socket.id);
            if (playerIndex !== -1) {
                rooms[roomCode].players.splice(playerIndex, 1);
            }
            
            // 如果是房客离开房间，通知房主返回等待房间
            if (!isHost && rooms[roomCode].host) {
                // 重置房间游戏状态
                rooms[roomCode].gameStarted = false;
                if (rooms[roomCode].timerInterval) {
                    clearInterval(rooms[roomCode].timerInterval);
                    rooms[roomCode].timerInterval = null;
                }
                
                // 通知房主返回等待房间
                io.to(rooms[roomCode].host).emit('return-to-waiting');
            }
            
            // 通知房间内其他玩家
            socket.to(roomCode).emit('opponent-disconnected');
            
            // 如果房间为空，删除房间并停止计时器
            if (rooms[roomCode].players.length === 0) {
                if (rooms[roomCode].timerInterval) {
                    clearInterval(rooms[roomCode].timerInterval);
                }
                delete rooms[roomCode];
            }
            
            socket.leave(roomCode);
        }
    });
    
    // 处理决战21点游戏开始
socket.on('blackjack-start', (data) => {
    const { roomCode } = data;
    
    if (!rooms[roomCode] || !rooms[roomCode].players.includes(socket.id)) {
        return;
    }
    
    console.log('开始21点游戏，房间:', roomCode);
    
    // 初始化房间中的21点游戏状态
    if (!rooms[roomCode].blackjackGame) {
        rooms[roomCode].blackjackGame = {
            isActive: true,
            deck: createDeck(),
            playerHands: {},
            playerStood: {},
            currentTurn: rooms[roomCode].players[0], // 第一个玩家先手
            gameStarted: true,
            playerIds: rooms[roomCode].players
        };
        
        console.log('设置当前回合为:', rooms[roomCode].blackjackGame.currentTurn);
        
        // 为每个玩家初始化手牌
        rooms[roomCode].players.forEach(playerId => {
            rooms[roomCode].blackjackGame.playerHands[playerId] = [];
            rooms[roomCode].blackjackGame.playerStood[playerId] = false;
            
            // 发两张初始牌
            for (let i = 0; i < 2; i++) {
                const card = rooms[roomCode].blackjackGame.deck.pop();
                rooms[roomCode].blackjackGame.playerHands[playerId].push(card);
            }
        });
        
        console.log('发牌完成，玩家手牌:', rooms[roomCode].blackjackGame.playerHands);
    }
    
    // 通知所有玩家游戏开始
    io.to(roomCode).emit('blackjack-started', {
        currentTurn: rooms[roomCode].blackjackGame.currentTurn,
        playerHands: rooms[roomCode].blackjackGame.playerHands,
        playerIds: rooms[roomCode].players
    });
    
    console.log('发送blackjack-started事件');
});
    
    // 创建一副牌
    function createDeck() {
        const deck = [];
        const suits = ['♠', '♥', '♦', '♣'];
        
        for (const suit of suits) {
            for (let value = 1; value <= 13; value++) {
                deck.push({ suit, value });
            }
        }
        
        // 洗牌
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        
        return deck;
    }
    
    // 计算手牌点数
    function calculateHandValue(hand) {
        let value = 0;
        let aces = 0;
        
        for (const card of hand) {
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
    
    // 处理决战21点抽牌
    socket.on('blackjack-draw', (data) => {
        const { roomCode } = data;
        
        if (!rooms[roomCode] || !rooms[roomCode].players.includes(socket.id)) {
            return;
        }
        
        const blackjackGame = rooms[roomCode].blackjackGame;
        
        // 检查是否轮到当前玩家
        if (blackjackGame.currentTurn !== socket.id) {
            return;
        }
        
        // 抽一张牌
        const card = blackjackGame.deck.pop();
        blackjackGame.playerHands[socket.id].push(card);
        
        // 计算当前玩家的点数
        const playerValue = calculateHandValue(blackjackGame.playerHands[socket.id]);
        
        // 检查是否爆牌
        if (playerValue > 21) {
            // 玩家爆牌，切换到下一个玩家或结束游戏
            blackjackGame.playerStood[socket.id] = true;
            switchToNextPlayer(roomCode);
        }
        
        // 通知所有玩家抽牌结果
        io.to(roomCode).emit('blackjack-draw', {
            playerId: socket.id,
            card: card,
            playerHands: blackjackGame.playerHands,
            currentTurn: blackjackGame.currentTurn,
            playerIds: blackjackGame.playerIds
        });
    });
    
    // 处理决战21点停牌
    socket.on('blackjack-stand', (data) => {
        const { roomCode } = data;
        
        if (!rooms[roomCode] || !rooms[roomCode].players.includes(socket.id)) {
            return;
        }
        
        const blackjackGame = rooms[roomCode].blackjackGame;
        
        // 检查是否轮到当前玩家
        if (blackjackGame.currentTurn !== socket.id) {
            return;
        }
        
        // 设置玩家停牌状态
        blackjackGame.playerStood[socket.id] = true;
        
        // 切换到下一个玩家
        switchToNextPlayer(roomCode);
        
        // 通知所有玩家停牌
        io.to(roomCode).emit('blackjack-stand', {
            playerId: socket.id,
            currentTurn: blackjackGame.currentTurn,
            playerHands: blackjackGame.playerHands,
            playerIds: blackjackGame.playerIds
        });
    });
    
    // 切换到下一个玩家
    function switchToNextPlayer(roomCode) {
        const blackjackGame = rooms[roomCode].blackjackGame;
        const players = rooms[roomCode].players;
        
        // 找到下一个未停牌的玩家
        let nextPlayerIndex = -1;
        for (let i = 0; i < players.length; i++) {
            if (players[i] === blackjackGame.currentTurn) {
                nextPlayerIndex = (i + 1) % players.length;
                break;
            }
        }
        
        // 检查是否所有玩家都已停牌
        let allPlayersStood = true;
        for (const playerId of players) {
            if (!blackjackGame.playerStood[playerId]) {
                allPlayersStood = false;
                break;
            }
        }
        
        if (allPlayersStood) {
            // 所有玩家都已停牌，结束游戏
            endBlackjackGame(roomCode);
        } else {
            // 找到下一个未停牌的玩家
            while (blackjackGame.playerStood[players[nextPlayerIndex]]) {
                nextPlayerIndex = (nextPlayerIndex + 1) % players.length;
            }
            
            blackjackGame.currentTurn = players[nextPlayerIndex];
        }
    }
    
    // 结束21点游戏
    function endBlackjackGame(roomCode) {
        const blackjackGame = rooms[roomCode].blackjackGame;
        const players = rooms[roomCode].players;
        
        // 计算每个玩家的点数
        const playerValues = {};
        for (const playerId of players) {
            playerValues[playerId] = calculateHandValue(blackjackGame.playerHands[playerId]);
        }
        
        // 找出获胜者
        let winner = null;
        let highestValue = 0;
        
        for (const playerId of players) {
            const value = playerValues[playerId];
            // 只有不超过21点的玩家才能获胜
            if (value <= 21 && value > highestValue) {
                highestValue = value;
                winner = playerId;
            }
        }
        
        // 如果所有玩家都爆牌，则平局
        if (winner === null) {
            winner = 'draw';
        }
        
        // 通知所有玩家21点游戏结果
        io.to(roomCode).emit('blackjack-ended', {
            winner: winner,
            playerValues: playerValues,
            playerHands: blackjackGame.playerHands
        });
        
        // 如果有胜者，直接结束数独游戏并宣布该玩家为数独游戏胜利者
        if (winner !== 'draw') {
            // 通知所有玩家数独游戏结束，21点胜利方为数独游戏胜利者
            io.to(roomCode).emit('game-over', {
                winner: winner,
                reason: 'blackjack-victory' // 添加原因标识，表示是通过21点胜利
            });
            
            // 停止计时器
            if (rooms[roomCode].timerInterval) {
                clearInterval(rooms[roomCode].timerInterval);
            }
            
            // 重置房间游戏状态
            rooms[roomCode].gameStarted = false;
        } else {
            // 如果是平局，继续数独游戏
            io.to(roomCode).emit('blackjack-draw-result', {
                message: '21点游戏平局，继续数独游戏'
            });
        }
        
        // 重置21点游戏状态
        rooms[roomCode].blackjackGame = null;
    }
    
    // 返回菜单
    socket.on('back-to-menu', (data) => {
        const { roomCode } = data;
        
        if (rooms[roomCode]) {
            // 判断当前玩家是否是房主
            const isHost = rooms[roomCode].host === socket.id;
            
            // 如果是房主返回菜单，销毁房间并通知房客返回主菜单
            if (isHost) {
                // 通知房间内所有其他玩家返回主菜单
                socket.to(roomCode).emit('force-back-to-menu');
                
                // 停止计时器
                if (rooms[roomCode].timerInterval) {
                    clearInterval(rooms[roomCode].timerInterval);
                }
                
                // 删除房间
                delete rooms[roomCode];
                
                // 离开房间
                socket.leave(roomCode);
                return;
            }
            
            // 如果是房客返回菜单，通知房主返回等待房间
            if (!isHost && rooms[roomCode].host) {
                // 重置房间游戏状态
                rooms[roomCode].gameStarted = false;
                if (rooms[roomCode].timerInterval) {
                    clearInterval(rooms[roomCode].timerInterval);
                    rooms[roomCode].timerInterval = null;
                }
                
                // 通知房主返回等待房间
                io.to(rooms[roomCode].host).emit('return-to-waiting');
            }
            
            // 从房间中移除玩家
            const playerIndex = rooms[roomCode].players.indexOf(socket.id);
            if (playerIndex !== -1) {
                rooms[roomCode].players.splice(playerIndex, 1);
            }
            
            // 如果房间为空，删除房间并停止计时器
            if (rooms[roomCode].players.length === 0) {
                if (rooms[roomCode].timerInterval) {
                    clearInterval(rooms[roomCode].timerInterval);
                }
                delete rooms[roomCode];
            }
            
            socket.leave(roomCode);
        }
    });
    
    // 断开连接
    socket.on('disconnect', () => {
        console.log('用户已断开连接:', socket.id);
        
        // 查找并离开所有房间
        for (const roomCode in rooms) {
            if (rooms[roomCode].players.includes(socket.id)) {
                // 判断当前玩家是否是房主
                const isHost = rooms[roomCode].host === socket.id;
                
                // 从房间中移除玩家
                const playerIndex = rooms[roomCode].players.indexOf(socket.id);
                if (playerIndex !== -1) {
                    rooms[roomCode].players.splice(playerIndex, 1);
                }
                
                // 如果是房客断开连接，通知房主返回等待房间
                if (!isHost && rooms[roomCode].host) {
                    // 重置房间游戏状态
                    rooms[roomCode].gameStarted = false;
                    if (rooms[roomCode].timerInterval) {
                        clearInterval(rooms[roomCode].timerInterval);
                        rooms[roomCode].timerInterval = null;
                    }
                    
                    // 通知房主返回等待房间
                    io.to(rooms[roomCode].host).emit('return-to-waiting');
                }
                
                // 通知房间内其他玩家
                socket.to(roomCode).emit('opponent-disconnected');
                
                // 如果房间为空，删除房间并停止计时器
                if (rooms[roomCode].players.length === 0) {
                    if (rooms[roomCode].timerInterval) {
                        clearInterval(rooms[roomCode].timerInterval);
                    }
                    delete rooms[roomCode];
                }
                
                socket.leave(roomCode);
            }
        }
    });
});

// 提供静态文件
app.use(express.static(__dirname));

// 处理根路径请求
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// 启动服务器
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // 监听所有网络接口

server.listen(PORT, HOST, () => {
    console.log(`服务器运行在 http://${HOST}:${PORT}`);
    console.log(`本地访问: http://localhost:${PORT}`);
    console.log(`局域网访问: http://[您的IP地址]:${PORT}`);
});