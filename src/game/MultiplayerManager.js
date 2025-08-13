import { io } from 'socket.io-client';

export class MultiplayerManager {
    constructor() {
        this.socket = null;
        this.playerId = null;
        this.players = new Map();
        this.roomId = 'default';
        this.isConnected = false;
        this.onPlayerUpdate = null;
        this.onPlayerJoined = null;
        this.onPlayerLeft = null;
        this.onPlayerDamaged = null;
        this.onPlayerDestroyed = null;
        this.onGameStateUpdate = null;
        this.onWaitingPhaseStarted = null;
        this.onRoundStarted = null;
        this.onRoundEnded = null;
        this.onPlayerRespawned = null;
        this.onPowerupDropped = null;
        this.onPowerupCollected = null;
        this.onPowerupRemoved = null;
        this.onShieldActivated = null;
        this.onPlayerShielded = null;
        this.onChatMessage = null;
        this.onPlayerVehicleChanged = null;
    }

    connect(initialNickname = null) {
        this.initialNickname = initialNickname;
        this.socket = io('http://localhost:3001');
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.isConnected = true;
            this.playerId = this.socket.id;
            console.log('🎯 Player ID set to:', this.playerId);
            
            // If we have an initial nickname, send it BEFORE joining the room
            if (this.initialNickname && typeof this.initialNickname === 'string') {
                this.socket.emit('setNickname', { nickname: this.initialNickname });
            }

            // Join default room after nickname set to ensure system message uses it
            this.joinRoom(this.roomId);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.isConnected = false;
        });

        this.socket.on('gameState', (data) => {
            // Don't overwrite playerId - it's already set correctly in connect()
            if (this.onGameStateUpdate) {
                this.onGameStateUpdate(data);
            }
        });

        this.socket.on('roomJoined', (data) => {
            console.log('Joined room:', data.roomId);
            this.roomId = data.roomId;
            
            // Add existing players to our local state
            data.players.forEach(player => {
                if (player.id !== this.playerId) {
                    this.players.set(player.id, player);
                }
            });
            
            // Store game state info
            this.gameState = data.gameState || {};
            
            // Store boost pad positions
            this.boostPads = data.boostPads || [];
            console.log('🎯 Received boost pads from server:', this.boostPads);
            console.log('🎯 Full roomJoined data:', data);
            
            if (this.onGameStateUpdate) {
                this.onGameStateUpdate({ players: Array.from(this.players.values()) });
            }
        });

        this.socket.on('playerJoined', (data) => {
            console.log('Player joined:', data.playerId);
            this.players.set(data.playerId, {
                id: data.playerId,
                name: data.name,
                position: data.position,
                health: data.health,
                vehicleId: data.vehicleId || 'balanced'
            });
            
            if (this.onPlayerJoined) {
                this.onPlayerJoined(data);
            }
        });

        this.socket.on('playerLeft', (data) => {
            console.log('Player left:', data.playerId);
            this.players.delete(data.playerId);
            
            if (this.onPlayerLeft) {
                this.onPlayerLeft(data);
            }
        });

        this.socket.on('playerMoved', (data) => {
            const player = this.players.get(data.playerId);
            if (player) {
                player.position = data.position;
                player.rotation = data.rotation;
                
                if (this.onPlayerUpdate) {
                    this.onPlayerUpdate(data);
                }
            }
        });

        this.socket.on('playerVehicleChanged', (data) => {
            const p = this.players.get(data.playerId);
            if (p) p.vehicleId = data.vehicleId;
            if (this.onPlayerVehicleChanged) {
                this.onPlayerVehicleChanged(data);
            }
        });

        this.socket.on('playerDamaged', (data) => {
            console.log('🔴 MultiplayerManager received playerDamaged event:', data);
            
            // Check if this is damage to the local player
            if (data.playerId === this.playerId) {
                console.log('💥 Local player damaged! Health:', data.health);
                if (this.onPlayerDamaged) {
                    this.onPlayerDamaged(data);
                }
            } else {
                // This is damage to another player
                const player = this.players.get(data.playerId);
                if (player) {
                    player.health = data.health;
                    
                    if (this.onPlayerDamaged) {
                        this.onPlayerDamaged(data);
                    }
                }
            }
        });

        this.socket.on('playerDestroyed', (data) => {
            console.log('Player destroyed:', data.playerId);
            this.players.delete(data.playerId);
            
            if (this.onPlayerDestroyed) {
                this.onPlayerDestroyed(data);
            }
        });

        this.socket.on('roomFull', (data) => {
            console.log('Room is full:', data.roomId);
        });
        
        // New game state events
        this.socket.on('waitingPhaseStarted', (data) => {
            console.log('⏳ Waiting phase started, ends at:', new Date(data.waitingEndTime));
            this.gameState = { phase: 'waiting', waitingEndTime: data.waitingEndTime };
            if (this.onWaitingPhaseStarted) {
                this.onWaitingPhaseStarted(data);
            }
        });
        
        this.socket.on('roundStarted', (data) => {
            console.log('🎮 Round started, ends at:', new Date(data.roundEndTime));
            this.gameState = { phase: 'playing', roundEndTime: data.roundEndTime };
            if (this.onRoundStarted) {
                this.onRoundStarted(data);
            }
        });

        // Explicit spawn message for reliable local positioning
        this.socket.on('playerSpawn', (data) => {
            // data: { position, health }
            if (this.onPlayerSpawn) {
                this.onPlayerSpawn(data);
            }
        });
        
        this.socket.on('roundEnded', (data) => {
            console.log('🏁 Round ended. Leaderboard:', data.leaderboard);
            this.gameState = { phase: 'roundEnd' };
            if (this.onRoundEnded) {
                this.onRoundEnded(data);
            }
        });
        
        this.socket.on('playerRespawned', (data) => {
            console.log('🪂 Player respawned:', data.playerId);
            if (this.onPlayerRespawned) {
                this.onPlayerRespawned(data);
            }
        });

        // Live standings from server
        this.socket.on('standings', (data) => {
            if (this.onStandings) this.onStandings(data);
        });

        // Powerup events
        this.socket.on('powerupDropped', (data) => {
            console.log('🎁 Powerup dropped:', data);
            if (this.onPowerupDropped) {
                this.onPowerupDropped(data);
            }
        });

        this.socket.on('powerupCollected', (data) => {
            console.log('🎁 Powerup collected:', data);
            if (this.onPowerupCollected) {
                this.onPowerupCollected(data);
            }
        });

        this.socket.on('powerupRemoved', (data) => {
            console.log('🎁 Powerup removed:', data);
            if (this.onPowerupRemoved) {
                this.onPowerupRemoved(data);
            }
        });

        this.socket.on('shieldActivated', (data) => {
            console.log('🛡️ Shield activated:', data);
            if (this.onShieldActivated) {
                this.onShieldActivated(data);
            }
        });

        this.socket.on('playerShielded', (data) => {
            console.log('🛡️ Player shielded:', data);
            if (this.onPlayerShielded) {
                this.onPlayerShielded(data);
            }
        });

        this.socket.on('chatMessage', (data) => {
            console.log('💬 Chat message received:', data);
            if (this.onChatMessage) {
                this.onChatMessage(data);
            }
        });
    }

    joinRoom(roomId) {
        if (this.socket && this.isConnected) {
            this.roomId = roomId;
            this.socket.emit('joinRoom', { roomId: roomId });
        }
    }

    sendPlayerMove(position, rotation) {
        if (this.socket && this.isConnected) {
            this.socket.emit('playerMove', {
                position: position,
                rotation: rotation
            });
        }
    }

    sendVehicleSelection(vehicleId) {
        if (this.socket && this.isConnected) {
            this.socket.emit('vehicleSelected', { vehicleId });
        }
    }

    sendPlayerDamage(damage, targetPlayerId, collisionType = 'normal') {
        if (this.socket && this.isConnected) {
            this.socket.emit('playerDamaged', {
                damage: damage,
                targetPlayerId: targetPlayerId,
                collisionType: collisionType
            });
        }
    }

    notifyPlayerLanded() {
        if (this.socket && this.isConnected) {
            this.socket.emit('playerLanded');
        }
    }

    collectPowerup(powerupId) {
        if (this.socket && this.isConnected) {
            console.log('🎁 Requesting powerup collection:', powerupId);
            this.socket.emit('collectPowerup', {
                powerupId: powerupId
            });
        }
    }

    sendNickname(nickname) {
        if (this.socket && this.isConnected) {
            console.log('📝 Sending nickname:', nickname);
            this.socket.emit('setNickname', {
                nickname: nickname
            });
        }
    }

    sendChatMessage(message) {
        if (this.socket && this.isConnected) {
            console.log('💬 Sending chat message:', message);
            this.socket.emit('chatMessage', {
                message: message
            });
        }
    }

    getPlayerCount() {
        return this.players.size + 1; // +1 for current player
    }

    getPlayers() {
        return Array.from(this.players.values());
    }
    
    getBoostPads() {
        return this.boostPads || [];
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
            this.players.clear();
        }
    }

    requestStandings() {
        if (this.socket && this.isConnected) {
            this.socket.emit('requestStandings');
        }
    }
} 