const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();
let stripe = null;
try {
    const Stripe = require('stripe');
    if (process.env.STRIPE_SECRET_KEY) {
        stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });
    }
} catch (e) {
    console.warn('⚠️ Stripe SDK not available; Stripe routes will be disabled until installed.');
}

const app = express();
// Behind Railway/Heroku-style proxies, enable trust proxy so rate-limit and IPs work
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' ? false : "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "https://js.stripe.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:", "https://api.stripe.com"],
            frameSrc: ["'self'", "https://checkout.stripe.com"]
        }
    }
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true, // return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false // disable the `X-RateLimit-*` headers
});
app.use(limiter);

// CORS
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? false : "http://localhost:3000",
    credentials: true
}));

// Stripe webhook (raw body) must be defined BEFORE express.json
if (stripe) {
    app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
        const sig = req.headers['stripe-signature'];
        try {
            let event;
            if (process.env.STRIPE_WEBHOOK_SECRET && sig) {
                event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
            } else {
                // Fallback for dev without signature verification
                event = JSON.parse(req.body.toString());
            }
            console.log('🔔 Stripe webhook:', event.type);
            // Minimal handlers; extend as needed
            switch (event.type) {
                case 'checkout.session.completed':
                    // TODO: fulfill order based on session metadata
                    break;
                default:
                    break;
            }
            res.status(200).send({ received: true });
        } catch (err) {
            console.error('Stripe webhook error:', err.message);
            res.status(400).send(`Webhook Error: ${err.message}`);
        }
    });
}

// Body parsing middleware (after webhook raw)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, '../dist')));

// Basic routes
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Stripe fundamentals
app.get('/api/stripe/config', (req, res) => {
    res.json({
        active: !!stripe,
        publicKey: process.env.STRIPE_PUBLISHABLE_KEY || null
    });
});

app.post('/api/stripe/create-checkout-session', async (req, res) => {
    try {
        if (!stripe) return res.status(501).json({ error: 'Stripe not configured' });
        const { priceId, metadata } = req.body || {};
        if (!priceId) return res.status(400).json({ error: 'priceId required' });
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: (process.env.PUBLIC_BASE_URL || 'http://localhost:3000') + '/?checkout=success',
            cancel_url: (process.env.PUBLIC_BASE_URL || 'http://localhost:3000') + '/?checkout=cancel',
            metadata: metadata || {}
        });
        res.json({ id: session.id, url: session.url });
    } catch (e) {
        console.error('Stripe checkout error:', e);
        res.status(500).json({ error: 'Stripe error' });
    }
});

// Game state management
const gameState = {
    players: new Map(),
    rooms: new Map(),
    maxPlayersPerRoom: 8,
    roundDuration: 4 * 60 * 1000, // 4 minutes in milliseconds
    waitingDuration: 1 * 60 * 1000, // 1 minute waiting
    respawnDuration: 3 * 1000, // 3 seconds respawn
    spawnInvulnerableMs: 2000, // 2 seconds invulnerability after spawn/respawn
    entryDescentMs: 8000, // initial spawn parachute descent duration
    respawnDescentMs: 3000, // respawn parachute descent duration
    gameStates: new Map(), // Track game state per room
    boostPads: new Map(), // Track boost pad positions per room
    powerups: new Map() // Track active powerups per room
};

// Initialize game state for a room
function initializeRoomGameState(roomId) {
    gameState.gameStates.set(roomId, {
        phase: 'waiting', // 'waiting', 'playing', 'roundEnd'
        roundStartTime: null,
        roundEndTime: null,
        waitingStartTime: null,
        leaderboard: new Map(), // playerId -> { kills: 0, deaths: 0, damageDealt: 0 }
        activePlayers: new Set(),
        respawningPlayers: new Map(), // playerId -> respawnTime
        powerups: new Map(), // powerupId -> { type, position, dropTime, collected }
        lastPowerupDrop: 0 // timestamp of last powerup drop
    });
}

// Get or create game state for a room
function getRoomGameState(roomId) {
    if (!gameState.gameStates.has(roomId)) {
        initializeRoomGameState(roomId);
    }
    return gameState.gameStates.get(roomId);
}

