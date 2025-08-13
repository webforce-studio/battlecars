import { Howl, Howler } from 'howler';

export class SoundManager {
    constructor() {
        this.sounds = {};
        this.engineSound = null;
        this.isEngineRunning = false;
        this.currentSpeed = 0;
        this.masterVolume = 0.7;
        this.soundEnabled = true;
        
        this.initializeSounds();
        this.setupGlobalVolume();
    }

    initializeSounds() {
        // Engine sounds with different RPM levels
        this.sounds.engine = {
            idle: new Howl({
                src: ['/src/audio/engine-idle.mp3'],
                loop: true,
                volume: 0.3,
                rate: 1.0,
                preload: true
            }),
            low: new Howl({
                src: ['/src/audio/engine-low.mp3'],
                loop: true,
                volume: 0.4,
                rate: 1.0,
                preload: true
            }),
            medium: new Howl({
                src: ['/src/audio/engine-medium.mp3'],
                loop: true,
                volume: 0.5,
                rate: 1.0,
                preload: true
            }),
            high: new Howl({
                src: ['/src/audio/engine-high.mp3'],
                loop: true,
                volume: 0.6,
                rate: 1.0,
                preload: true
            })
        };

        // Collision sounds
        this.sounds.collision = {
            front: new Howl({
                src: ['/src/audio/collision-front.mp3'],
                volume: 0.8,
                preload: true
            }),
            side: new Howl({
                src: ['/src/audio/collision-side.mp3'],
                volume: 0.8,
                preload: true
            }),
            rear: new Howl({
                src: ['/src/audio/collision-rear.mp3'],
                volume: 0.8,
                preload: true
            }),
            headshot: new Howl({
                src: ['/src/audio/collision-headshot.mp3'],
                volume: 1.0,
                preload: true
            }),
            wall: new Howl({
                src: ['/src/audio/collision-wall.mp3'],
                volume: 0.6,
                preload: true
            })
        };

        // Boost pad sounds
        this.sounds.boost = {
            activate: new Howl({
                src: ['/src/audio/boost-activate.mp3'],
                volume: 0.9,
                preload: true
            }),
            whoosh: new Howl({
                src: ['/src/audio/boost-whoosh.mp3'],
                volume: 0.7,
                preload: true
            })
        };

        // UI sounds
        this.sounds.ui = {
            button: new Howl({
                src: ['/src/audio/ui-button.mp3'],
                volume: 0.5,
                preload: true
            }),
            damage: new Howl({
                src: ['/src/audio/ui-damage.mp3'],
                volume: 0.6,
                preload: true
            }),
            respawn: new Howl({
                src: ['/src/audio/ui-respawn.mp3'],
                volume: 0.7,
                preload: true
            }),
            victory: new Howl({
                src: ['/src/audio/ui-victory.mp3'],
                volume: 0.8,
                preload: true
            }),
            countdown: new Howl({
                src: ['/src/audio/ui-countdown.mp3'],
                volume: 0.6,
                preload: true
            })
        };

        // Ambient sounds
        this.sounds.ambient = {
            crowd: new Howl({
                src: ['/src/audio/ambient-crowd.mp3'],
                loop: true,
                volume: 0.2,
                preload: true
            }),
            wind: new Howl({
                src: ['/src/audio/ambient-wind.mp3'],
                loop: true,
                volume: 0.1,
                preload: true
            })
        };

        // Car movement sounds
        this.sounds.movement = {
            tireScreech: new Howl({
                src: ['/src/audio/tire-screech.mp3'],
                volume: 0.7,
                preload: true
            }),
            drift: new Howl({
                src: ['/src/audio/drift.mp3'],
                volume: 0.6,
                preload: true
            })
        };
    }

    setupGlobalVolume() {
        Howler.volume(this.masterVolume);
    }

    // Engine sound management
    startEngine() {
        if (!this.soundEnabled || this.isEngineRunning) return;
        
        this.isEngineRunning = true;
        this.sounds.engine.idle.play();
        this.updateEngineSound(0);
    }

    stopEngine() {
        if (!this.isEngineRunning) return;
        
        this.isEngineRunning = false;
        Object.values(this.sounds.engine).forEach(sound => {
            sound.stop();
        });
    }

    updateEngineSound(speed) {
        if (!this.soundEnabled || !this.isEngineRunning) return;

        this.currentSpeed = speed;
        
        // Stop all engine sounds
        Object.values(this.sounds.engine).forEach(sound => {
            sound.stop();
        });

        // Play appropriate engine sound based on speed
        if (speed < 5) {
            this.sounds.engine.idle.play();
        } else if (speed < 15) {
            this.sounds.engine.low.play();
            this.sounds.engine.low.rate(0.8 + (speed / 25));
        } else if (speed < 25) {
            this.sounds.engine.medium.play();
            this.sounds.engine.medium.rate(0.9 + (speed / 30));
        } else {
            this.sounds.engine.high.play();
            this.sounds.engine.high.rate(1.0 + (speed / 40));
        }
    }

    // Collision sounds
    playCollisionSound(type) {
        if (!this.soundEnabled) return;
        
        const sound = this.sounds.collision[type];
        if (sound) {
            sound.play();
        }
    }

    // Boost pad sounds
    playBoostSound() {
        if (!this.soundEnabled) return;
        
        this.sounds.boost.activate.play();
        setTimeout(() => {
            this.sounds.boost.whoosh.play();
        }, 200);
    }

    // UI sounds
    playUISound(type) {
        if (!this.soundEnabled) return;
        
        const sound = this.sounds.ui[type];
        if (sound) {
            sound.play();
        }
    }

    // Ambient sounds
    startAmbientSounds() {
        if (!this.soundEnabled) return;
        
        this.sounds.ambient.crowd.play();
        this.sounds.ambient.wind.play();
    }

    stopAmbientSounds() {
        Object.values(this.sounds.ambient).forEach(sound => {
            sound.stop();
        });
    }

    // Movement sounds
    playTireScreech() {
        if (!this.soundEnabled) return;
        this.sounds.movement.tireScreech.play();
    }

    playDrift() {
        if (!this.soundEnabled) return;
        this.sounds.movement.drift.play();
    }

    // Volume controls
    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        Howler.volume(this.masterVolume);
    }

    setSoundEnabled(enabled) {
        this.soundEnabled = enabled;
        if (!enabled) {
            this.stopEngine();
            this.stopAmbientSounds();
        }
    }

    // Utility methods
    preloadAll() {
        // Howler automatically preloads when preload: true is set
        console.log('🎵 All sounds preloaded');
    }

    cleanup() {
        Object.values(this.sounds).forEach(category => {
            if (typeof category === 'object') {
                Object.values(category).forEach(sound => {
                    if (sound && typeof sound.unload === 'function') {
                        sound.unload();
                    }
                });
            }
        });
    }
} 