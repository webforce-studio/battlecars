export class GameUI {
    constructor() {
        this.healthValue = document.getElementById('healthValue');
        this.healthFill = document.getElementById('healthFill');
        this.playerCount = document.getElementById('playerCount');
        this.speedValue = document.getElementById('speedValue');
        
        this.initializeUI();
    }
    
    initializeUI() {
        // Set initial values
        this.updateHealth(100);
        this.updatePlayerCount(1);
        
        // Add any additional UI initialization here
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Add any UI event listeners here
        // For example, pause menu, settings, etc.
    }
    

    
    updateHealth(health) {
        if (this.healthValue && this.healthFill) {
            // Update health value display
            this.healthValue.textContent = Math.round(health);
            
            // Update health bar fill
            const healthPercentage = Math.max(0, Math.min(100, health));
            this.healthFill.style.width = `${healthPercentage}%`;
            
            // Change color based on health level
            this.updateHealthBarColor(healthPercentage);
        }
    }
    
    updateHealthBarColor(healthPercentage) {
        if (!this.healthFill) return;
        
        let color;
        if (healthPercentage > 60) {
            color = '#00ff00'; // Green
        } else if (healthPercentage > 30) {
            color = '#ffff00'; // Yellow
        } else {
            color = '#ff0000'; // Red
        }
        
        this.healthFill.style.background = color;
    }
    
    updatePlayerCount(count) {
        if (this.playerCount) {
            this.playerCount.textContent = count;
        }
    }
    
    updateSpeed(speed) {
        if (this.speedValue) {
            // Convert speed to km/h (assuming speed is in units per second)
            const speedKmh = Math.round(speed * 3.6); // Convert m/s to km/h
            this.speedValue.textContent = speedKmh;
            
            // Change color based on speed
            if (speedKmh > 100) {
                this.speedValue.style.color = '#ff0000'; // Red for high speed
            } else if (speedKmh > 50) {
                this.speedValue.style.color = '#ffff00'; // Yellow for medium speed
            } else {
                this.speedValue.style.color = '#ffffff'; // White for low speed
            }
        }
    }
    
    updateTimer(endTime) {
        const timerElement = document.getElementById('gameTimer');
        const timerValue = document.getElementById('timerValue');
        
        if (timerElement && timerValue && endTime) {
            timerElement.style.display = 'block';
            
            const updateTimerDisplay = () => {
                const now = Date.now();
                const timeLeft = Math.max(0, endTime - now);
                
                if (timeLeft > 0) {
                    const minutes = Math.floor(timeLeft / 60000);
                    const seconds = Math.floor((timeLeft % 60000) / 1000);
                    timerValue.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    
                    // Change color based on time remaining
                    if (timeLeft < 30000) { // Less than 30 seconds
                        timerValue.style.color = '#ff0000';
                    } else if (timeLeft < 60000) { // Less than 1 minute
                        timerValue.style.color = '#ffaa00';
                    } else {
                        timerValue.style.color = '#ffffff';
                    }
                } else {
                    timerValue.textContent = '00:00';
                }
            };
            
            updateTimerDisplay();
            this.timerInterval = setInterval(updateTimerDisplay, 1000);
        }
    }
    
    updateGamePhase(phase, endTime = null) {
        const phaseElement = document.getElementById('gamePhase');
        const phaseValue = document.getElementById('phaseValue');
        
        if (phaseElement && phaseValue) {
            phaseElement.style.display = 'block';
            
            switch (phase) {
                case 'waiting':
                    phaseValue.textContent = 'Waiting for players...';
                    phaseValue.style.color = '#ffff00';
                    break;
                case 'playing':
                    phaseValue.textContent = 'FIGHT!';
                    phaseValue.style.color = '#ff0000';
                    if (endTime) {
                        this.updateTimer(endTime);
                    }
                    break;
                case 'roundEnd':
                    phaseValue.textContent = 'Round Over';
                    phaseValue.style.color = '#00ff00';
                    break;
                default:
                    phaseValue.textContent = phase;
                    phaseValue.style.color = '#ffffff';
            }
        }
    }
    
    clearTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        const timerElement = document.getElementById('gameTimer');
        if (timerElement) {
            timerElement.style.display = 'none';
        }
    }
    
    showParachuteRespawn(playerId, respawnTime) {
        const respawnOverlay = document.createElement('div');
        respawnOverlay.style.position = 'fixed';
        respawnOverlay.style.top = '0';
        respawnOverlay.style.left = '0';
        respawnOverlay.style.width = '100%';
        respawnOverlay.style.height = '100%';
        respawnOverlay.style.background = 'linear-gradient(180deg, rgba(135, 206, 235, 0.8) 0%, rgba(255, 255, 255, 0.9) 100%)';
        respawnOverlay.style.pointerEvents = 'none';
        respawnOverlay.style.zIndex = '1000';
        respawnOverlay.style.display = 'flex';
        respawnOverlay.style.flexDirection = 'column';
        respawnOverlay.style.justifyContent = 'center';
        respawnOverlay.style.alignItems = 'center';
        respawnOverlay.style.fontFamily = 'Arial, sans-serif';
        
        const parachuteText = document.createElement('div');
        parachuteText.textContent = '🪂 PARACHUTING IN...';
        parachuteText.style.color = 'white';
        parachuteText.style.fontSize = '36px';
        parachuteText.style.fontWeight = 'bold';
        parachuteText.style.textShadow = '2px 2px 4px black';
        parachuteText.style.marginBottom = '20px';
        
        const countdownText = document.createElement('div');
        countdownText.id = 'respawnCountdown';
        countdownText.style.color = 'white';
        countdownText.style.fontSize = '24px';
        countdownText.style.textShadow = '1px 1px 2px black';
        
        respawnOverlay.appendChild(parachuteText);
        respawnOverlay.appendChild(countdownText);
        document.body.appendChild(respawnOverlay);
        
        // Countdown timer
        const updateCountdown = () => {
            const now = Date.now();
            const timeLeft = Math.max(0, respawnTime - now);
            
            if (timeLeft > 0) {
                const seconds = Math.ceil(timeLeft / 1000);
                countdownText.textContent = `Respawn in ${seconds} seconds...`;
            } else {
                countdownText.textContent = 'Touchdown!';
                setTimeout(() => {
                    if (respawnOverlay.parentNode) {
                        respawnOverlay.parentNode.removeChild(respawnOverlay);
                    }
                }, 1000);
            }
        };
        
        updateCountdown();
        const countdownInterval = setInterval(updateCountdown, 100);
        
        // Clean up interval when overlay is removed
        setTimeout(() => {
            clearInterval(countdownInterval);
        }, 3000);
    }
    
    showDamageEffect() {
        // Flash the screen red when taking damage
        const damageOverlay = document.createElement('div');
        damageOverlay.style.position = 'fixed';
        damageOverlay.style.top = '0';
        damageOverlay.style.left = '0';
        damageOverlay.style.width = '100%';
        damageOverlay.style.height = '100%';
        damageOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
        damageOverlay.style.pointerEvents = 'none';
        damageOverlay.style.zIndex = '1000';
        damageOverlay.style.transition = 'opacity 0.2s ease-out';
        
        document.body.appendChild(damageOverlay);
        
        // Remove the overlay after animation
        setTimeout(() => {
            damageOverlay.style.opacity = '0';
            setTimeout(() => {
                if (damageOverlay.parentNode) {
                    damageOverlay.parentNode.removeChild(damageOverlay);
                }
            }, 200);
        }, 100);
    }
    
    showDamageNumber(damage, position, collisionType = 'normal') {
        // Create floating damage number
        const damageElement = document.createElement('div');
        damageElement.textContent = damage.toString();
        damageElement.style.position = 'fixed';
        damageElement.style.pointerEvents = 'none';
        damageElement.style.zIndex = '1500';
        damageElement.style.fontSize = '24px';
        damageElement.style.fontWeight = 'bold';
        damageElement.style.textShadow = '2px 2px 4px black';
        damageElement.style.transition = 'all 1.5s ease-out';
        
        // Set color based on collision type
        switch (collisionType) {
            case 'headshot':
                damageElement.style.color = '#ffd700'; // Gold
                damageElement.style.fontSize = '32px';
                break;
            case 'rear':
                damageElement.style.color = '#ff4444'; // Red
                damageElement.style.fontSize = '28px';
                break;
            case 'side':
                damageElement.style.color = '#ffaa00'; // Orange
                break;
            case 'front-bumper':
                damageElement.style.color = '#00ff00'; // Green (no damage)
                damageElement.textContent = 'BLOCKED';
                break;
            default:
                damageElement.style.color = '#ffffff'; // White
        }
        
        // Convert 3D position to screen position (simplified)
        const screenX = (position.x / 160) * window.innerWidth + window.innerWidth / 2;
        const screenY = (position.z / 160) * window.innerHeight + window.innerHeight / 2;
        
        damageElement.style.left = `${screenX}px`;
        damageElement.style.top = `${screenY}px`;
        
        document.body.appendChild(damageElement);
        
        // Animate the damage number
        setTimeout(() => {
            damageElement.style.transform = 'translateY(-100px) scale(1.5)';
            damageElement.style.opacity = '0';
        }, 100);
        
        // Remove after animation
        setTimeout(() => {
            if (damageElement.parentNode) {
                damageElement.parentNode.removeChild(damageElement);
            }
        }, 1500);
    }
    
    showSideCollisionEffect() {
        const collisionOverlay = document.createElement('div');
        collisionOverlay.style.position = 'fixed';
        collisionOverlay.style.top = '0';
        collisionOverlay.style.left = '0';
        collisionOverlay.style.width = '100%';
        collisionOverlay.style.height = '100%';
        collisionOverlay.style.background = 'radial-gradient(circle, rgba(255, 170, 0, 0.6) 0%, rgba(255, 100, 0, 0.4) 50%, rgba(255, 50, 0, 0.2) 100%)';
        collisionOverlay.style.pointerEvents = 'none';
        collisionOverlay.style.zIndex = '1000';
        collisionOverlay.style.transition = 'opacity 0.3s ease-out';
        
        document.body.appendChild(collisionOverlay);
        
        setTimeout(() => {
            collisionOverlay.style.opacity = '0';
            setTimeout(() => {
                if (collisionOverlay.parentNode) {
                    collisionOverlay.parentNode.removeChild(collisionOverlay);
                }
            }, 300);
        }, 200);
    }
    
    showRearCollisionEffect() {
        const collisionOverlay = document.createElement('div');
        collisionOverlay.style.position = 'fixed';
        collisionOverlay.style.top = '0';
        collisionOverlay.style.left = '0';
        collisionOverlay.style.width = '100%';
        collisionOverlay.style.height = '100%';
        collisionOverlay.style.background = 'radial-gradient(circle, rgba(255, 0, 0, 0.7) 0%, rgba(255, 50, 0, 0.5) 50%, rgba(255, 100, 0, 0.3) 100%)';
        collisionOverlay.style.pointerEvents = 'none';
        collisionOverlay.style.zIndex = '1000';
        collisionOverlay.style.transition = 'opacity 0.4s ease-out';
        collisionOverlay.style.animation = 'shake 0.2s ease-in-out';
        
        const style = document.createElement('style');
        style.textContent = `
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-8px); }
                75% { transform: translateX(8px); }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(collisionOverlay);
        
        setTimeout(() => {
            collisionOverlay.style.opacity = '0';
            setTimeout(() => {
                if (collisionOverlay.parentNode) {
                    collisionOverlay.parentNode.removeChild(collisionOverlay);
                }
                if (style.parentNode) {
                    style.parentNode.removeChild(style);
                }
            }, 400);
        }, 200);
    }
    
    showHeadOnCollisionEffect() {
        // EPIC head-on collision effect! 💥
        const collisionOverlay = document.createElement('div');
        collisionOverlay.style.position = 'fixed';
        collisionOverlay.style.top = '0';
        collisionOverlay.style.left = '0';
        collisionOverlay.style.width = '100%';
        collisionOverlay.style.height = '100%';
        collisionOverlay.style.background = 'radial-gradient(circle, rgba(255, 0, 0, 0.8) 0%, rgba(255, 165, 0, 0.6) 50%, rgba(255, 255, 0, 0.4) 100%)';
        collisionOverlay.style.pointerEvents = 'none';
        collisionOverlay.style.zIndex = '1000';
        collisionOverlay.style.transition = 'opacity 0.5s ease-out';
        collisionOverlay.style.animation = 'shake 0.3s ease-in-out';
        
        // Add shake animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-10px); }
                75% { transform: translateX(10px); }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(collisionOverlay);
        
        // Add explosion text
        const explosionText = document.createElement('div');
        explosionText.textContent = '💥 HEAD-ON CRASH! 💥';
        explosionText.style.position = 'fixed';
        explosionText.style.top = '50%';
        explosionText.style.left = '50%';
        explosionText.style.transform = 'translate(-50%, -50%)';
        explosionText.style.color = 'white';
        explosionText.style.fontSize = '48px';
        explosionText.style.fontWeight = 'bold';
        explosionText.style.textShadow = '2px 2px 4px black';
        explosionText.style.pointerEvents = 'none';
        explosionText.style.zIndex = '1001';
        explosionText.style.animation = 'fadeInOut 1s ease-in-out';
        
        const textStyle = document.createElement('style');
        textStyle.textContent = `
            @keyframes fadeInOut {
                0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
                50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
                100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
            }
        `;
        document.head.appendChild(textStyle);
        
        document.body.appendChild(explosionText);
        
        // Remove the overlays after animation
        setTimeout(() => {
            collisionOverlay.style.opacity = '0';
            setTimeout(() => {
                if (collisionOverlay.parentNode) {
                    collisionOverlay.parentNode.removeChild(collisionOverlay);
                }
                if (explosionText.parentNode) {
                    explosionText.parentNode.removeChild(explosionText);
                }
                if (style.parentNode) {
                    style.parentNode.removeChild(style);
                }
                if (textStyle.parentNode) {
                    textStyle.parentNode.removeChild(textStyle);
                }
            }, 500);
        }, 300);
    }
    
    showHeadshotEffect() {
        const headshotOverlay = document.createElement('div');
        headshotOverlay.style.position = 'fixed';
        headshotOverlay.style.top = '0';
        headshotOverlay.style.left = '0';
        headshotOverlay.style.width = '100%';
        headshotOverlay.style.height = '100%';
        headshotOverlay.style.background = 'radial-gradient(circle, rgba(255, 215, 0, 0.9) 0%, rgba(255, 140, 0, 0.7) 50%, rgba(255, 69, 0, 0.5) 100%)';
        headshotOverlay.style.pointerEvents = 'none';
        headshotOverlay.style.zIndex = '1000';
        headshotOverlay.style.transition = 'opacity 0.5s ease-out';
        headshotOverlay.style.animation = 'headshotShake 0.4s ease-in-out';
        const style = document.createElement('style');
        style.textContent = `
            @keyframes headshotShake {
                0%, 100% { transform: translateX(0) translateY(0); }
                25% { transform: translateX(-15px) translateY(-5px); }
                50% { transform: translateX(15px) translateY(5px); }
                75% { transform: translateX(-10px) translateY(-3px); }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(headshotOverlay);
        const headshotText = document.createElement('div');
        headshotText.textContent = '🎯 HEADSHOT! 🎯';
        headshotText.style.position = 'fixed';
        headshotText.style.top = '50%';
        headshotText.style.left = '50%';
        headshotText.style.transform = 'translate(-50%, -50%)';
        headshotText.style.color = 'white';
        headshotText.style.fontSize = '52px';
        headshotText.style.fontWeight = 'bold';
        headshotText.style.textShadow = '3px 3px 6px black, 0 0 20px rgba(255, 215, 0, 0.8)';
        headshotText.style.pointerEvents = 'none';
        headshotText.style.zIndex = '1001';
        headshotText.style.animation = 'headshotFadeInOut 1.2s ease-in-out';
        const textStyle = document.createElement('style');
        textStyle.textContent = `
            @keyframes headshotFadeInOut {
                0% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
                30% { opacity: 1; transform: translate(-50%, -50%) scale(1.3); }
                70% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
                100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
            }
        `;
        document.head.appendChild(textStyle);
        document.body.appendChild(headshotText);
        setTimeout(() => {
            headshotOverlay.style.opacity = '0';
            setTimeout(() => {
                if (headshotOverlay.parentNode) {
                    headshotOverlay.parentNode.removeChild(headshotOverlay);
                }
                if (headshotText.parentNode) {
                    headshotText.parentNode.removeChild(headshotText);
                }
                if (style.parentNode) {
                    style.parentNode.removeChild(style);
                }
                if (textStyle.parentNode) {
                    textStyle.parentNode.removeChild(textStyle);
                }
            }, 500);
        }, 400);
    }
    
    showGameOver() {
        // Create game over overlay
        const gameOverOverlay = document.createElement('div');
        gameOverOverlay.style.position = 'fixed';
        gameOverOverlay.style.top = '0';
        gameOverOverlay.style.left = '0';
        gameOverOverlay.style.width = '100%';
        gameOverOverlay.style.height = '100%';
        gameOverOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        gameOverOverlay.style.display = 'flex';
        gameOverOverlay.style.flexDirection = 'column';
        gameOverOverlay.style.justifyContent = 'center';
        gameOverOverlay.style.alignItems = 'center';
        gameOverOverlay.style.zIndex = '2000';
        gameOverOverlay.style.color = 'white';
        gameOverOverlay.style.fontFamily = 'Arial, sans-serif';
        
        gameOverOverlay.innerHTML = `
            <h1 style="font-size: 4rem; margin-bottom: 1rem; color: #ff0000;">GAME OVER</h1>
            <p style="font-size: 1.5rem; margin-bottom: 2rem;">Your car has been destroyed!</p>
            <button id="respawnBtn" style="
                padding: 1rem 2rem;
                font-size: 1.2rem;
                background: #00ff00;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                transition: background 0.3s;
            ">Respawn</button>
        `;
        
        document.body.appendChild(gameOverOverlay);
        
        // Add respawn button functionality
        const respawnBtn = document.getElementById('respawnBtn');
        respawnBtn.addEventListener('click', () => {
            document.body.removeChild(gameOverOverlay);
            // Trigger respawn event
            window.dispatchEvent(new CustomEvent('respawn'));
        });
        
        respawnBtn.addEventListener('mouseenter', () => {
            respawnBtn.style.background = '#00cc00';
        });
        
        respawnBtn.addEventListener('mouseleave', () => {
            respawnBtn.style.background = '#00ff00';
        });
    }
    
    showVictory() {
        // Create victory overlay
        const victoryOverlay = document.createElement('div');
        victoryOverlay.style.position = 'fixed';
        victoryOverlay.style.top = '0';
        victoryOverlay.style.left = '0';
        victoryOverlay.style.width = '100%';
        victoryOverlay.style.height = '100%';
        victoryOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        victoryOverlay.style.display = 'flex';
        victoryOverlay.style.flexDirection = 'column';
        victoryOverlay.style.justifyContent = 'center';
        victoryOverlay.style.alignItems = 'center';
        victoryOverlay.style.zIndex = '2000';
        victoryOverlay.style.color = 'white';
        victoryOverlay.style.fontFamily = 'Arial, sans-serif';
        
        victoryOverlay.innerHTML = `
            <h1 style="font-size: 4rem; margin-bottom: 1rem; color: #00ff00;">VICTORY!</h1>
            <p style="font-size: 1.5rem; margin-bottom: 2rem;">You are the last car standing!</p>
            <button id="playAgainBtn" style="
                padding: 1rem 2rem;
                font-size: 1.2rem;
                background: #00ff00;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                transition: background 0.3s;
            ">Play Again</button>
        `;
        
        document.body.appendChild(victoryOverlay);
        
        // Add play again button functionality
        const playAgainBtn = document.getElementById('playAgainBtn');
        playAgainBtn.addEventListener('click', () => {
            document.body.removeChild(victoryOverlay);
            // Trigger play again event
            window.dispatchEvent(new CustomEvent('playAgain'));
        });
        
        playAgainBtn.addEventListener('mouseenter', () => {
            playAgainBtn.style.background = '#00cc00';
        });
        
        playAgainBtn.addEventListener('mouseleave', () => {
            playAgainBtn.style.background = '#00ff00';
        });
    }
    
    showLoadingMessage(message) {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            const messageElement = loadingScreen.querySelector('p');
            if (messageElement) {
                messageElement.textContent = message;
            }
        }
    }
    
    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
    }
    
    showDebugInfo(info) {
        // Create or update debug info display
        let debugElement = document.getElementById('debugInfo');
        if (!debugElement) {
            debugElement = document.createElement('div');
            debugElement.id = 'debugInfo';
            debugElement.style.position = 'absolute';
            debugElement.style.top = '20px';
            debugElement.style.right = '20px';
            debugElement.style.color = 'white';
            debugElement.style.fontFamily = 'monospace';
            debugElement.style.fontSize = '12px';
            debugElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            debugElement.style.padding = '10px';
            debugElement.style.borderRadius = '5px';
            debugElement.style.zIndex = '100';
            document.getElementById('gameContainer').appendChild(debugElement);
        }
        
        debugElement.innerHTML = info;
    }
} 