// Generate boost pad positions for a room
function generateBoostPads(roomId) {
    const boostPads = [];
    const arenaRadius = 160; // Match the 2x bigger arena size
    
    // Generate 2 boost pads at fixed positions for consistency (updated for larger arena)
    const positions = [
        { x: 60, z: 40, rotation: 0.5 },
        { x: -50, z: -70, rotation: 2.1 }
    ];
    
    positions.forEach((pos, index) => {
        boostPads.push({
            id: `boost_${roomId}_${index}`,
            x: pos.x,
            z: pos.z,
            rotation: pos.rotation
        });
    });
    
    gameState.boostPads.set(roomId, boostPads);
    return boostPads;
}

// Get boost pads for a room
function getBoostPads(roomId) {
    if (!gameState.boostPads.has(roomId)) {
        return generateBoostPads(roomId);
    }
    return gameState.boostPads.get(roomId);
}

// Update game state for all rooms
function updateGameStates() {
    const now = Date.now();
    
    gameState.gameStates.forEach((roomState, roomId) => {
        const room = gameState.rooms.get(roomId);
        if (!room) return;
        
        switch (roomState.phase) {
            case 'waiting':
                if (now - roomState.waitingStartTime >= gameState.waitingDuration) {
                    startRound(roomId);
                }
                break;
                
            case 'playing':
                if (now - roomState.roundStartTime >= gameState.roundDuration) {
                    endRound(roomId);
                }
                break;
                
            case 'roundEnd':
                // During roundEnd we only show the scoreboard; movement allowed, no scoring
                // Transition handled by endRound's timer (do nothing here)
                break;
        }
        
        // Check respawning players
        roomState.respawningPlayers.forEach((respawnTime, playerId) => {
            if (now >= respawnTime) {
                respawnPlayer(roomId, playerId);
            }
        });
        
        // Manage powerup drops
        managePowerupDrops(roomId);
    });
}

// Start a new round
function startRound(roomId) {
    const roomState = getRoomGameState(roomId);
    const room = gameState.rooms.get(roomId);
    
    roomState.phase = 'playing';
    roomState.roundStartTime = Date.now();
    roomState.roundEndTime = roomState.roundStartTime + gameState.roundDuration;
    roomState.activePlayers.clear();
    roomState.respawningPlayers.clear();
    
    // Reset all players in the room
    room.forEach(playerId => {
        const player = gameState.players.get(playerId);
        if (player) {
            // Set starting health to the vehicle's maxHealth to match client HUD percent logic
            player.health = player.vehicle?.maxHealth ?? 100;
            player.position = getRandomSpawnPosition();
            // Set spawn invulnerability to cover entire entry descent
            player.invulnerableUntil = Date.now() + Math.max(gameState.spawnInvulnerableMs, gameState.entryDescentMs);
            roomState.activePlayers.add(playerId);
            
            // Initialize leaderboard entry if not exists
            if (!roomState.leaderboard.has(playerId)) {
                roomState.leaderboard.set(playerId, {
                    kills: 0,
                    deaths: 0,
                    damageDealt: 0,
                    playerName: player.name || `Player ${playerId.slice(-4)}`
                });
            }
        }
    });
    
    console.log(`🎮 Round started in room ${roomId}`);
    io.to(roomId).emit('roundStarted', {
        roundEndTime: roomState.roundEndTime,
        players: Array.from(roomState.activePlayers).map(id => {
            const player = gameState.players.get(id);
            return {
                id: id,
                position: player.position,
                health: player.health,
                vehicleId: player.vehicle?.id || 'balanced'
            };
        })
    });
}

// End a round
function endRound(roomId) {
    const roomState = getRoomGameState(roomId);
    
    roomState.phase = 'roundEnd';
    
    // Sort leaderboard by kills desc, then damage desc, then deaths asc
    const sortedLeaderboard = Array.from(roomState.leaderboard.entries())
        .map(([playerId, stats]) => ({ playerId, ...stats }))
        .sort((a, b) => {
            if (b.kills !== a.kills) return b.kills - a.kills;
            if (b.damageDealt !== a.damageDealt) return b.damageDealt - a.damageDealt;
            return a.deaths - b.deaths;
        });
    
    console.log(`🏁 Round ended in room ${roomId}. Leaderboard:`, sortedLeaderboard);
    
    const nextRoundStartTime = Date.now() + 20000; // 20 seconds
    io.to(roomId).emit('roundEnded', {
        leaderboard: sortedLeaderboard,
        roundStats: {
            totalKills: sortedLeaderboard.reduce((sum, player) => sum + player.kills, 0),
            totalDamage: sortedLeaderboard.reduce((sum, player) => sum + player.damageDealt, 0)
        },
        nextRoundStartTime
    });
    
    // After 20s, start a new round immediately (skip extra waiting phase)
    setTimeout(() => startRound(roomId), 20000);
}

