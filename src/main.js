// Import Three.js from local dependency for reliability during dev
import * as THREE from 'three';
import { Car } from './game/Car.js';
import { Arena } from './game/Arena.js';
import { InputManager } from './game/InputManager.js';
import { GameUI } from './game/GameUI.js';
import { MultiplayerManager } from './game/MultiplayerManager.js';
import { OtherPlayers } from './game/OtherPlayers.js';
import { HybridSoundManager } from './game/HybridSoundManager.js';
import { PowerupManager } from './game/PowerupManager.js';
import { VEHICLES, getVehicleById } from './game/Vehicles.js';

class BattleCarsGame {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.car = null;
        this.arena = null;
        this.inputManager = null;
        this.gameUI = null;
        this.soundManager = null;
        this.powerupManager = null;
        this.clock = new THREE.Clock();
        this.isRunning = false;
        this.lastCollisionTime = 0; // Track last collision time to prevent spam
        this.lastHealthBarUpdate = 0; // Track last health bar update to prevent flickering
        this.isInSelector = false;
        this.selectorStartTime = 0;
        this._mirrorVisible = false;
        this._mirrorAlpha = 0;
        this._mirrorTargetAlpha = 0;
        this.prevMyPos = new THREE.Vector3();
        this._pendingSpawn = null;
        this._hasEntered = false;
        this._parachuteCountdownEl = null;
        this._parachuteCountdownTimer = null;
        this._pendingNickname = null;
        // Radar/minimap state
        this._radarCanvas = null;
        this._radarCtx = null;
        this._radarSize = 160; // px
        this._radarPadding = 10;
        this._loadingHidden = false;
        // Per-pad boost trigger bookkeeping
        this._rampTriggerState = new Map(); // rampId -> inside boolean
        this._rampLastTriggerAt = new Map(); // rampId -> ms timestamp
        this._rampCooldownMs = 900; // minimal delay between triggers per pad
        this.isDead = false;
        this._allowScoreboard = false; // TAB scoreboard only during active play
        