// Start waiting phase
function startWaitingPhase(roomId) {
    const roomState = getRoomGameState(roomId);
    
    roomState.phase = 'waiting';
    roomState.waitingStartTime = Date.now();
    // Allow movement but disable scoring already handled in damage handler
    
    console.log(`⏳ Waiting phase started in room ${roomId}`);
    io.to(roomId).emit('waitingPhaseStarted', {
        waitingEndTime: roomState.waitingStartTime + gameState.waitingDuration
    });
}

// Respawn a player
function respawnPlayer(roomId, playerId) {
    const roomState = getRoomGameState(roomId);
    const player = gameState.players.get(playerId);
    
    if (player && roomState.respawningPlayers.has(playerId)) {
        player.health = player.vehicle?.maxHealth ?? 100;
        player.position = getRandomSpawnPosition();
        // Cover respawn parachute descent fully
        player.invulnerableUntil = Date.now() + Math.max(gameState.spawnInvulnerableMs, gameState.respawnDescentMs);
        roomState.respawningPlayers.delete(playerId);
        roomState.activePlayers.add(playerId);
        
        console.log(`🪂 Player ${playerId} respawned in room ${roomId}`);
        io.to(roomId).emit('playerRespawned', {
            playerId: playerId,
            position: player.position,
            health: player.health,
            vehicleId: player.vehicle?.id || 'balanced'
        });
    }
}

// Get random spawn position
function getRandomSpawnPosition() {
    // Multiple spawn points around the arena to prevent spawn camping (2x bigger arena)
    const spawnPoints = [
        { x: -80, z: -60, y: 1 }, // Top left
        { x: 80, z: -60, y: 1 },  // Top right
        { x: -80, z: 60, y: 1 },  // Bottom left
        { x: 80, z: 60, y: 1 },   // Bottom right
        { x: 0, z: -90, y: 1 },   // Top center
        { x: 0, z: 90, y: 1 },    // Bottom center
        { x: -110, z: 0, y: 1 },  // Left center
        { x: 110, z: 0, y: 1 }    // Right center
    ];
    
    // Pick a random spawn point
    const spawnPoint = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
    
    // Add some random variation to prevent exact same spawn
    const variation = 5;
    return {
        x: spawnPoint.x + (Math.random() * variation * 2 - variation),
        y: spawnPoint.y,
        z: spawnPoint.z + (Math.random() * variation * 2 - variation)
    };
}

// Get random powerup drop position
function getRandomPowerupDropPosition() {
    // Drop powerups anywhere in the arena, avoiding edges
    const arenaSize = { x: 160, z: 120 };
    const margin = 20; // Keep away from walls
    
    return {
        x: (Math.random() - 0.5) * (arenaSize.x - margin * 2),
        y: 25, // Start high for parachute drop
        z: (Math.random() - 0.5) * (arenaSize.z - margin * 2)
    };
}

// Generate unique powerup ID
function generatePowerupId() {
    return 'powerup_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

// Drop a powerup in the room
function dropPowerup(roomId) {
    const roomState = getRoomGameState(roomId);
    const playerCount = roomState.activePlayers.size;
    
    if (playerCount < 2) return; // No powerups for single player
    
    // Determine powerup type (70% health, 30% shield)
    const powerupTypes = ['health', 'health', 'health', 'shield'];
    const powerupType = powerupTypes[Math.floor(Math.random() * powerupTypes.length)];
    
    const powerupId = generatePowerupId();
    const position = getRandomPowerupDropPosition();
    
    const powerup = {
        id: powerupId,
        type: powerupType,
        position: position,
        dropTime: Date.now(),
        collected: false,
        landTime: Date.now() + 3000, // 3 seconds parachute fall time
        despawnTime: Date.now() + 45000 // 45 seconds total lifetime
    };
    
    roomState.powerups.set(powerupId, powerup);
    roomState.lastPowerupDrop = Date.now();
    
    console.log(`🎁 Dropped ${powerupType} powerup in room ${roomId} at (${position.x.toFixed(1)}, ${position.z.toFixed(1)})`);
    
    // Broadcast powerup drop to all players
    io.to(roomId).emit('powerupDropped', {
        id: powerupId,
        type: powerupType,
        position: position,
        landTime: powerup.landTime
    });
}

// Calculate powerup drop frequency based on player count
function getPowerupDropInterval(playerCount) {
    // Base interval: 30 seconds
    // More players = more frequent drops
    // 2 players: 30s, 4 players: 20s, 6+ players: 15s
    const baseInterval = 30000; // 30 seconds
    const reductionPerPlayer = 2500; // 2.5 seconds less per additional player
    const minInterval = 15000; // Minimum 15 seconds
    
    const interval = Math.max(minInterval, baseInterval - (playerCount - 2) * reductionPerPlayer);
    return interval;
}

// Check and manage powerup drops
function managePowerupDrops(roomId) {
    const roomState = getRoomGameState(roomId);
    const now = Date.now();
    const playerCount = roomState.activePlayers.size;
    
    if (roomState.phase !== 'playing' || playerCount < 2) return;
    
    // Check if it's time to drop a new powerup
    const dropInterval = getPowerupDropInterval(playerCount);
    const timeSinceLastDrop = now - roomState.lastPowerupDrop;
    
    if (timeSinceLastDrop >= dropInterval) {
        dropPowerup(roomId);
    }
    
    // Clean up expired powerups
    roomState.powerups.forEach((powerup, powerupId) => {
        if (now > powerup.despawnTime || powerup.collected) {
            roomState.powerups.delete(powerupId);
            io.to(roomId).emit('powerupRemoved', { id: powerupId });
        }
    });
}

// Update collision damage based on collision type
function calculateCollisionDamage(attackingPlayer, targetPlayer, collisionType) {
    const baseSpeed = attackingPlayer.speed || 10;
    
    switch (collisionType) {
        case 'headshot': // Jumping ON a car
            return 100; // Instant kill
        case 'head-on':
            return Math.floor(baseSpeed * 4);
        case 'side':
            return Math.floor(baseSpeed * 2);
        case 'rear':
            return Math.floor(baseSpeed * 1.5);
        default:
            return Math.floor(baseSpeed * 2);
    }
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    
    // Initialize player data
    const player = {
        id: socket.id,
        name: `Player_${socket.id.slice(0, 6)}`,
        position: getRandomSpawnPosition(), // Use random spawn position instead of center
        rotation: 0,
        health: 100,
        vehicle: { id: 'balanced', damageDealtMultiplier: 1.0, damageTakenMultiplier: 1.0, maxHealth: 100 },
        room: null,
        connectedAt: new Date(),
        invulnerableUntil: 0
    };
    
    gameState.players.set(socket.id, player);
    
    // Send initial game state to player
    socket.emit('gameState', {
        playerId: socket.id,
        arena: {
            bounds: { x: 160, z: 120 }, // 2x bigger arena
            wallHeight: 8
        }
    });
    
    // Handle player movement
    socket.on('playerMove', (data) => {
        const player = gameState.players.get(socket.id);
        if (player) {
            // Validate movement data
            if (data.position && data.rotation !== undefined) {
                player.position = data.position;
                player.rotation = data.rotation;
                
                // Broadcast to other players in the same room
                if (player.room) {
                    socket.to(player.room).emit('playerMoved', {
                        playerId: socket.id,
                        position: player.position,
                        rotation: player.rotation
                    });
                }
            }
        }
    });
    
    // Handle vehicle selection from client
    socket.on('vehicleSelected', (data) => {
        const player = gameState.players.get(socket.id);
        if (!player) return;
        const allowed = new Set(['sport', 'balanced', 'tank']);
        const id = allowed.has(data?.vehicleId) ? data.vehicleId : 'balanced';
        // Basic server-side presets to keep in sync with client balance
        const presets = {
            sport: { id: 'sport', damageDealtMultiplier: 0.95, damageTakenMultiplier: 1.2, maxHealth: 80 },
            balanced: { id: 'balanced', damageDealtMultiplier: 1.0, damageTakenMultiplier: 1.0, maxHealth: 100 },
            tank: { id: 'tank', damageDealtMultiplier: 1.25, damageTakenMultiplier: 0.8, maxHealth: 130 },
        };
        player.vehicle = presets[id];
        player.health = Math.min(player.health, player.vehicle.maxHealth);
        // Notify room so others can render appropriate model later if needed
        if (player.room) {
            io.to(player.room).emit('playerVehicleChanged', { playerId: socket.id, vehicleId: id });
        }
        // Always confirm current spawn to this player so client can position correctly
        // We do NOT rely solely on this for invulnerability timing during an 8s parachute.
        // The client will notify us on landing to start the actual protection window.
        socket.emit('playerSpawn', {
            position: player.position,
            health: player.health,
            // Informational only here; authoritative protection begins on 'playerLanded'
            invulnerableMs: 0
        });
    });

    // Handle player damage
    socket.on('playerDamaged', (data) => {
        console.log('🔴 Server received damage event:', data);
        console.log('Attacking player:', socket.id);
        console.log('Target player:', data.targetPlayerId);
        
        const attackingPlayer = gameState.players.get(socket.id);
        const targetPlayerId = data.targetPlayerId;
        const targetPlayer = gameState.players.get(targetPlayerId);
        
        // Validate all required data
        if (!attackingPlayer) {
            console.log('❌ Attacking player not found:', socket.id);
            return;
        }
        
        if (!targetPlayer) {
            console.log('❌ Target player not found:', targetPlayerId);
            console.log('Available players:', Array.from(gameState.players.keys()));
            return;
        }
        
        if (data.damage === undefined || data.damage < 0) {
            console.log('❌ Invalid damage amount:', data.damage);
            return;
        }
        
        if (attackingPlayer.room !== targetPlayer.room) {
            console.log('❌ Players not in same room. Attacker room:', attackingPlayer.room, 'Target room:', targetPlayer.room);
            return;
        }
        
        const roomState = getRoomGameState(attackingPlayer.room);
        
        // Only count damage during playing phase
        if (roomState.phase !== 'playing') {
            console.log('❌ Not in playing phase, ignoring damage');
            return;
        }

        // Enforce invulnerability window: attacker cannot deal, target cannot receive
        const now = Date.now();
        if (attackingPlayer.invulnerableUntil && now < attackingPlayer.invulnerableUntil) {
            console.log('🛡️ Attacker is invulnerable; cannot deal damage yet');
            return;
        }
        if (targetPlayer.invulnerableUntil && now < targetPlayer.invulnerableUntil) {
            console.log('🛡️ Target is invulnerable; ignoring damage');
            return;
        }
        
        // Check shield protection
        if (targetPlayer.shieldUntil && now < targetPlayer.shieldUntil) {
            console.log('🛡️ Target has shield active; ignoring damage');
            return;
        }
        
        console.log('✅ Valid damage event. Target health before:', targetPlayer.health);
        
        let finalDamage;
        if ((data.collisionType || '') === 'monster') {
            // Monster damage: exactly 20% of target max health, ignore multipliers
            const maxH = targetPlayer.vehicle?.maxHealth ?? 100;
            finalDamage = Math.max(0, Math.round(maxH * 0.20));
        } else {
            // Scale damage with vehicle modifiers (server-authoritative)
            const attackerMod = attackingPlayer.vehicle?.damageDealtMultiplier ?? 1.0;
            const targetMod = targetPlayer.vehicle?.damageTakenMultiplier ?? 1.0;
            finalDamage = Math.max(0, Math.round(data.damage * attackerMod * targetMod));
        }

        // Apply damage to the target player
        targetPlayer.health = Math.max(0, targetPlayer.health - finalDamage);
        
        console.log('💥 Target health after damage:', targetPlayer.health);
        
        // Update leaderboard stats (exclude monster/self-inflicted events)
        if ((data.collisionType || '') !== 'monster') {
            const attackerStats = roomState.leaderboard.get(socket.id);
            if (attackerStats) {
                attackerStats.damageDealt += finalDamage;
            }
        }
        
        // Broadcast damage to all players in the room
        io.to(attackingPlayer.room).emit('playerDamaged', {
            playerId: targetPlayerId,
            health: targetPlayer.health,
            damage: finalDamage,
            collisionType: data.collisionType || 'normal',
            attackerId: (data.collisionType || '') === 'monster' ? 'monster' : socket.id
        });
        
        console.log('📡 Broadcasted damage to room:', attackingPlayer.room);
        
        // Check if target player is destroyed
        if (targetPlayer.health <= 0) {
            // Update leaderboard
            const attackerStats = roomState.leaderboard.get(socket.id);
            const targetStats = roomState.leaderboard.get(targetPlayerId);
            
            if (attackerStats) {
                attackerStats.kills++;
            }
            if (targetStats) {
                targetStats.deaths++;
            }
            
            // Remove from active players and start respawn
            roomState.activePlayers.delete(targetPlayerId);
            const respawnTime = Date.now() + gameState.respawnDuration;
            roomState.respawningPlayers.set(targetPlayerId, respawnTime);
            
            console.log('💀 Player destroyed:', targetPlayerId, 'Respawn in 3 seconds');
            
            io.to(attackingPlayer.room).emit('playerDestroyed', { 
                playerId: targetPlayerId,
                respawnTime: respawnTime,
                attackerId: socket.id
            });
        }
    });

    // Client notifies when it has actually landed (end of parachute). Start invulnerability then.
    socket.on('playerLanded', () => {
        const p = gameState.players.get(socket.id);
        if (!p || !p.room) return;
        const now = Date.now();
        p.invulnerableUntil = now + gameState.spawnInvulnerableMs;
        // Echo to client so it can show local indicator with accurate duration
        socket.emit('playerSpawn', {
            position: p.position,
            health: p.health,
            invulnerableMs: gameState.spawnInvulnerableMs
        });
    });
    
    // Handle room joining
    socket.on('joinRoom', (data) => {
        const roomId = data.roomId || 'default';
        const room = gameState.rooms.get(roomId) || [];
        
        if (room.length < gameState.maxPlayersPerRoom) {
            const player = gameState.players.get(socket.id);
            if (player) {
                // Leave current room if any
                if (player.room) {
                    socket.leave(player.room);
                    const currentRoom = gameState.rooms.get(player.room);
                    if (currentRoom) {
                        const index = currentRoom.indexOf(socket.id);
                        if (index > -1) currentRoom.splice(index, 1);
                    }
                }
                
                // Join new room
                socket.join(roomId);
                player.room = roomId;
                room.push(socket.id);
                gameState.rooms.set(roomId, room);
                
                // Assign random spawn position to the player
                player.position = getRandomSpawnPosition();
                // Give invulnerability covering entry descent
                player.invulnerableUntil = Date.now() + Math.max(gameState.spawnInvulnerableMs, gameState.entryDescentMs);
                
                // Initialize game state for the room if needed
                const roomState = getRoomGameState(roomId);
                
                // Initialize leaderboard entry for this player if not exists
                if (!roomState.leaderboard.has(socket.id)) {
                    roomState.leaderboard.set(socket.id, {
                        kills: 0,
                        deaths: 0,
                        damageDealt: 0,
                        playerName: player.name || `Player_${socket.id.slice(0, 6)}`
                    });
                    console.log(`📊 Added player ${socket.id} to leaderboard for room ${roomId}`);
                }
                
                // Send system message about player joining
                const playerName = player.name || `Player_${socket.id.slice(0, 6)}`;
                socket.to(roomId).emit('chatMessage', {
                    playerId: 'system',
                    playerName: 'System',
                    message: `${playerName} joined the arena`,
                    timestamp: new Date().toISOString(),
                    isSystem: true
                });
                
                // If this is the first player, start the round immediately
                if (room.length === 1) {
                    startRound(roomId);
                }
                
                // Send room info to player
                socket.emit('roomJoined', {
                    roomId: roomId,
                    players: room.map(id => ({
                        id: id,
                        name: gameState.players.get(id)?.name || 'Unknown',
                        position: gameState.players.get(id)?.position || { x: 0, y: 0, z: 0 },
                        health: gameState.players.get(id)?.health || 100,
                        vehicleId: gameState.players.get(id)?.vehicle?.id || 'balanced'
                    })),
                    gameState: {
                        phase: roomState.phase,
                        roundEndTime: roomState.roundEndTime,
                        waitingEndTime: roomState.waitingStartTime ? roomState.waitingStartTime + gameState.waitingDuration : null
                    },
                    boostPads: getBoostPads(roomId) // Send boost pad positions
                });
                // Also directly send this player's spawn for reliability
                socket.emit('playerSpawn', {
                    position: player.position,
                    health: player.health,
                    invulnerableMs: gameState.spawnInvulnerableMs
                });

                // Ensure late joiners sync with the current phase immediately
                if (roomState.phase === 'playing') {
                    // Add this player to active players for the current round
                    roomState.activePlayers.add(socket.id);
                    
                    // Build a players payload from current active players; include the joiner if missing
                    const activeIds = Array.from(roomState.activePlayers);
                    const playersPayload = activeIds.map(id => {
                        const p = gameState.players.get(id);
                        return {
                            id,
                            position: p?.position || { x: 0, y: 0, z: 0 },
                            health: p?.health ?? 100,
                            vehicleId: p?.vehicle?.id || 'balanced'
                        };
                    });
                    socket.emit('roundStarted', {
                        roundEndTime: roomState.roundEndTime,
                        players: playersPayload
                    });
                } else if (roomState.phase === 'waiting') {
                    socket.emit('waitingPhaseStarted', {
                        waitingEndTime: roomState.waitingStartTime + gameState.waitingDuration
                    });
                } else if (roomState.phase === 'roundEnd') {
                    // Send current leaderboard snapshot
                    const sorted = Array.from(roomState.leaderboard.entries())
                        .map(([playerId, stats]) => ({ playerId, ...stats }))
                        .sort((a, b) => {
                            if (b.kills !== a.kills) return b.kills - a.kills;
                            if (b.damageDealt !== a.damageDealt) return b.damageDealt - a.damageDealt;
                            return a.deaths - b.deaths;
                        });
                    socket.emit('roundEnded', {
                        leaderboard: sorted,
                        roundStats: {
                            totalKills: sorted.reduce((sum, pl) => sum + pl.kills, 0),
                            totalDamage: sorted.reduce((sum, pl) => sum + pl.damageDealt, 0)
                        }
                    });
                }
                
                // Notify other players in room
                socket.to(roomId).emit('playerJoined', {
                    playerId: socket.id,
                    name: player.name,
                    position: player.position,
                    health: player.health,
                    vehicleId: player.vehicle?.id || 'balanced'
                });
                
                console.log(`Player ${socket.id} joined room ${roomId}`);
            }
        } else {
            socket.emit('roomFull', { roomId: roomId });
        }
    });
    
    // Handle nickname setting
    socket.on('setNickname', (data) => {
        const player = gameState.players.get(socket.id);
        if (player && data.nickname) {
            const sanitizedNickname = data.nickname.trim().substring(0, 16); // Limit to 16 chars
            player.name = sanitizedNickname;
            console.log(`📝 Player ${socket.id} set nickname to: ${sanitizedNickname}`);
            
            // Update leaderboard entry if it exists
            if (player.room) {
                const roomState = getRoomGameState(player.room);
                const leaderboardEntry = roomState.leaderboard.get(socket.id);
                if (leaderboardEntry) {
                    leaderboardEntry.playerName = sanitizedNickname;
                    console.log(`📊 Updated leaderboard name for ${socket.id} to: ${sanitizedNickname}`);
                }
            }
        }
    });

    // Handle chat messages
    socket.on('chatMessage', (data) => {
        const player = gameState.players.get(socket.id);
        if (player && data.message) {
            const sanitizedMessage = data.message.trim().substring(0, 200); // Limit to 200 chars
            const playerName = player.name || `Player_${socket.id.slice(0, 6)}`;
            
            console.log(`💬 Chat message from ${playerName}: ${sanitizedMessage}`);
            
            // Broadcast message to OTHER players in the same room (not sender)
            if (player.room) {
                socket.to(player.room).emit('chatMessage', {
                    playerId: socket.id,
                    playerName: playerName,
                    message: sanitizedMessage,
                    timestamp: new Date().toISOString()
                });
            }
        }
    });

    // Handle powerup collection
    socket.on('collectPowerup', (data) => {
        const player = gameState.players.get(socket.id);
        if (!player || !player.room) return;
        
        const roomState = getRoomGameState(player.room);
        const powerup = roomState.powerups.get(data.powerupId);
        
        if (!powerup || powerup.collected) return;
        
        // Mark powerup as collected
        powerup.collected = true;
        
        console.log(`🎁 Player ${socket.id} collected ${powerup.type} powerup`);
        
        // Apply powerup effect
        if (powerup.type === 'health') {
            // Health powerup restores 40 health
            const maxHealth = player.vehicle?.maxHealth || 100;
            const healthRestore = 40;
            const oldHealth = player.health;
            player.health = Math.min(maxHealth, player.health + healthRestore);
            const actualRestore = player.health - oldHealth;
            
            console.log(`❤️ Player ${socket.id} restored ${actualRestore} health (${oldHealth} → ${player.health})`);
            
            // Broadcast health update
            io.to(player.room).emit('playerDamaged', {
                playerId: socket.id,
                health: player.health,
                damage: -actualRestore, // Negative damage = healing
                collisionType: 'heal',
                attackerId: socket.id
            });
            
        } else if (powerup.type === 'shield') {
            // Shield powerup gives 10 seconds of extra protection
            const shieldDuration = 10000; // 10 seconds
            player.shieldUntil = Date.now() + shieldDuration;
            
            console.log(`🛡️ Player ${socket.id} activated shield for 10 seconds`);
            
            // Notify player about shield
            socket.emit('shieldActivated', {
                duration: shieldDuration,
                endsAt: player.shieldUntil
            });
            
            // Notify others about shield visual
            socket.to(player.room).emit('playerShielded', {
                playerId: socket.id,
                shieldUntil: player.shieldUntil
            });
        }
        
        // Remove powerup from the game
        roomState.powerups.delete(data.powerupId);
        io.to(player.room).emit('powerupCollected', {
            id: data.powerupId,
            playerId: socket.id,
            type: powerup.type
        });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        
        const player = gameState.players.get(socket.id);
        if (player && player.room) {
            // Send system message about player leaving
            const playerName = player.name || `Player_${socket.id.slice(0, 6)}`;
            socket.to(player.room).emit('chatMessage', {
                playerId: 'system',
                playerName: 'System',
                message: `${playerName} left the arena`,
                timestamp: new Date().toISOString(),
                isSystem: true
            });
            // Remove from room
            const room = gameState.rooms.get(player.room);
            if (room) {
                const index = room.indexOf(socket.id);
                if (index > -1) {
                    room.splice(index, 1);
                    if (room.length === 0) {
                        gameState.rooms.delete(player.room);
                    }
                }
            }
            
            // Notify other players
            socket.to(player.room).emit('playerLeft', { playerId: socket.id });
        }
        
        // Remove player from game state
        gameState.players.delete(socket.id);
    });
    
    // Handle chat messages (for future use)
    socket.on('chatMessage', (data) => {
        const player = gameState.players.get(socket.id);
        if (player && data.message && data.message.length <= 200) { // Limit message length
            const messageData = {
                playerId: socket.id,
                playerName: player.name,
                message: data.message,
                timestamp: new Date().toISOString()
            };
            
            if (player.room) {
                io.to(player.room).emit('chatMessage', messageData);
            }
        }
    });

    // Live standings request (for Tab scoreboard)
    socket.on('requestStandings', () => {
        const player = gameState.players.get(socket.id);
        if (!player || !player.room) return;
        const roomId = player.room;
        const roomState = getRoomGameState(roomId);
        // Build sorted leaderboard snapshot
        const sorted = Array.from(roomState.leaderboard.entries())
            .map(([playerId, stats]) => ({ playerId, ...stats }))
            .sort((a, b) => {
                // Sort by kills desc, then damage desc, then deaths asc
                if (b.kills !== a.kills) return b.kills - a.kills;
                if (b.damageDealt !== a.damageDealt) return b.damageDealt - a.damageDealt;
                return a.deaths - b.deaths;
            });
        socket.emit('standings', { leaderboard: sorted, phase: roomState.phase });
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log(`Battle Cars server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Start game state update loop
    setInterval(updateGameStates, 1000); // Update every second
    // Ensure default room is initialized and in waiting state so a round starts promptly
    if (!gameState.rooms.has('default')) {
        gameState.rooms.set('default', []);
    }
    initializeRoomGameState('default');
    // Do not force waiting on boot; let first join trigger startRound immediately
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

module.exports = { app, server, io, gameState }; 