        this.init();
    }

    // Convert world position (THREE.Vector3 or {x,y,z}) to screen space for HUD anchoring
    _worldToScreen(worldPos) {
        try {
            if (!worldPos || !this.camera || !this.renderer) return { isScreen: true, screenX: window.innerWidth * 0.72, screenY: window.innerHeight * 0.38 };
            const v = new THREE.Vector3(worldPos.x || 0, worldPos.y || 0, worldPos.z || 0);
            v.project(this.camera);
            const screenX = (v.x + 1) / 2 * window.innerWidth;
            const screenY = (1 - v.y) / 2 * window.innerHeight;
            return { isScreen: true, screenX, screenY };
        } catch (e) {
            return { isScreen: true, screenX: window.innerWidth * 0.72, screenY: window.innerHeight * 0.38 };
        }
    }
    
    init() {
        // Initialize Three.js scene
        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupLights();
        
        // Initialize game components
        this.arena = new Arena(this.scene);
        // Provide a back-reference so Car can query slick patches
        this.scene.__arenaRef = this.arena;
        // Delay car creation until player chooses a vehicle
        this.car = null;
        this.inputManager = new InputManager();
        this.gameUI = new GameUI();
        this.soundManager = new HybridSoundManager();
        this.powerupManager = new PowerupManager(this.scene, this.soundManager);
        // Set arena bounds so drones know where to drop
        if (this.arena && this.arena.getBounds) {
            const b = this.arena.getBounds();
            this.powerupManager.setArenaBounds(b);
        }
        // Provide ground height sampler so crates land on top of platforms/ramps
        this.powerupManager.setHeightSampler((x, z) => {
            // Default ground level
            let groundY = 1;
            // Ramp height
            const r = this.arena?.rampSurface;
            if (r) {
                const insideRampXZ = Math.abs(x - r.x) <= r.halfW && z >= r.zStart && z <= r.zEnd;
                if (insideRampXZ) {
                    const t = (z - r.zStart) / Math.max(0.0001, (r.zEnd - r.zStart));
                    groundY = Math.max(groundY, r.y0 + t * (r.y1 - r.y0));
                }
            }
            // Platform deck
            const p = this.arena?.platformSurface;
            if (p) {
                if (Math.abs(x - p.x) <= p.halfW && Math.abs(z - p.z) <= p.halfD) {
                    groundY = Math.max(groundY, p.y);
                }
            }
            return groundY;
        });
        // Provide placement info to avoid half-overlaps with platform edges
        this.powerupManager.setPlacementInfoProvider((x, z) => {
            const info = { nearPlatformEdge: false, push: { x: 0, z: 0 } };
            const p = this.arena?.platformSurface;
            if (p) {
                const overDeck = Math.abs(x - p.x) <= p.halfW && Math.abs(z - p.z) <= p.halfD;
                const nearX = Math.abs(Math.abs(x - p.x) - p.halfW) < 1.4; // within 1.4u of side
                const nearZ = Math.abs(Math.abs(z - p.z) - p.halfD) < 1.4;
                if (overDeck && (nearX || nearZ)) {
                    info.nearPlatformEdge = true;
                    if (nearX) info.push.x = (x < p.x ? -1 : 1) * -1.2; // nudge inward
                    if (nearZ) info.push.z = (z < p.z ? -1 : 1) * -1.2;
                } else {
                    // If spawned outside but too close to wall face, push outward
                    const tooCloseX = Math.abs(x - p.x) <= (p.halfW + 0.6) && Math.abs(z - p.z) <= (p.halfD + 0.6);
                    if (tooCloseX && !overDeck) {
                        info.nearPlatformEdge = true;
                        info.push.x = (x < p.x ? -1 : 1) * -1.0;
                        info.push.z = (z < p.z ? -1 : 1) * -1.0;
                    }
                }
            }
            return info;
        });

        // TAB scoreboard handlers
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                if (this._allowScoreboard && this.multiplayer && this.multiplayer.requestStandings) {
                    this.multiplayer.requestStandings();
                }
                // While holding Tab, poll standings every 500ms
                if (this._allowScoreboard && !this._scoreboardPoll) {
                    this._scoreboardPoll = setInterval(() => {
                        if (this._allowScoreboard && this.multiplayer && this.multiplayer.requestStandings) {
                            this.multiplayer.requestStandings();
                        }
                    }, 500);
                }
            }
        });
        window.addEventListener('keyup', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                this.gameUI.hideScoreboard();
                if (this._scoreboardPoll) {
                    clearInterval(this._scoreboardPoll);
                    this._scoreboardPoll = null;
                }
            }
        });
        
        // Initialize multiplayer
        this.multiplayer = new MultiplayerManager();
        this.otherPlayers = new OtherPlayers(this.scene);
        // Provide car position provider for arena light shadow selection once car spawns
        this.arena.setCarPositionProvider(() => {
            if (this.car && this.car.carGroup) return this.car.carGroup.position;
            return null;
        });
        
        // Show nickname entry, then vehicle selection, then continue boot
        this.gameUI.showNicknameEntry((nickname) => {
            // Store the nickname
            this.playerNickname = nickname;
            console.log(`🎯 Player set nickname to: ${nickname}`);
            
            // Connect now with nickname so the server's join message uses it
            if (this.multiplayer && !this.multiplayer.isConnected) {
                this.multiplayer.connect(nickname);
            } else if (this.multiplayer && this.multiplayer.isConnected) {
                this.multiplayer.sendNickname(nickname);
            } else {
                this._pendingNickname = nickname;
            }
            
            // Now show vehicle selection
            this.gameUI.showVehicleSelect(VEHICLES, (vehicleId) => {
            this.selectedVehicleId = vehicleId;
            const preset = getVehicleById(vehicleId);
            this.car = new Car(this.scene, preset);
            // inform server of our choice
            if (this.multiplayer && this.multiplayer.isConnected) {
                this.multiplayer.sendVehicleSelection(vehicleId);
                // Also send nickname if we have one
                if (this._pendingNickname) {
                    this.multiplayer.sendNickname(this._pendingNickname);
                    this._pendingNickname = null;
                }
            } else {
                // if not yet connected, send after connect
                const wait = setInterval(() => {
                    if (this.multiplayer && this.multiplayer.isConnected) {
                        this.multiplayer.sendVehicleSelection(vehicleId);
                        // Also send nickname if we have one
                        if (this._pendingNickname) {
                            this.multiplayer.sendNickname(this._pendingNickname);
                            this._pendingNickname = null;
                        }
                        clearInterval(wait);
                    }
                }, 250);
            }
            // Stop selector camera and position camera to follow car
            this.isInSelector = false;
            this.camera.position.set(0, 15, 20);
            this.camera.lookAt(0, 0, 0);
            // Start game loop once car exists
            this.isRunning = true; // already running, ensure flag stays true
            if (this.soundManager) {
                this.soundManager.startEngine();
                this.soundManager.startAmbientSounds();
                // Keep anthem running; fade will be triggered by parachute sequence timing
            }
            // Ensure HUD shows 100% relative to selected vehicle
            this.gameUI.updateHealth(this.car.health, this.car.maxHealth);
            // Show rear-view mirror now that we are in the arena
            this.setMirrorVisible(true);

            // Apply any pending spawn received before car was created
            if (this._pendingSpawn) {
                // First-time entry: perform an 8s parachute drop from higher up with countdown
                if (!this._hasEntered) {
                    this.startParachuteLanding(this._pendingSpawn.position, this._pendingSpawn.health, { duration: 8.0, startHeight: 110, countdownSeconds: 8 });
                    this._hasEntered = true;
                } else {
                    this._applyLocalSpawn(this._pendingSpawn.position, this._pendingSpawn.health);
                }
                this._pendingSpawn = null;
            }
        });
        }); // Close nickname callback

        // Setup multiplayer event handlers
        this.setupMultiplayerHandlers();
        
        // Connection happens after nickname submission so chat shows the chosen name
        
        // Setup chat system
        this.setupChatSystem();
        // Hook settings UI
        this.setupSettingsUI();
        // Create radar overlay
        this.createRadarOverlay();

        // Stripe fundamentals: detect availability and expose a helper
        this.stripePublicKey = null;
        fetch('/api/stripe/config').then(r => r.json()).then(cfg => {
            if (cfg && cfg.active) {
                this.stripePublicKey = cfg.publicKey || null;
                console.log('💳 Stripe available');
            } else {
                console.log('💳 Stripe not configured');
            }
        }).catch(() => {});
        
        // Start spectator camera and render loop while in selector
        this.isInSelector = true;
        this.selectorStartTime = this.clock.getElapsedTime();
        this.isRunning = true;
        this.setMirrorVisible(false); // hide mirror during selector
        this.animate();
        // Ambient sounds can run during selector
        if (this.soundManager) {
            // On first user input (click/keydown), unlock audio and start anthem
            const unlock = () => {
                this.soundManager.unlockAudio();
                this.soundManager.playAnthemLoop();
                window.removeEventListener('click', unlock);
                window.removeEventListener('keydown', unlock);
            };
            window.addEventListener('click', unlock, { once: true });
            window.addEventListener('keydown', unlock, { once: true });
            this.soundManager.startAmbientSounds();
            // Attempt muted autoplay immediately; will fade up if allowed
            this.soundManager.playAnthemLoop();
        }
        
        // Defer hiding loading screen until the first rendered frame
        this._loadingHidden = false;
    }

    // Minimal helper: start a checkout session (for later hook-up to shop UI)
    startCheckout(priceId, metadata = {}) {
        return fetch('/api/stripe/create-checkout-session', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priceId, metadata })
        }).then(r => r.json()).then(d => { if (d.url) window.location.href = d.url; return d; });
    }
    
    setupMultiplayerHandlers() {
        // Handle player updates
        this.multiplayer.onPlayerUpdate = (data) => {
            this.otherPlayers.updatePlayer(data.playerId, data.position, data.rotation);
        };
        
        // Handle new players joining
        this.multiplayer.onPlayerJoined = (data) => {
            this.otherPlayers.addPlayer(data.playerId, data.position, data.health, data.vehicleId);
            this.gameUI.updatePlayerCount(this.multiplayer.getPlayerCount());
        };
        
        // Handle players leaving
        this.multiplayer.onPlayerLeft = (data) => {
            this.otherPlayers.removePlayer(data.playerId);
            this.gameUI.updatePlayerCount(this.multiplayer.getPlayerCount());
        };
        
        // Handle player damage
        this.multiplayer.onPlayerDamaged = (data) => {
            console.log('🔴 Damage event received:', data);
            console.log('Local player ID:', this.multiplayer.playerId);
            console.log('Damaged player ID:', data.playerId);
            
            // Ignore damage events during our local invulnerability window (visuals may still pulse)
            if (data.playerId === this.multiplayer.playerId && this.car && this.car.invulnerableUntil) {
                const now = (performance.now ? performance.now() : Date.now());
                if (now < this.car.invulnerableUntil) {
                    console.log('🛡️ Locally invulnerable; ignoring incoming damage visuals');
                    return;
                }
            }

            // Update other player's health
            // Get the target player's vehicle to determine correct maxHealth
            const targetPlayer = this.multiplayer.getPlayers().find(p => p.id === data.playerId);
            const targetVehicleId = targetPlayer?.vehicleId || 'balanced';
            const targetMaxHealth = getVehicleById(targetVehicleId).maxHealth;
            this.otherPlayers.updatePlayerHealth(data.playerId, data.health, targetMaxHealth);
            
            // If this is damage to the local player, apply it
            if (data.playerId === this.multiplayer.playerId) {
                console.log('💥 Local player taking damage! Health before:', this.car.health, 'Health after:', data.health);
                // The damage amount is calculated on the server, so we just update our health
                this.car.health = Math.max(0, Math.min(this.car.maxHealth, data.health));
                this.gameUI.updateHealth(this.car.health, this.car.maxHealth);
                // Show incoming damage number for monster hits (no % symbol)
                if (data.collisionType === 'monster') {
                    const myPos = this.car?.carGroup?.position?.clone();
                    if (myPos) myPos.y += 2; // lift above car
                    const screenPos = this._worldToScreen(myPos);
                    this.gameUI.showDamageNumber('-20', screenPos, 'monster', false);
                }
            }

            // Play a cheering sound on headshots for everyone EXCEPT the attacker (they already played it locally)
            if (data.collisionType === 'headshot' && this.soundManager && data.attackerId !== this.multiplayer.playerId) {
                this.soundManager.playCollisionSound('headshot', 1.2);
            }

            // For monster events, do not render an outgoing damage number even if attackerId matches us
            if (data.collisionType === 'monster') {
                return;
            }

            // Update local damage dealt if attacker is us (best-effort; server aggregates for leaderboard)
            if (data.attackerId === this.multiplayer.playerId) {
                this._localStats = this._localStats || { kills: 0, deaths: 0, damageDealt: 0, headshots: 0 };
                this._localStats.damageDealt += (data.damage || 0);
                if (data.collisionType === 'headshot') this._localStats.headshots += 1;
                this.gameUI.updateScoreStats(this._localStats);
                // Show server-verified damage number at target's screen position
                const target = this.multiplayer.players.get(data.playerId);
                const tp = target?.position ? new THREE.Vector3(target.position.x, (target.position.y || 1) + 2, target.position.z) : null;
                const screenPos = this._worldToScreen(tp);
                this.gameUI.showDamageNumber(data.damage || 0, screenPos, data.collisionType || 'normal', true);
                
                // Log damage for debugging
                console.log(`💥 Dealt ${data.damage} damage to player ${data.playerId} (${data.collisionType})`);
            }
        };
        
        // Handle player destruction
        this.multiplayer.onPlayerDestroyed = (data) => {
            console.log('💀 Player destroyed:', data.playerId, 'Respawn time:', new Date(data.respawnTime));
            
            if (data.playerId === this.multiplayer.playerId) {
                // Local player destroyed - freeze and show overlay
                console.log('🪦 Local player destroyed, waiting for respawn');
                this.isDead = true;
                if (this.car) {
                    this.car.speed = 0;
                    this.car.momentum = 0;
                    this.car.velocity.set(0, 0, 0);
                }
                if (this.gameUI && this.gameUI.showDeathOverlay) {
                    this.gameUI.showDeathOverlay();
                }
            } else {
                // Other player destroyed
                this.otherPlayers.removePlayer(data.playerId);
                this.gameUI.updatePlayerCount(this.multiplayer.getPlayerCount());
            }
        };
        
        // Handle game state updates
        this.multiplayer.onGameStateUpdate = (data) => {
            if (data.players) {
                // Add existing players to scene
                data.players.forEach(player => {
                    this.otherPlayers.addPlayer(player.id, player.position, player.health, player.vehicleId);
                });
                this.gameUI.updatePlayerCount(this.multiplayer.getPlayerCount());

                // Capture our server-provided spawn to apply to local car
                const me = data.players.find(p => p.id === this.multiplayer.playerId);
                if (me && me.position) {
                    if (this.car) {
                        this._applyLocalSpawn(me.position, me.health);
                    } else {
                        this._pendingSpawn = { position: me.position, health: me.health };
                    }
                }
            }
        };
        
        // Handle room joined - create boost pads from server data
        this.multiplayer.onRoomJoined = (data) => {
            console.log('🎯 Room joined, creating boost pads from server data');
            if (data.boostPads && data.boostPads.length > 0) {
                this.arena.createBoostPadsFromServer(data.boostPads);
            } else {
                console.log('⚠️ No boost pads received from server, creating fallback boost pads');
                // Create fallback boost pads if server doesn't provide them
                const fallbackBoostPads = [
                    { x: 30, z: 20, rotation: 0.5 },
                    { x: -25, z: -35, rotation: 2.1 }
                ];
                this.arena.createBoostPadsFromServer(fallbackBoostPads);
            }

            // Apply our spawn from the room snapshot so we don't start at the center
            if (data && Array.isArray(data.players)) {
                const me = data.players.find(p => p.id === this.multiplayer.playerId);
                if (me && me.position) {
                    if (this.car) {
                        this._applyLocalSpawn(me.position, me.health);
                    } else {
                        this._pendingSpawn = { position: me.position, health: me.health };
                    }
                }
            }
        };
        
        // Handle waiting phase
        this.multiplayer.onWaitingPhaseStarted = (data) => {
            console.log('⏳ Waiting phase started');
            this.gameUI.updateGamePhase('waiting', data.waitingEndTime);
        };
        
        // Handle round start
        this.multiplayer.onRoundStarted = (data) => {
            console.log('🎮 Round started');
            this.gameUI.updateGamePhase('playing', data.roundEndTime);
            this._allowScoreboard = true;
            // Ensure anthem fades out over last 3 seconds of the landing spawn (handled in parachute updater)

            // Ensure any end-of-round leaderboard is removed now
            if (this._leaderboardOverlay && this._leaderboardOverlay.parentNode) {
                this._leaderboardOverlay.parentNode.removeChild(this._leaderboardOverlay);
                this._leaderboardOverlay = null;
            }
            // Also cancel any scoreboard polling left over
            if (this._scoreboardPoll) {
                clearInterval(this._scoreboardPoll);
                this._scoreboardPoll = null;
            }
            
            // Reset all players positions
            data.players.forEach(player => {
                if (player.id !== this.multiplayer.playerId) {
                    this.otherPlayers.addPlayer(player.id, player.position, player.health, player.vehicleId || 'balanced');
                } else {
                    // Always perform the long 8s parachute entry at the start of every new round
                    if (this.car) {
                        this.car.setInvulnerableFor(8000);
                        this._showShieldIndicator(8000);
                        this.startParachuteLanding(player.position, player.health, { duration: 8.0, startHeight: 110, countdownSeconds: 8 });
                        // Anthem fade is triggered in updateParachuteLanding's last 3s
                        this._hasEntered = true;
                    } else {
                        this._pendingSpawn = { position: player.position, health: player.health };
                    }
                }
            });
        };

        // Handle direct spawn message (most reliable)
        this.multiplayer.onPlayerSpawn = (data) => {
            if (!data) return;
            // Apply local invulnerability if provided by server
            if (this.car && data.invulnerableMs && typeof data.invulnerableMs === 'number') {
                this.car.setInvulnerableFor(data.invulnerableMs);
                this._showShieldIndicator(data.invulnerableMs);
            }
            if (!this._hasEntered) {
                if (this.car) {
                    this.startParachuteLanding(data.position, data.health, { duration: 8.0, startHeight: 110, countdownSeconds: 8 });
                    this._hasEntered = true;
                } else {
                    this._pendingSpawn = { position: data.position, health: data.health };
                }
            } else {
                if (this.car) {
                    this._applyLocalSpawn(data.position, data.health);
                } else {
                    this._pendingSpawn = { position: data.position, health: data.health };
                }
            }
        };
        
        // Handle round end
        this.multiplayer.onRoundEnded = (data) => {
            console.log('🏁 Round ended');
            this.gameUI.updateGamePhase('roundEnd');
            this.gameUI.clearTimer();
            this._allowScoreboard = false;
            // Start anthem during intermission/leaderboard
            if (this.soundManager) {
                this.soundManager.playAnthemLoop();
            }
            // Hide any TAB scoreboard and stop polling immediately
            this.gameUI.hideScoreboard();
            if (this._scoreboardPoll) { clearInterval(this._scoreboardPoll); this._scoreboardPoll = null; }
            
            // Ensure TAB scoreboard is closed to avoid overlap
            this.gameUI.hideScoreboard();
            const sb = document.getElementById('scoreboardOverlay');
            if (sb) sb.style.display = 'none';
            // Show leaderboard (independent panel)
            this.showLeaderboard(data.leaderboard, data.nextRoundStartTime);
            if (data.nextRoundStartTime) {
                this.gameUI.showNextRoundCountdown(data.nextRoundStartTime);
            }

            // If server includes our id in leaderboard, reflect exact stats on HUD
            const me = data.leaderboard?.find?.(p => p.playerId === this.multiplayer.playerId);
            if (me) {
                this._localStats = this._localStats || { kills: 0, deaths: 0, damageDealt: 0, headshots: 0 };
                this._localStats.kills = me.kills ?? this._localStats.kills;
                this._localStats.deaths = me.deaths ?? this._localStats.deaths;
                this._localStats.damageDealt = me.damageDealt ?? this._localStats.damageDealt;
                // headshots not tracked server-side; keep local counter
                this.gameUI.updateScoreStats(this._localStats);
            }
        };

        // Handle live standings for scoreboard
        this.multiplayer.onStandings = (data) => {
            // Only show the TAB scoreboard during active play; otherwise force-hide
            if (this._allowScoreboard && data && data.phase === 'playing' && data.leaderboard) {
                this.gameUI.showScoreboard(data.leaderboard);
            } else {
                this.gameUI.hideScoreboard();
            }
        };
        
        // Handle player respawn
        this.multiplayer.onPlayerRespawned = (data) => {
            console.log('🪂 Player respawned:', data.playerId);
            
            if (data.playerId === this.multiplayer.playerId) {
                // Local player respawned - start 3s parachute landing with countdown
                // Make player invulnerable for the entire descent (3s)
                if (this.car && this.car.setInvulnerableFor) {
                    this.car.setInvulnerableFor(3000);
                    this._showShieldIndicator(3000);
                }
                this.isDead = false;
                this.startParachuteLanding(data.position, data.health, { duration: 3.0, startHeight: 50, countdownSeconds: 3 });
            } else {
                // Other player respawned
                this.otherPlayers.addPlayer(data.playerId, data.position, data.health, data.vehicleId || 'balanced');
                // Mark remote player temporary invulnerability and show shield ring
                const grp = this.otherPlayers.players.get(data.playerId);
                if (grp) {
                    const until = Date.now() + 2000;
                    grp.userData.invulnerableUntil = until;
                    if (this.otherPlayers.activateShield) {
                        this.otherPlayers.activateShield(data.playerId, until);
                    }
                }
            }
        };

        // Handle powerup events
        this.multiplayer.onPowerupDropped = (data) => {
            this.powerupManager.dropPowerup(data);
        };

        this.multiplayer.onPowerupCollected = (data) => {
            this.powerupManager.removePowerup(data.id);
            // Show collection effect
            if (data.playerId === this.multiplayer.playerId) {
                console.log(`✨ You collected a ${data.type} powerup!`);
                this.gameUI.showPowerupCollected(data.type);
                if (this.soundManager && this.soundManager.playPowerupSound) {
                    this.soundManager.playPowerupSound(data.type);
                }
            }
        };

        this.multiplayer.onPowerupRemoved = (data) => {
            this.powerupManager.removePowerup(data.id);
        };

        // Ensure we recreate opponent vehicle meshes when they change selection
        this.multiplayer.onPlayerVehicleChanged = (data) => {
            if (!data || !data.playerId || data.playerId === this.multiplayer.playerId) return;
            const p = this.multiplayer.players.get(data.playerId);
            const health = p?.health ?? 100;
            // Recreate opponent with the new vehicleId to apply correct color/model
            this.otherPlayers.addPlayer(data.playerId, p?.position || { x: 0, y: 0, z: 0 }, health, data.vehicleId || 'balanced');
        };

        this.multiplayer.onShieldActivated = (data) => {
            console.log(`🛡️ Shield activated for ${data.duration}ms`);
            this._showShieldIndicator(data.duration);
            // Show persistent HUD banner with countdown until shield ends
            if (data.endsAt) {
                this.gameUI.showShieldActive(data.endsAt);
            } else {
                // Fallback when only duration provided
                this.gameUI.showShieldActive(Date.now() + (data.duration || 10000));
            }
        };

        this.multiplayer.onPlayerShielded = (data) => {
            // Show shield effect on other player
            console.log(`🛡️ Player ${data.playerId} activated shield`);
            if (this.otherPlayers) {
                this.otherPlayers.activateShield(data.playerId, data.shieldUntil || (Date.now() + 10000));
            }
            // If it's our local player echoed back, also ensure HUD banner is shown
            if (data.playerId === this.multiplayer.playerId) {
                this.gameUI.showShieldActive(data.shieldUntil || (Date.now() + 10000));
            }
        };

        this.multiplayer.onChatMessage = (data) => {
            // Display chat message
            console.log('💬 Received chat message from server:', data);
            
            // Skip if this is our own message (shouldn't happen with socket.to() but just in case)
            if (data.playerId && this.multiplayer.socket && data.playerId === this.multiplayer.socket.id) {
                console.log('💬 Skipping own message received from server');
                return;
            }
            
            this.addChatMessage(data.playerName, data.message, data.isSystem);
        };
    }
    
    setupChatSystem() {
        const chatMessages = document.getElementById('chatMessages');
        const chatInput = document.getElementById('chatInput');
        const chatInputOverlay = document.getElementById('chatInputOverlay');
        
        if (!chatMessages || !chatInput || !chatInputOverlay) {
            console.warn('Chat elements not found in DOM');
            return;
        }
        
        // Track chat typing state
        this.chatTyping = false;
        this.chatMessageHistory = [];
        
        // Send message functionality
        const sendMessage = () => {
            const message = chatInput.value.trim();
            if (message && message.length > 0) {
                // Show our own message immediately
                const playerName = this.playerNickname || 'You';
                console.log('💬 Adding local message:', playerName, message);
                this.addChatMessage(playerName, message, false);
                
                // Send message to server
                if (this.multiplayer && this.multiplayer.isConnected) {
                    console.log('💬 Sending message to server:', message);
                    this.multiplayer.sendChatMessage(message);
                }
                chatInput.value = '';
            }
            this.closeChatInput();
        };
        
        // Close chat input
        this.closeChatInput = () => {
            this.chatTyping = false;
            chatInputOverlay.style.display = 'none';
            chatInput.blur();
        };
        
        // Open chat input
        this.openChatInput = () => {
            this.chatTyping = true;
            chatInputOverlay.style.display = 'block';
            chatInput.focus();
        };
        
        // Enter key to send message, Escape to cancel
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.closeChatInput();
            }
        });
        
        // Global keyboard handler for T key
        document.addEventListener('keydown', (e) => {
            // Only handle T key if not already typing and not in nickname/vehicle selection
            if (e.key === 't' || e.key === 'T') {
                if (!this.chatTyping && document.activeElement.tagName !== 'INPUT' && !this.isInSelector) {
                    e.preventDefault();
                    this.openChatInput();
                }
            }
        });
        
        console.log('💬 Minimal chat system initialized - Press T to type');
    }
    
    addChatMessage(playerName, message, isSystem = false) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        
        // Only add new message if parameters are provided
        if (playerName !== null && message !== null) {
            // Add to message history
            this.chatMessageHistory.push({
                playerName,
                message,
                isSystem,
                timestamp: Date.now()
            });
            
            // Keep only last 5 messages
            if (this.chatMessageHistory.length > 5) {
                this.chatMessageHistory.shift();
            }
        }
        
        // Clear and rebuild message display
        chatMessages.innerHTML = '';
        
        this.chatMessageHistory.forEach((msg, index) => {
            const messageEl = document.createElement('div');
            
            // Styling for message box
            messageEl.style.background = 'rgba(0, 0, 0, 0.8)';
            messageEl.style.border = '1px solid rgba(255, 255, 255, 0.2)';
            messageEl.style.borderRadius = '8px';
            messageEl.style.padding = '8px 12px';
            messageEl.style.marginBottom = '5px';
            messageEl.style.wordWrap = 'break-word';
            messageEl.style.fontSize = '14px';
            messageEl.style.lineHeight = '1.3';
            messageEl.style.backdropFilter = 'blur(5px)';
            messageEl.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
            
            // Fade animation for newer messages
            const age = Date.now() - msg.timestamp;
            const opacity = Math.max(0.3, 1 - (age / 30000)); // Fade over 30 seconds
            messageEl.style.opacity = opacity.toString();
            
            if (msg.isSystem) {
                messageEl.style.color = '#aaa';
                messageEl.style.fontStyle = 'italic';
                messageEl.style.borderColor = 'rgba(170, 170, 170, 0.3)';
                messageEl.innerHTML = `💭 ${this.escapeHtml(msg.message)}`;
            } else {
                const timestamp = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                messageEl.style.color = 'white';
                messageEl.style.borderColor = 'rgba(255, 107, 53, 0.4)';
                messageEl.innerHTML = `
                    <div style="color: #ff6b35; font-weight: bold; margin-bottom: 2px;">
                        ${this.escapeHtml(msg.playerName)} 
                        <span style="color: #aaa; font-size: 11px; font-weight: normal;">[${timestamp}]</span>
                    </div>
                    <div>${this.escapeHtml(msg.message)}</div>
                `;
            }
            
            chatMessages.appendChild(messageEl);
        });
        
        // Auto-fade messages after 10 seconds
        setTimeout(() => {
            this.refreshChatDisplay();
        }, 10000);
    }
    
    refreshChatDisplay() {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        
        // Remove messages older than 2 minutes
        const cutoffTime = Date.now() - (2 * 60 * 1000);
        this.chatMessageHistory = this.chatMessageHistory.filter(msg => msg.timestamp > cutoffTime);
        
        // Clear and rebuild display without adding new messages
        chatMessages.innerHTML = '';
        
        this.chatMessageHistory.forEach((msg, index) => {
            const messageEl = document.createElement('div');
            
            // Styling for message box
            messageEl.style.background = 'rgba(0, 0, 0, 0.8)';
            messageEl.style.border = '1px solid rgba(255, 255, 255, 0.2)';
            messageEl.style.borderRadius = '8px';
            messageEl.style.padding = '8px 12px';
            messageEl.style.marginBottom = '5px';
            messageEl.style.wordWrap = 'break-word';
            messageEl.style.fontSize = '14px';
            messageEl.style.lineHeight = '1.3';
            messageEl.style.backdropFilter = 'blur(5px)';
            messageEl.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
            
            // Fade animation for newer messages
            const age = Date.now() - msg.timestamp;
            const opacity = Math.max(0.3, 1 - (age / 30000)); // Fade over 30 seconds
            messageEl.style.opacity = opacity.toString();
            
            if (msg.isSystem) {
                messageEl.style.color = '#aaa';
                messageEl.style.fontStyle = 'italic';
                messageEl.style.borderColor = 'rgba(170, 170, 170, 0.3)';
                messageEl.innerHTML = `💭 ${this.escapeHtml(msg.message)}`;
            } else {
                const timestamp = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                messageEl.style.color = 'white';
                messageEl.style.borderColor = 'rgba(255, 107, 53, 0.4)';
                messageEl.innerHTML = `
                    <div style="color: #ff6b35; font-weight: bold; margin-bottom: 2px;">
                        ${this.escapeHtml(msg.playerName)} 
                        <span style="color: #aaa; font-size: 11px; font-weight: normal;">[${timestamp}]</span>
                    </div>
                    <div>${this.escapeHtml(msg.message)}</div>
                `;
            }
            
            chatMessages.appendChild(messageEl);
        });
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    showBoostEffect() {
        // Create boost particles effect
        for (let i = 0; i < 10; i++) {
            const particle = document.createElement('div');
            particle.style.position = 'fixed';
            particle.style.width = '4px';
            particle.style.height = '4px';
            particle.style.backgroundColor = '#00ffff';
            particle.style.borderRadius = '50%';
            particle.style.pointerEvents = 'none';
            particle.style.zIndex = '1400';
            particle.style.transition = 'all 0.8s ease-out';
            
            // Random position around the car
            const x = 50 + Math.random() * 20 - 10;
            const y = 50 + Math.random() * 20 - 10;
            particle.style.left = `${x}%`;
            particle.style.top = `${y}%`;
            
            document.body.appendChild(particle);
            
            // Animate particle
            setTimeout(() => {
                particle.style.transform = `translate(${Math.random() * 100 - 50}px, ${Math.random() * -100 - 50}px)`;
                particle.style.opacity = '0';
            }, 50);
            
            // Remove particle
            setTimeout(() => {
                if (particle.parentNode) {
                    particle.parentNode.removeChild(particle);
                }
            }, 800);
        }
    }
    
    startParachuteLanding(targetPosition, health, options = {}) {
        console.log('🪂 Starting parachute landing sequence');
        const duration = Math.max(0.5, options.duration ?? 3.0);
        const startHeight = Math.max(10, options.startHeight ?? 50);
        const countdownSeconds = Math.max(0, Math.floor(options.countdownSeconds ?? 0));
        
        // Create parachute canopy (dome shape)
        const canopyGeometry = new THREE.SphereGeometry(10, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const canopyMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x00ff00, // Green parachute
            transparent: true,
            opacity: 0.9
        });
        this.parachuteCanopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
        // No rotation needed - dome naturally points upward
        
                            // Create a single center parachute string (thin cylinder)
                    this.parachuteStrings = [];
                    const stringLength = 20; // Increased length to reach the canopy
        
        const stringGeometry = new THREE.CylinderGeometry(0.05, 0.05, stringLength, 6);
        const stringMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const string = new THREE.Mesh(stringGeometry, stringMaterial);
        
        // Position string to connect canopy to car roof
        // The string should extend from the canopy center down to the car roof
        string.position.set(0, stringLength / 2, 0); // Center of canopy, string will extend down to car roof
        
        // No rotation needed - cylinder naturally points along Y axis (vertical)
        
        this.parachuteStrings.push(string);
        
        // Create parachute group
        this.parachuteGroup = new THREE.Group();
        this.parachuteGroup.add(this.parachuteCanopy);
        this.parachuteStrings.forEach(string => {
            this.parachuteGroup.add(string);
        });
        
        // Position canopy above the car
        this.parachuteCanopy.position.set(0, 12, 0);
        
        // Add the parachute group to the car group
        this.car.carGroup.add(this.parachuteGroup);
        
        // Start position: high in the sky above target
        this.car.carGroup.position.set(targetPosition.x, startHeight, targetPosition.z);
        // Face car nose toward arena center during descent
        this.car.carGroup.rotation.y = Math.atan2(-targetPosition.x, -targetPosition.z);
        
        // Parachute group is already added to car group above
        
        // Start landing animation
        this.isParachuting = true;
        this.parachuteStartTime = this.clock.getElapsedTime();
        this.parachuteTargetPosition = targetPosition;
        this.parachuteTargetHealth = health;
        this.parachuteDuration = duration;
        this.parachuteStartHeight = startHeight;
        
        if (countdownSeconds > 0) {
            this._showParachuteCountdown(countdownSeconds);
        }

        console.log('🪂 Parachute landing started from height:', startHeight, 'duration:', duration, 's');
    }
    
    updateParachuteLanding(deltaTime) {
        if (!this.isParachuting) return;
        
        const elapsedTime = this.clock.getElapsedTime() - this.parachuteStartTime;
        const landingDuration = this.parachuteDuration || 3.0;
        const progress = Math.min(elapsedTime / landingDuration, 1.0);
        // Fade anthem during final 3 seconds of the parachute window
        if (this.soundManager && landingDuration >= 3.0) {
            const remaining = landingDuration - progress * landingDuration;
            if (remaining <= 3.0 && !this._anthemFaded) {
                this.soundManager.fadeOutAnthem(Math.max(300, remaining * 1000));
                this._anthemFaded = true;
            }
        }
        
        // Smooth descent curve (slow at start, faster at end)
        const descentProgress = 1 - Math.pow(1 - progress, 2);
        
        // Update car position
        const totalDrop = (this.parachuteStartHeight || 50);
        const currentHeight = totalDrop - (descentProgress * totalDrop);
        this.car.carGroup.position.y = currentHeight;
        
        // Gentle swaying motion
        const swayAmount = 2;
        const swayFrequency = 2;
        const sway = Math.sin(elapsedTime * swayFrequency) * swayAmount * (1 - progress);
        this.car.carGroup.position.x = this.parachuteTargetPosition.x + sway;
        this.car.carGroup.position.z = this.parachuteTargetPosition.z + sway;
        
        // Parachute canopy gently bobs up and down
        if (this.parachuteCanopy) {
            const bobAmount = 0.5;
            const bobFrequency = 2;
            const bob = Math.sin(elapsedTime * bobFrequency) * bobAmount;
            this.parachuteCanopy.position.y = 12 + bob;
        }
        
        // Landing complete
        if (progress >= 1.0) {
            this.completeParachuteLanding();
        }
    }
    
    completeParachuteLanding() {
        console.log('🪂 Parachute landing completed');
        
        // Create landing effect particles
        this.createLandingEffect();
        
        // Remove parachute
        if (this.parachuteGroup && this.car.carGroup) {
            this.car.carGroup.remove(this.parachuteGroup);
            this.scene.remove(this.parachuteGroup);
        }
        
        // Set final position and health
        this.car.carGroup.position.set(
            this.parachuteTargetPosition.x,
            1, // Ground level
            this.parachuteTargetPosition.z
        );
        // Ensure final orientation faces arena center
        this.car.carGroup.rotation.y = Math.atan2(-this.parachuteTargetPosition.x, -this.parachuteTargetPosition.z);
        this.car.health = Math.max(0, Math.min(this.car.maxHealth, this.parachuteTargetHealth));
        this.gameUI.updateHealth(this.car.health, this.car.maxHealth);
        
        // Reset parachute state
        this.isParachuting = false;
        this.parachuteGroup = null;
        this.parachuteStrings = [];
        this.parachuteCanopy = null;
        this.parachuteDuration = 0;
        this.parachuteStartHeight = 0;
        this._hideParachuteCountdown();
        // Start authoritative invulnerability window at landing
        if (this.multiplayer && this.multiplayer.isConnected && this.multiplayer.notifyPlayerLanded) {
            this.multiplayer.notifyPlayerLanded();
        }
        // Also show local shield indicator immediately for perceived responsiveness
        this._showShieldIndicator(2000);
        
        console.log('🪂 Car landed safely at:', this.car.carGroup.position);
    }

    _showParachuteCountdown(seconds) {
        this._hideParachuteCountdown();
        const el = document.createElement('div');
        el.id = 'parachuteCountdown';
        el.style.position = 'fixed';
        el.style.top = '50%';
        el.style.left = '50%';
        el.style.transform = 'translate(-50%, -50%)';
        el.style.fontFamily = 'Arial, sans-serif';
        el.style.fontWeight = 'bold';
        el.style.fontSize = '96px';
        el.style.color = '#ffffff';
        el.style.textShadow = '0 4px 12px rgba(0,0,0,0.8)';
        el.style.zIndex = '2500';
        el.style.pointerEvents = 'none';
        document.body.appendChild(el);
        this._parachuteCountdownEl = el;
        let remaining = seconds;
        const tick = () => {
            if (!this._parachuteCountdownEl) return;
            this._parachuteCountdownEl.textContent = String(remaining);
            remaining -= 1;
            if (remaining < 0) {
                this._hideParachuteCountdown();
            } else {
                this._parachuteCountdownTimer = setTimeout(tick, 1000);
            }
        };
        tick();
    }

    _hideParachuteCountdown() {
        if (this._parachuteCountdownTimer) {
            clearTimeout(this._parachuteCountdownTimer);
            this._parachuteCountdownTimer = null;
        }
        if (this._parachuteCountdownEl) {
            if (this._parachuteCountdownEl.parentNode) this._parachuteCountdownEl.parentNode.removeChild(this._parachuteCountdownEl);
            this._parachuteCountdownEl = null;
        }
    }
    
    createLandingEffect() {
        // Create dust particles when landing
        for (let i = 0; i < 10; i++) {
            const particle = document.createElement('div');
            particle.style.position = 'fixed';
            particle.style.width = '6px';
            particle.style.height = '6px';
            particle.style.backgroundColor = '#8B4513'; // Brown dust
            particle.style.borderRadius = '50%';
            particle.style.pointerEvents = 'none';
            particle.style.zIndex = '1400';
            particle.style.transition = 'all 1.5s ease-out';
            
            // Random position around the car
            const x = 50 + Math.random() * 20 - 10;
            const y = 50 + Math.random() * 20 - 10;
            particle.style.left = `${x}%`;
            particle.style.top = `${y}%`;
            
            document.body.appendChild(particle);
            
            // Animate particle
            setTimeout(() => {
                particle.style.transform = `translate(${Math.random() * 100 - 50}px, ${Math.random() * 50}px)`;
                particle.style.opacity = '0';
            }, 50);
            
            // Remove particle
            setTimeout(() => {
                if (particle.parentNode) {
                    particle.parentNode.removeChild(particle);
                }
            }, 1500);
        }
    }

    _showShieldIndicator(durationMs) {
        // Simple ring around the car in DOM for clarity; fades over duration
        const el = document.createElement('div');
        el.style.position = 'fixed';
        el.style.left = '50%';
        el.style.top = '50%';
        el.style.transform = 'translate(-50%, -50%)';
        el.style.width = '180px';
        el.style.height = '180px';
        el.style.borderRadius = '50%';
        el.style.boxShadow = '0 0 24px 8px rgba(0, 255, 255, 0.6), inset 0 0 24px rgba(0,255,255,0.6)';
        el.style.pointerEvents = 'none';
        el.style.zIndex = '2200';
        el.style.opacity = '1';
        el.style.transition = `opacity ${Math.max(200, durationMs)}ms linear`;
        document.body.appendChild(el);
        // Fade out over the given duration
        setTimeout(() => { el.style.opacity = '0'; }, 30);
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, Math.max(250, durationMs + 80));
    }
    
    showCollisionTypeIndicator(collisionType) {
        const indicator = document.createElement('div');
        indicator.style.position = 'fixed';
        indicator.style.top = '50%';
        indicator.style.left = '50%';
        indicator.style.transform = 'translate(-50%, -50%)';
        indicator.style.fontSize = '48px';
        indicator.style.fontWeight = 'bold';
        indicator.style.fontFamily = 'Arial, sans-serif';
        indicator.style.textShadow = '3px 3px 6px black';
        indicator.style.pointerEvents = 'none';
        indicator.style.zIndex = '1500';
        indicator.style.transition = 'all 0.5s ease-out';
        
        switch (collisionType) {
            case 'headshot':
                indicator.textContent = '🎯 HEADSHOT!';
                indicator.style.color = '#ffd700';
                break;
            case 'side':
                indicator.textContent = '💥 SIDE HIT!';
                indicator.style.color = '#ff4444'; // Red for high damage
                break;
            case 'rear':
                indicator.textContent = '💥 REAR HIT!';
                indicator.style.color = '#ffaa00'; // Orange for medium damage
                break;
            case 'front-bumper':
                indicator.textContent = '🛡️ BLOCKED!';
                indicator.style.color = '#00ff00';
                break;
            case 'medium':
                indicator.textContent = '💥 MEDIUM HIT!';
                indicator.style.color = '#ff8800';
                break;
            default:
                indicator.textContent = '💥 HIT!';
                indicator.style.color = '#ffffff';
        }
        
        document.body.appendChild(indicator);
        
        // Animate and remove
        setTimeout(() => {
            indicator.style.transform = 'translate(-50%, -50%) scale(1.5)';
            indicator.style.opacity = '0';
        }, 100);
        
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.parentNode.removeChild(indicator);
            }
        }, 1000);
    }
    
    showLeaderboard(leaderboard) {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.left = '50%';
        overlay.style.top = '56%';
        overlay.style.transform = 'translate(-50%, -50%)';
        overlay.style.zIndex = '2000';
        overlay.style.color = 'white';
        overlay.style.fontFamily = 'Arial, sans-serif';

        let leaderboardHTML = '<h1 style="font-size: 3rem; margin-bottom: 1rem; color: #ffd700; text-align:center;">🏆 ROUND RESULTS 🏆</h1>';
        // Slight transparency so cars remain faintly visible behind the panel
        leaderboardHTML += '<div style="background: rgba(12,14,18,0.82); padding: 1.5rem 2rem; border-radius: 12px; min-width: 560px; box-shadow: 0 10px 30px rgba(0,0,0,0.45); backdrop-filter: blur(1px);">';
        leaderboardHTML += '<table style="width: 100%; border-collapse: collapse;">';
        leaderboardHTML += '<tr style="border-bottom: 2px solid #ffd700;"><th style="padding: 10px; text-align: left;">Rank</th><th style="padding: 10px; text-align: left;">Player</th><th style="padding: 10px; text-align: center;">Kills</th><th style="padding: 10px; text-align: center;">Deaths</th><th style="padding: 10px; text-align: center;">Damage</th></tr>';
        
        leaderboard.forEach((player, index) => {
            const rank = index + 1;
            const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
            const rowColor = rank === 1 ? '#ffd700' : rank === 2 ? '#c0c0c0' : rank === 3 ? '#cd7f32' : '#ffffff';
            
            leaderboardHTML += `<tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.2);">`;
            leaderboardHTML += `<td style="padding: 10px; color: ${rowColor};">${rankEmoji} ${rank}</td>`;
            leaderboardHTML += `<td style="padding: 10px; color: ${rowColor};">${player.playerName}</td>`;
            leaderboardHTML += `<td style="padding: 10px; text-align: center; color: ${rowColor};">${player.kills}</td>`;
            leaderboardHTML += `<td style="padding: 10px; text-align: center; color: ${rowColor};">${player.deaths}</td>`;
            leaderboardHTML += `<td style="padding: 10px; text-align: center; color: ${rowColor};">${player.damageDealt}</td>`;
            leaderboardHTML += '</tr>';
        });
        
        leaderboardHTML += '</table></div>';
        leaderboardHTML += '<p style="margin-top: 0.8rem; font-size: 1.2rem; color: #ffff00; text-align:center;">Next round starting soon...</p>';

        overlay.innerHTML = leaderboardHTML;
        document.body.appendChild(overlay);
        
        // Persist until next round; store reference so we can remove it on round start
        if (this._leaderboardOverlay && this._leaderboardOverlay.parentNode) {
            this._leaderboardOverlay.parentNode.removeChild(this._leaderboardOverlay);
        }
        this._leaderboardOverlay = overlay;
    }
    
    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue
        // Slightly softer/longer fog so distant items stay visible
        this.scene.fog = new THREE.Fog(0x87CEEB, 80, 350);
    }
    
    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(
            75, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            1000
        );

        // Rear-view mirror camera
        this.mirrorCamera = new THREE.PerspectiveCamera(
            60,
            16 / 9,
            0.1,
            1000
        );
    }
    
    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.getElementById('gameContainer').appendChild(this.renderer.domElement);
        
        // Rear-view offscreen render target and HUD quad for mirroring
        this.hudScene = new THREE.Scene();
        this.hudCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const { width: mW, height: mH } = this.getMirrorRect();
        this.mirrorRenderTarget = new THREE.WebGLRenderTarget(mW, mH, { depthBuffer: true });
        this.mirrorQuadMaterial = new THREE.MeshBasicMaterial({ map: this.mirrorRenderTarget.texture, toneMapped: false, transparent: true, opacity: 0 });
        this.mirrorQuadMaterial.map.wrapS = THREE.RepeatWrapping;
        this.mirrorQuadMaterial.map.repeat.x = -1; // horizontal flip
        this.mirrorQuadMaterial.map.offset.x = 1;
        this.mirrorQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mirrorQuadMaterial);
        this.hudScene.add(this.mirrorQuad);

        // Handle window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.updateMirrorFrameElement();
            this.updateMirrorCameraAspect();
            this.resizeMirrorTarget();
        });

        // Create overlay frame for the mirror view (purely visual border)
        this.createMirrorFrameElement();
    }
    
    setupLights() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
        this.scene.add(ambientLight);
        
        // Directional light (sun)
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
        directionalLight.position.set(50, 50, 50);
        // Disable casting shadows from global sun; we'll rely on car-local shadow if any
        directionalLight.castShadow = false;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 500;
        directionalLight.shadow.camera.left = -100;
        directionalLight.shadow.camera.right = 100;
        directionalLight.shadow.camera.top = 100;
        directionalLight.shadow.camera.bottom = -100;
        this.scene.add(directionalLight);
    }
    
    update() {
        const deltaTime = this.clock.getDelta();
        if (!this.car) {
            // Pre-selection updates: orbit camera and pulse arena / indicators
            this.updateSelectorCamera(deltaTime);
            this.updateBoostPadAnimations(deltaTime);
            return;
        }
        
        // Update car physics (only if not parachuting or dead)
        if (!this.isParachuting && !this.isDead) {
            if (this.car && this.car.carGroup) {
                this.prevMyPos.copy(this.car.carGroup.position);
            }
            this.car.update(deltaTime, this.inputManager, this.soundManager);
            
            // Update engine sound based on car speed
            if (this.soundManager) {
                const speed = this.car.getSpeed();
                this.soundManager.updateEngineSound(speed);
            }
        }
        
        // Send player movement to server
        if (this.multiplayer.isConnected && this.car) {
            this.multiplayer.sendPlayerMove(
                this.car.carGroup.position,
                this.car.carGroup.rotation.y
            );
        }
        
        // Update camera to follow car
        this.updateCamera();
        
        // Update UI
        this.gameUI.updateHealth(this.car.health, this.car.maxHealth);
        this.gameUI.updateSpeed(this.car.getSpeed());
        this.gameUI.updatePlayerCount(this.multiplayer.getPlayerCount());
        // Update boost HUD (charges)
        if (this.car.getBoostCharges && this.car.getBoostMax) {
            this.gameUI.updateBoostHud(this.car.getBoostCharges(), this.car.getBoostMax());
        }
        
        // Check for collisions
        this.checkCollisions();
        this.checkPlayerCollisions();
        
        // Update boost pad animations
        this.updateBoostPadAnimations(deltaTime);
        // Update arena lift logic (if present)
        this.updateLifts(deltaTime);
        
        // Update powerups (falling animations, floating, etc.)
        if (this.powerupManager) {
            this.powerupManager.updatePowerups();
            
            // Check for powerup collection
            if (this.car && this.car.carGroup) {
                this.powerupManager.checkCollisions(this.car.carGroup.position, (powerupId, powerupType) => {
                    // Request powerup collection from server
                    this.multiplayer.collectPowerup(powerupId);
                });
            }
        }
        
        // Update parachute landing
        this.updateParachuteLanding(deltaTime);

        // Anti-stuck watchdog removed per feedback (caused idle jumps)
        // Update radar/minimap
        this.updateRadar();

        // Animate atmosphere (clouds/birds)
        if (this.arena && typeof this.arena.updateAtmosphere === 'function') {
            this.arena.updateAtmosphere(deltaTime, this.camera);
        }
        // Update roaming monster
            if (this.arena && typeof this.arena.updateMonster === 'function') {
            this.arena.updateMonster(deltaTime);
            // Local collision check with car
            if (this.car && this.car.carGroup) {
                const info = this.arena.getMonsterInfo && this.arena.getMonsterInfo();
                if (info) {
                    const cx = this.car.carGroup.position.x - info.position.x;
                    const cz = this.car.carGroup.position.z - info.position.z;
                    const distSq = cx * cx + cz * cz;
                    const hitRadius = info.radius + 2.5; // car approx radius
                        // Vertical separation check: allow flying over without damage
                        const myY = this.car.carGroup.position.y || 0;
                        const monsterY = info.position.y || 0;
                        const verticalSep = myY - monsterY;
                        const verticalVelocity = (this.car.velocity?.y ?? 0);
                        const isFlyingOver = verticalSep > 1.6; // clearly above monster
                        const isDescending = verticalVelocity <= 0.2; // near-ground or descending
                        const isNearGround = myY <= (monsterY + 1.2);
                        if (distSq <= hitRadius * hitRadius && (!isFlyingOver) && (isDescending || isNearGround)) {
                        // Apply server-authoritative 20% max health damage once per second
                        const now = Date.now();
                        this._lastMonsterHitAt = this._lastMonsterHitAt || 0;
                        if (now - this._lastMonsterHitAt > 1000) {
                            this._lastMonsterHitAt = now;
                            const dmg = Math.floor((this.car.maxHealth || 100) * 0.2);
                            // Send to server targeting ourselves
                            this.multiplayer.sendPlayerDamage(dmg, this.multiplayer.playerId, 'monster');
                            // Nudge car away
                            const away = new THREE.Vector3(cx, 0, cz).normalize().multiplyScalar(6);
                            this.car.carGroup.position.add(away);
                            if (this.soundManager && this.soundManager.playCollision) {
                                this.soundManager.playCollision('side', 1.2);
                            }
                        }
                    }
                }
            }
        }
        
        // Update health bar rotations to face camera (less frequently to reduce flickering)
        if (!this.lastHealthBarUpdate || this.clock.getElapsedTime() - this.lastHealthBarUpdate > 0.05) { // Update every 50ms
            this.otherPlayers.updateHealthBarRotations(this.camera);
            this.lastHealthBarUpdate = this.clock.getElapsedTime();
        }
    }

    updateLifts(deltaTime) {
        if (!this.arena || !this.car || !this.car.carGroup) return;
        const pos = this.car.carGroup.position;
        // Drivable ramp height correction
        if (this.arena.rampSurface) {
            const r = this.arena.rampSurface;
            const insideRampXZ = Math.abs(pos.x - r.x) <= r.halfW && pos.z >= r.zStart && pos.z <= r.zEnd;
            if (insideRampXZ) {
                const t = (pos.z - r.zStart) / Math.max(0.0001, (r.zEnd - r.zStart));
                const rampY = r.y0 + t * (r.y1 - r.y0);
                const nearEntrance = (pos.z <= r.zStart + Math.max(2.0, (r.zEnd - r.zStart) * 0.15));
                const withinBand = pos.y > rampY - 0.9; // generous band to avoid drop-through
                if ((nearEntrance || withinBand) && pos.y < rampY + 0.5) {
                    pos.y = rampY;
                    if (this.car.velocity) this.car.velocity.y = 0;
                }
            }
        }

        // Platform collision/barrier + top clamp
        if (this.arena.platformSurface) {
            const p = this.arena.platformSurface;
            // Use car footprint (axis-aligned) for collision against platform sides
            const carHalfW = this.car.collisionHalfWidth || 1.2;
            const carHalfL = this.car.collisionHalfLength || 1.6;
            // Expand platform bounds by the rotated car extents so the whole body is blocked
            const yaw = this.car.carGroup.rotation.y || 0;
            const cosY = Math.abs(Math.cos(yaw));
            const sinY = Math.abs(Math.sin(yaw));
            const carExtX = cosY * carHalfW + sinY * carHalfL; // car half-extent projected on world X
            const carExtZ = cosY * carHalfL + sinY * carHalfW; // car half-extent projected on world Z
            const halfW = p.halfW + carExtX + 0.05;
            const halfD = p.halfD + carExtZ + 0.05;
            const insideXZ = Math.abs(pos.x - p.x) <= halfW && Math.abs(pos.z - p.z) <= halfD;
            if (insideXZ) {
                // Seam handoff: if we're in a corridor around the ramp top and near ramp height, snap onto deck
                let inRampSeam = false;
                if (this.arena.rampSurface) {
                    const r = this.arena.rampSurface;
                    const seamX = Math.abs(pos.x - r.x) <= (r.halfW + carExtX + 0.2);
                    const seamZ = pos.z >= (r.zEnd - 1.5) && pos.z <= (r.zEnd + 1.2);
                    const nearY = pos.y >= (r.y1 - 0.6);
                    inRampSeam = seamX && seamZ && nearY;
                }
                // If we already reached near deck height (via ramp or lift), snap to deck top
                if (pos.y >= p.y - 0.4 || inRampSeam) {
                    pos.y = p.y;
                    if (this.car.velocity) this.car.velocity.y = 0;
                    // prevent an immediate pushback from residual overlap this frame
                    if (inRampSeam && this.car.velocity) {
                        this.car.velocity.x *= 0.8;
                        this.car.velocity.z *= 0.8;
                    }
                } else {
                    // Below deck height → treat platform sides as solid barriers
                    const dx = pos.x - p.x;
                    const dz = pos.z - p.z;
                    const penX = halfW - Math.abs(dx);
                    const penZ = halfD - Math.abs(dz);
                    if (penX < penZ) {
                        pos.x = p.x + Math.sign(dx || 1) * (halfW + 0.02);
                    } else {
                        pos.z = p.z + Math.sign(dz || 1) * (halfD + 0.02);
                    }
                    // Bleed and reflect some horizontal velocity to prevent re-entry this frame
                    if (this.car.velocity) {
                        // Reflect along the axis we resolved on
                        if (penX < penZ) {
                            this.car.velocity.x *= -0.25;
                        } else {
                            this.car.velocity.z *= -0.25;
                        }
                    }
                    // Trim speed/momentum so you bounce back slightly instead of climbing
                    if (typeof this.car.speed === 'number') {
                        this.car.speed = Math.max(0, this.car.speed * 0.4);
                    }
                    if (typeof this.car.momentum === 'number') {
                        this.car.momentum = Math.max(0, this.car.momentum * 0.4);
                    }
                }
            }
        }

        // L-barriers: solid walls with central passage
        if (this.arena.lBarriers && this.arena.lBarriers.length) {
            for (const b of this.arena.lBarriers) {
                const dx = this.car.carGroup.position.x - b.x;
                const dz = this.car.carGroup.position.z - b.z;
                const carHalfW = this.car.collisionHalfWidth || 1.2;
                const carHalfL = this.car.collisionHalfLength || 1.6;
                const extX = b.halfW + carHalfW;
                const extZ = b.halfD + carHalfL;
                if (Math.abs(dx) <= extX && Math.abs(dz) <= extZ && this.car.carGroup.position.y < b.yTop + 0.2) {
                    const penX = extX - Math.abs(dx);
                    const penZ = extZ - Math.abs(dz);
                    if (penX < penZ) {
                        this.car.carGroup.position.x = b.x + Math.sign(dx || 1) * (extX + 0.02);
                        if (this.car.velocity) this.car.velocity.x *= -0.3;
                    } else {
                        this.car.carGroup.position.z = b.z + Math.sign(dz || 1) * (extZ + 0.02);
                        if (this.car.velocity) this.car.velocity.z *= -0.3;
                    }
                    if (typeof this.car.speed === 'number') this.car.speed *= 0.6;
                    if (typeof this.car.momentum === 'number') this.car.momentum *= 0.6;
                }
            }
        }

        // Lift activation: requires car centered fully on square (approx 4 wheels)
        if (this.arena.liftZones && this.arena.liftZones.length) {
            for (const zone of this.arena.liftZones) {
                const inside = Math.abs(pos.x - zone.position.x) <= (zone.halfW - 0.6) && Math.abs(pos.z - zone.position.z) <= (zone.halfD - 0.6) && Math.abs(pos.y - 0) < 0.6;
                if (inside) {
                    zone.active = true;
                }
                if (zone.active) {
                    // Animate cabin extrusion and move car up
                    zone.progress = Math.min(1, zone.progress + deltaTime / Math.max(0.2, zone.duration));
                    const height = zone.targetY * zone.progress;
                    if (zone.visuals?.cabin) {
                        zone.visuals.cabin.scale.y = Math.max(0.2, height / 0.2);
                        zone.visuals.cabin.position.y = height / 2 + 0.25;
                    }
                    pos.y = Math.max(pos.y, height);
                    if (this.car.velocity) this.car.velocity.y = 0;
                    if (zone.progress >= 1) {
                        // Place car onto platform deck
                        if (zone.targetXZ) { pos.x = zone.targetXZ.x; pos.z = zone.targetXZ.z; }
                        // Keep at platform height
                        pos.y = zone.targetY + 0.02;
                        zone.active = false; zone.progress = 0;
                        if (zone.visuals?.cabin) { zone.visuals.cabin.scale.y = 1; zone.visuals.cabin.position.y = zone.targetY/2 + 0.25; }
                    }
                }
            }
        }
    }

    _applyLocalSpawn(position, health) {
        if (!this.car || !position) return;
        this.car.carGroup.position.set(position.x || 0, position.y || 1, position.z || 0);
        // Face car nose toward arena center
        this.car.carGroup.rotation.y = Math.atan2(-(position.x || 0), -(position.z || 0));
        this.car.health = Math.max(0, Math.min(this.car.maxHealth, health ?? this.car.maxHealth));
        this.gameUI.updateHealth(this.car.health, this.car.maxHealth);
    }

    updateSelectorCamera(deltaTime) {
        // Smooth orbit around arena center while selector is open
        const t = this.clock.getElapsedTime() - this.selectorStartTime;
        const radius = 140;
        const height = 45;
        const speed = 0.15; // radians per second
        const x = Math.cos(t * speed) * radius;
        const z = Math.sin(t * speed) * radius;
        const target = new THREE.Vector3(0, 0, 0);

        const desired = new THREE.Vector3(x, height, z);
        this.camera.position.lerp(desired, 0.05);
        this.camera.lookAt(target);
    }
    
    updateCamera() {
        const carPosition = this.car.carGroup.position;
        const carRotation = this.car.carGroup.rotation.y;
        
        // Calculate camera position behind and above the car
        const cameraDistance = 25;
        const cameraHeight = 12;
        
        // Calculate the camera position relative to car's direction
        const cameraOffsetX = -Math.sin(carRotation) * cameraDistance;
        const cameraOffsetZ = -Math.cos(carRotation) * cameraDistance;
        
        const targetPosition = new THREE.Vector3(
            carPosition.x + cameraOffsetX,
            carPosition.y + cameraHeight,
            carPosition.z + cameraOffsetZ
        );
        
        // Smooth camera movement
        this.camera.position.lerp(targetPosition, 0.05);
        
        // Look at the car with a slight offset forward
        const lookAtOffset = 8;
        const lookAtX = carPosition.x + Math.sin(carRotation) * lookAtOffset;
        const lookAtZ = carPosition.z + Math.cos(carRotation) * lookAtOffset;
        
        this.camera.lookAt(lookAtX, carPosition.y + 2, lookAtZ);
    }
    
    checkCollisions() {
        // Check arena boundary collisions using proper oval collision
        const carPosition = this.car.carGroup.position;
        const arenaBounds = this.arena.getBounds();
        
        // Check if car is outside the oval bounds
        // For an oval: (x/a)² + (z/b)² > 1 means outside the oval
        const x = carPosition.x;
        const z = carPosition.z;
        const a = arenaBounds.x;
        const b = arenaBounds.z;
        
        const distanceFromCenter = (x * x) / (a * a) + (z * z) / (b * b);
        
        if (distanceFromCenter > 1) {
            // Car hit arena boundary - bounce back (no damage)
            // this.car.takeDamage(10); // Disabled wall damage
            
            // Calculate the closest point on the oval boundary
            const angle = Math.atan2(z, x);
            const closestX = Math.cos(angle) * a * 0.9;
            const closestZ = Math.sin(angle) * b * 0.9;
            
            // Move car back to the boundary
            carPosition.x = closestX;
            carPosition.z = closestZ;
        }
        
        // Check ramp collisions
        this.checkRampCollisions();
    }
    
    checkRampCollisions() {
        if (!this.arena.ramps) return;
        
        const carPosition = this.car.carGroup.position;
        const carVelocity = this.car.velocity;
        const carSpeed = this.car.getSpeed();
        
        for (const ramp of this.arena.ramps) {
            // Get ramp position and rotation
            const rampPosition = ramp.position;
            const rampRotation = ramp.rotation.y;
            
            // Calculate car position relative to ramp
            const relativeX = carPosition.x - rampPosition.x;
            const relativeZ = carPosition.z - rampPosition.z;
            
            // Rotate car position to ramp's coordinate system
            const rotatedX = relativeX * Math.cos(-rampRotation) - relativeZ * Math.sin(-rampRotation);
            const rotatedZ = relativeX * Math.sin(-rampRotation) + relativeZ * Math.cos(-rampRotation);
            
            // Boost zone dimensions (slightly larger for better detection)
            const boostWidth = 12;
            const boostLength = 16;
            
            // Check if car is within boost zone
            const inside = (Math.abs(rotatedX) < boostWidth / 2 && Math.abs(rotatedZ) < boostLength / 2);
            const id = ramp.uuid;
            const wasInside = this._rampTriggerState.get(id) || false;
            const nowMs = Date.now();
            const lastAt = this._rampLastTriggerAt.get(id) || 0;
                if (inside && !wasInside) {
                // Entering pad → consider triggering once
                    if (carSpeed > 5 && (nowMs - lastAt) > this._rampCooldownMs) {
                    // Calculate how far along the boost zone the car is (0 = front, 1 = back)
                    const boostProgress = (rotatedZ + boostLength / 2) / boostLength;
                        // Stronger jump impulse for clearer airtime
                        const baseBoost = Math.min(28, carSpeed * 0.42);
                        const positionBoost = boostProgress * 0.45;
                        const totalBoost = Math.min(32, baseBoost + positionBoost);

                    // Apply a single upward impulse
                    carVelocity.y = Math.max(carVelocity.y, totalBoost);

                    // Apply a single forward impulse (reduced)
                        const forwardBoost = carSpeed * 0.16;
                    carVelocity.x += Math.sin(rampRotation) * forwardBoost;
                    carVelocity.z += Math.cos(rampRotation) * forwardBoost;

                    // Visual feedback - show boost effect
                    this.showBoostEffect();

                    // Short timed speed multiplier (reduced strength)
                        if (this.car && this.car.triggerPadBoost) {
                            // Jump-pad boost: do not spawn rings during jumps
                            this.car.triggerPadBoost(0.35, 1.6, 0.25, false);
                        }

                    // Play boost sound with speed
                    if (this.soundManager) {
                        this.soundManager.playBoostSound(carSpeed);
                    }

                    this._rampLastTriggerAt.set(id, nowMs);
                    console.log(`🚀 BOOST once: v=${carSpeed.toFixed(1)} up=${totalBoost.toFixed(1)} prog=${boostProgress.toFixed(2)}`);
                }
            }
            // Update inside state
            this._rampTriggerState.set(id, !!inside);
        }
    }
    
    updateBoostPadAnimations(deltaTime) {
        if (!this.arena.ramps) return;
        
        this.arena.ramps.forEach(ramp => {
            if (!ramp.userData) return;
            ramp.userData.pulseTime += deltaTime;
            const t = ramp.userData.pulseTime;
            // Outer ring gentler breathing
            if (ramp.userData.ringOuterMat) {
                ramp.userData.ringOuterMat.opacity = 0.78 + 0.08 * (0.5 + 0.5 * Math.sin(t * 1.8));
            }
            // Inner ring slight flicker (reduced)
            if (ramp.userData.ringInnerMat) {
                ramp.userData.ringInnerMat.opacity = 0.12 + 0.06 * (0.5 + 0.5 * Math.sin(t * 2.4 + 1.2));
            }
            // Pulsating inner circle scale/opacity (reduced)
            if (ramp.userData.pulseMesh) {
                const s = 1.0 + 0.05 * (0.5 + 0.5 * Math.sin(t * 2.8));
                ramp.userData.pulseMesh.scale.set(s, s, s);
                ramp.userData.pulseMesh.material.opacity = 0.14 + 0.12 * (0.5 + 0.5 * Math.sin(t * 2.8));
            }
            // Beam subtle shimmer (reduced)
            if (ramp.userData.beamMat) {
                ramp.userData.beamMat.opacity = 0.10 + 0.08 * (0.5 + 0.5 * Math.sin(t * 3.2));
            }
        });
        
        // Update spawn indicator animations
        if (this.arena.spawnIndicators) {
            this.arena.spawnIndicators.forEach(indicator => {
                if (indicator.userData) {
                    indicator.userData.pulseTime += deltaTime;
                    const pulse = Math.sin(indicator.userData.pulseTime * 2) * 0.3 + 0.7; // Pulse between 0.4 and 1.0
                    indicator.material.opacity = pulse;
                }
            });
        }
    }
    
    checkPlayerCollisions() {
        if (!this.multiplayer.isConnected) return;
        
        const currentTime = this.clock.getElapsedTime();
        const myPosition = this.car.carGroup.position;
        const mySpeed = this.car.getSpeed();
        const myRotation = this.car.carGroup.rotation.y;
        
        // Initialize collision tracking if not exists
        if (!this._collisionTracker) {
            this._collisionTracker = new Map();
        }
        
        // Simple collision detection
        const collisionDistance = 4.0;
        
        // Check collision with other players
        this.multiplayer.getPlayers().forEach(otherPlayer => {
            // Skip if other player doesn't have a valid position
            if (!otherPlayer.position) return;
            
            const otherPosition = otherPlayer.position;
            const otherVec3 = new THREE.Vector3(otherPosition.x, otherPosition.y, otherPosition.z);
            const distance = myPosition.distanceTo(otherVec3);

            // Always push cars apart when too close
            if (distance < collisionDistance) {
                const pushDirection = myPosition.clone().sub(otherVec3).normalize();
                const pushStrength = (collisionDistance - distance) * 1.5; // Strong separation
                
                if (pushStrength > 0) {
                    // Move my car away from the other
                    this.car.carGroup.position.add(pushDirection.clone().multiplyScalar(pushStrength));
                    
                    // Add lateral bounce for natural separation
                    const lateralDirection = new THREE.Vector3(-pushDirection.z, 0, pushDirection.x);
                    const lateralBounce = lateralDirection.multiplyScalar(pushStrength * 0.5);
                    this.car.carGroup.position.add(lateralBounce);
                }

                // Check if we can damage this player (single hit system)
                const playerKey = otherPlayer.id;
                const lastHitTime = this._collisionTracker.get(playerKey) || 0;
                const timeSinceHit = currentTime - lastHitTime;
                
                // Only damage if: 1) we have speed, 2) enough time passed, 3) not currently colliding
                if (mySpeed > 15 && timeSinceHit > 3.0) { // 3 second cooldown between same-player hits
                    
                    // Mark this collision immediately to prevent multiple hits
                    this._collisionTracker.set(playerKey, currentTime);
                    
                    console.log(`🎯 SINGLE HIT: Speed ${mySpeed}, Player ${otherPlayer.id}, Cooldown ${timeSinceHit.toFixed(1)}s`);
                    
                    // Check if this is a headshot (jumping ON a car)
                    const myY = this.car.carGroup.position.y;
                    const otherY = otherPosition.y || 0;
                    const isHeadshot = myY > otherY + 1.5;
                    
                    // Calculate collision angles for damage calculation
                    const otherForwardX = Math.sin(otherPlayer.rotation || 0);
                    const otherForwardZ = Math.cos(otherPlayer.rotation || 0);
                    const myForwardX = Math.sin(myRotation);
                    const myForwardZ = Math.cos(myRotation);

                    const impactVectorX = myPosition.x - otherPosition.x;
                    const impactVectorZ = myPosition.z - otherPosition.z;
                    const impactVectorLength = Math.max(1e-6, Math.hypot(impactVectorX, impactVectorZ));
                    const normalizedImpactX = impactVectorX / impactVectorLength;
                    const normalizedImpactZ = impactVectorZ / impactVectorLength;

                    const toOtherX = -normalizedImpactX;
                    const toOtherZ = -normalizedImpactZ;

                    const dotOther = otherForwardX * normalizedImpactX + otherForwardZ * normalizedImpactZ;
                    const dotMine = myForwardX * toOtherX + myForwardZ * toOtherZ;

                    // Classification thresholds
                    const FRONT_CONE = 0.8;
                    const SIDE_CONE = 0.25;
                    const REAR_CONE = -0.7;

                    let damage, speedMultiplier, collisionType;
                    
                    // Check invulnerability
                    const nowMs = (performance.now ? performance.now() : Date.now());
                    const attackerInvul = (this.car?.invulnerableUntil && nowMs < this.car.invulnerableUntil);
                    
                    if (isHeadshot && !attackerInvul) {
                        damage = 100;
                        speedMultiplier = 0.3;
                        collisionType = 'headshot';
                        this.gameUI.showHeadshotEffect();
                        console.log(`🎯 HEADSHOT! Jumped ON player ${otherPlayer.id}! Instant kill!`);
                    } else {
                        const frontMine = dotMine >= FRONT_CONE;
                        const frontOther = dotOther >= FRONT_CONE;
                        if (frontMine && frontOther) {
                            damage = 0;
                            speedMultiplier = 0.85;
                            collisionType = 'front-bumper';
                            console.log(`🛡️ Front bumper contact (blocked)`);
                        } else if (Math.abs(dotOther) <= SIDE_CONE) {
                            // Base damage only; server applies attacker/target multipliers
                            damage = Math.floor(mySpeed * 0.3);
                            speedMultiplier = 0.3;
                            collisionType = 'side';
                            this.gameUI.showSideCollisionEffect();
                            console.log(`💥 SIDE COLLISION with player ${otherPlayer.id}! High damage: ${damage}%`);
                        } else if (dotOther <= REAR_CONE) {
                            // Base damage only; server applies attacker/target multipliers
                            damage = Math.floor(mySpeed * 0.2);
                            speedMultiplier = 0.5;
                            collisionType = 'rear';
                            this.gameUI.showRearCollisionEffect();
                            console.log(`💥 REAR COLLISION with player ${otherPlayer.id}! Medium damage: ${damage}%`);
                        } else {
                            // Base damage only; server applies attacker/target multipliers
                            damage = Math.floor(mySpeed * 0.15);
                            speedMultiplier = 0.6;
                            collisionType = 'medium';
                            this.gameUI.showSideCollisionEffect();
                            console.log(`Medium angle collision with player ${otherPlayer.id}, damage: ${damage}%`);
                        }
                    }
                    
                    // Play collision sound
                    if (this.soundManager) {
                        const impactForce = Math.min(2.0, Math.max(0.5, mySpeed / 10));
                        let collisionTypeForSound = collisionType;
                        const verticalDiff = (this.car?.carGroup?.position?.y ?? 0) - (otherPosition?.y ?? 0);
                        if (verticalDiff > 1.0 && this.car?.velocity && this.car.velocity.y <= 0) {
                            collisionTypeForSound = 'headshot';
                            this._localStats = this._localStats || { kills: 0, deaths: 0, damageDealt: 0, headshots: 0 };
                            this._localStats.headshots += 1;
                            this.gameUI.updateScoreStats(this._localStats);
                        }
                        this.soundManager.playCollisionSound(collisionTypeForSound, impactForce);
                    }
                    
                    // Show collision type indicator
                    this.showCollisionTypeIndicator(collisionType);
                    
                    // Send damage to server (ONLY ONCE)
                    console.log(`🔍 DAMAGE CHECK: attackerInvul=${attackerInvul}, playerExists=${this.multiplayer.players.has(otherPlayer.id)}, damage=${damage}`);
                    if (!attackerInvul && this.multiplayer.players.has(otherPlayer.id)) {
                        this.multiplayer.sendPlayerDamage(damage, otherPlayer.id, collisionType);
                        console.log(`📤 DAMAGE SENT: ${damage} to ${otherPlayer.id} (${collisionType})`);
                    } else {
                        console.log(`❌ DAMAGE NOT SENT: attackerInvul=${attackerInvul}, playerExists=${this.multiplayer.players.has(otherPlayer.id)}`);
                    }
                    
                    // Apply strong knockback for separation
                    if (this.car.applyKnockback) {
                        const knockbackStrength = Math.max(12, mySpeed * 0.8); // Very strong knockback
                        
                        // Apply main knockback
                        this.car.applyKnockback(pushDirection, knockbackStrength);
                        
                        // Add lateral knockback for better separation
                        const lateralKnockback = new THREE.Vector3(-pushDirection.z, 0, pushDirection.x);
                        this.car.applyKnockback(lateralKnockback, knockbackStrength * 0.6);
                    }

                    // Apply speed reduction
                    this.car.speed = Math.max(this.car.speed * speedMultiplier, 8);
                    
                    // Screen shake
                    this.gameUI.shakeScreen(0.1, 100);
                    
                    // Only handle one damage event per frame
                    return;
                }
            }
        });
    }


    
    animate() {
        if (!this.isRunning) return;
        
        requestAnimationFrame(() => this.animate());
        
        this.update();
        this.renderer.render(this.scene, this.camera);

        // Hide loading screen after the very first successful render
        if (!this._loadingHidden) {
            const loadingScreen = document.getElementById('loadingScreen');
            if (loadingScreen) loadingScreen.style.display = 'none';
            this._loadingHidden = true;
        }

        // Render rear-view mirror when the player car exists
        if (this.car) {
            this.renderMirror();
        }
    }

    // ======= Rear-view mirror helpers =======
    getMirrorRect() {
        const width = Math.floor(window.innerWidth * 0.35);
        const height = Math.floor(window.innerHeight * 0.18);
        const x = Math.floor((window.innerWidth - width) / 2);
        const topMargin = 12;
        const y = Math.floor(window.innerHeight - height - topMargin); // bottom-origin
        return { x, y, width, height };
    }

    updateMirrorCameraAspect() {
        const { width, height } = this.getMirrorRect();
        this.mirrorCamera.aspect = width / height;
        this.mirrorCamera.updateProjectionMatrix();
    }

    resizeMirrorTarget() {
        if (!this.mirrorRenderTarget) return;
        const { width, height } = this.getMirrorRect();
        const dpr = this.renderer.getPixelRatio ? this.renderer.getPixelRatio() : (window.devicePixelRatio || 1);
        this.mirrorRenderTarget.setSize(Math.max(1, Math.floor(width * dpr)), Math.max(1, Math.floor(height * dpr)));
    }

    createMirrorFrameElement() {
        if (document.getElementById('mirrorFrame')) return;
        const frame = document.createElement('div');
        frame.id = 'mirrorFrame';
        frame.style.position = 'absolute';
        frame.style.border = '2px solid rgba(255,255,255,0.6)';
        frame.style.borderRadius = '8px';
        frame.style.boxShadow = '0 0 12px rgba(0,0,0,0.6) inset, 0 4px 12px rgba(0,0,0,0.5)';
        frame.style.pointerEvents = 'none';
        frame.style.zIndex = '90';
        frame.style.opacity = '0';
        frame.style.transition = 'opacity 220ms ease';
        frame.style.display = 'none';
        document.getElementById('gameContainer').appendChild(frame);
        this.updateMirrorFrameElement();
    }

    updateMirrorFrameElement() {
        const frame = document.getElementById('mirrorFrame');
        if (!frame) return;
        const { x, y, width, height } = this.getMirrorRect();
        frame.style.left = `${x}px`;
        frame.style.top = `${window.innerHeight - y - height}px`;
        frame.style.width = `${width}px`;
        frame.style.height = `${height}px`;
    }

    setMirrorVisible(visible) {
        this._mirrorVisible = !!visible;
        this._mirrorTargetAlpha = this._mirrorVisible ? 1 : 0;
        const frame = document.getElementById('mirrorFrame');
        if (frame) {
            if (this._mirrorVisible) {
                frame.style.display = 'block';
                // ensure transition
                requestAnimationFrame(() => { frame.style.opacity = '1'; });
            } else {
                frame.style.opacity = '0';
                setTimeout(() => { if (!this._mirrorVisible) frame.style.display = 'none'; }, 240);
            }
        }
    }

    renderMirror() {
        // Smooth fade for the mirror content
        this._mirrorAlpha += (this._mirrorTargetAlpha - this._mirrorAlpha) * 0.15;
        this.mirrorQuadMaterial.opacity = this._mirrorAlpha;
        if (this._mirrorAlpha <= 0.01) return;
        // Place mirror camera just above the car, looking backwards
        const carPos = this.car.carGroup.position.clone();
        const rot = this.car.carGroup.rotation.y;
        const forward = new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot));
        const up = new THREE.Vector3(0, 1, 0);
        const camPos = carPos.clone().add(new THREE.Vector3(0, 4.5, 0));
        this.mirrorCamera.position.copy(camPos);
        // Look behind the car
        const target = carPos.clone().sub(forward.multiplyScalar(20));
        this.mirrorCamera.lookAt(target);
        this.mirrorCamera.up.copy(up);
        this.updateMirrorCameraAspect();
        this.resizeMirrorTarget();

        // First render the scene into the offscreen target
        this.renderer.setRenderTarget(this.mirrorRenderTarget);
        this.renderer.clear();
        this.renderer.render(this.scene, this.mirrorCamera);
        this.renderer.setRenderTarget(null);

        // Then blit the texture to the top-center rectangle, horizontally flipped
        const { x, y, width, height } = this.getMirrorRect();
        this.renderer.clearDepth();
        this.renderer.setScissorTest(true);
        this.renderer.setViewport(x, y, width, height);
        this.renderer.setScissor(x, y, width, height);
        this.renderer.render(this.hudScene, this.hudCamera);
        this.renderer.setScissorTest(false);
        // Reset viewport to full for safety (next frame resets anyway)
        this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    }

    // Settings UI: gear button + panel
    setupSettingsUI() {
        const btn = document.getElementById('settingsButton');
        const panel = document.getElementById('settingsPanel');
        const chk = document.getElementById('disableSound');
        if (!btn || !panel || !chk) return;

        // Initialize from sound state
        if (this.soundManager) {
            chk.checked = !this.soundManager.soundEnabled;
        }

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });

        chk.addEventListener('change', () => {
            const disable = chk.checked;
            if (this.soundManager) {
                this.soundManager.setSoundEnabled(!disable);
            }
        });

        // Hide panel when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (!panel || panel.style.display === 'none') return;
            const withinBtn = btn.contains(e.target);
            const withinPanel = panel.contains(e.target);
            if (!withinBtn && !withinPanel) {
                panel.style.display = 'none';
            }
        });
    }

    // ======= Radar / Minimap =======
    createRadarOverlay() {
        if (this._radarCanvas) return;
        const parent = document.getElementById('gameContainer') || document.body;
        const c = document.createElement('canvas');
        c.id = 'radarCanvas';
        c.style.position = 'absolute';
        c.style.right = '16px';
        c.style.bottom = '16px';
        c.style.zIndex = '95';
        c.style.opacity = '0.95';
        c.style.pointerEvents = 'none';
        c.style.filter = 'drop-shadow(0 4px 10px rgba(0,0,0,0.4))';
        const ctx = c.getContext('2d');
        this._radarCanvas = c;
        this._radarCtx = ctx;
        const setDPR = () => {
            const dpr = window.devicePixelRatio || 1;
            c.width = Math.floor(this._radarSize * dpr);
            c.height = Math.floor(this._radarSize * dpr);
            c.style.width = `${this._radarSize}px`;
            c.style.height = `${this._radarSize}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        setDPR();
        window.addEventListener('resize', setDPR);
        parent.appendChild(c);
    }

    updateRadar() {
        if (!this._radarCtx || !this.arena) return;
        const ctx = this._radarCtx;
        const size = this._radarSize;
        // Clear
        ctx.clearRect(0, 0, size, size);
        // Background rounded rect
        const r = 14;
        ctx.fillStyle = 'rgba(10,16,22,0.65)';
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.arcTo(size, 0, size, size, r);
        ctx.arcTo(size, size, 0, size, r);
        ctx.arcTo(0, size, 0, 0, r);
        ctx.arcTo(0, 0, size, 0, r);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.save();
        ctx.translate(size / 2, size / 2);
        // Playfield ellipse
        const bounds = this.arena.getBounds ? this.arena.getBounds() : { x: 100, z: 80 };
        const radius = (size / 2) - this._radarPadding;
        const scaleX = radius / bounds.x;
        const scaleZ = radius / bounds.z;
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, bounds.x * scaleX, bounds.z * scaleZ, 0, 0, Math.PI * 2);
        ctx.stroke();
        // Draw my car (triangle heading)
        if (this.car && this.car.carGroup) {
            const p = this.car.carGroup.position;
            const x = p.x * scaleX;
            const y = p.z * scaleZ;
            const rot = this.car.carGroup.rotation.y;
            ctx.save();
            ctx.translate(x, y);
            // Flip to point in the car's forward direction on the radar
            ctx.rotate(Math.PI - rot);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(0, -6);
            ctx.lineTo(4, 5);
            ctx.lineTo(-4, 5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        // Draw opponents as dots
        if (this.multiplayer) {
            this.multiplayer.players.forEach((op) => {
                if (!op || !op.position) return;
                const x = (op.position.x || 0) * scaleX;
                const y = (op.position.z || 0) * scaleZ;
                ctx.fillStyle = '#ff6b35';
                ctx.beginPath();
                ctx.arc(x, y, 3.5, 0, Math.PI * 2);
                ctx.fill();
            });
        }
        ctx.restore();
    }
}

// Start the game when the page loads
window.addEventListener('load', () => {
    new BattleCarsGame();
}); 