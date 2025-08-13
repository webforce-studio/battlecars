import { Howl, Howler } from 'howler';
import { SoundGenerator } from '../utils/SoundGenerator.js';
import { GameSoundPack } from '../utils/GameSoundPack.js';

export class HybridSoundManager {
    constructor() {
        this.soundGenerator = new SoundGenerator();
        this.gameSoundPack = new GameSoundPack();
        this.sounds = {};
        this.isEngineRunning = false;
        this.currentSpeed = 0;
        this.masterVolume = 0.7;
        this.soundEnabled = true;
        this.useGeneratedSounds = false; // Disable procedural oscillators by default
        this.engineSoundEnabled = true; // Enable engine sounds by default
        this.useSimpleEngineSounds = true; // Use simple, pleasant engine sounds
        this.useGameSoundPack = true; // Use the new game sound pack
        this.lastSpeed = 0; // Track last speed for dynamic engine sounds
        this.currentEngineBand = null; // Track current engine band to avoid re-triggering every frame
        this.preferFileAnthem = true; // Enable file-based anthem when available in /public/sounds
        
        this.initializeSounds();
        this.setupGlobalVolume();
        
        console.log('🎵 Sound Manager initialized:', {
            soundEnabled: this.soundEnabled,
            useGameSoundPack: this.useGameSoundPack,
            useGeneratedSounds: this.useGeneratedSounds,
            engineSoundEnabled: this.engineSoundEnabled
        });
    }

    initializeSounds() {
        if (this.useGameSoundPack) {
            // Use the new game sound pack
            this.initializeGeneratedSounds(); // Game sound pack uses same structure
        } else if (this.useGeneratedSounds) {
            // Use original generated sounds (Web Audio API)
            this.initializeGeneratedSounds();
        } else {
            // Use file-based sounds (Howler.js)
            this.initializeFileBasedSounds();
        }
    }

    initializeGeneratedSounds() {
        // Engine sounds will be generated on-demand
        this.sounds.engine = {
            idle: null,
            low: null,
            medium: null,
            high: null
        };

        // Collision sounds will be generated on-demand
        this.sounds.collision = {
            front: null,
            side: null,
            rear: null,
            headshot: null,
            wall: null
        };

        // Crowd reaction
        this.sounds.crowdCheer = null;

        // Boost sounds will be generated on-demand
        this.sounds.boost = {
            activate: null,
            whoosh: null
        };

        // UI sounds will be generated on-demand
        this.sounds.ui = {
            button: null,
            damage: null,
            respawn: null,
            victory: null,
            countdown: null
        };

        // Powerup sounds (generated/file fallback)
        this.sounds.powerup = {
            generic: null,
            shield: null
        };

        // Ambient sounds will be generated on-demand
        this.sounds.ambient = {
            crowd: null,
            wind: null,
            anthem: null
        };

        // Movement sounds will be generated on-demand
        this.sounds.movement = {
            tireScreech: null,
            drift: null
        };
    }

    initializeFileBasedSounds() {
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

        // Crowd reaction sound (cheer)
        this.sounds.crowdCheer = new Howl({
            src: ['/src/audio/crowd-cheer.mp3'],
            volume: 0.9,
            preload: true
        });

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

        // Powerup sounds (file-based if present)
        this.sounds.powerup = {
            generic: new Howl({
                src: ['/src/audio/powerup-generic.mp3'],
                volume: 0.9,
                preload: true
            }),
            shield: new Howl({
                src: ['/src/audio/powerup-shield.mp3'],
                volume: 0.9,
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
        if (!this.useGeneratedSounds) {
            Howler.volume(this.masterVolume);
        }
        // Apply to GameSoundPack master as well
        if (this.gameSoundPack && this.gameSoundPack.masterGain) {
            this.gameSoundPack.masterGain.gain.value = this.masterVolume;
        }
    }

    // Engine sound management
    startEngine() {
        if (!this.soundEnabled || !this.engineSoundEnabled || this.isEngineRunning) return;
        
        this.isEngineRunning = true;
        this.currentEngineBand = null; // reset so first update triggers
        this.updateEngineSound(0);
        
        // Kick the layered engine so idle is audible immediately
        try {
            if (this.useGameSoundPack && this.gameSoundPack) {
                this.gameSoundPack.generateEngineSound('idle', 2.0);
                this.gameSoundPack.setEngineRpm(0);
            }
        } catch (_) {}
    }

    stopEngine() {
        if (!this.isEngineRunning) return;
        
        this.isEngineRunning = false;
        
        if (this.useGameSoundPack) {
            // Stop Game Sound Pack engine sounds
            this.gameSoundPack.stopEngineSound();
        } else if (!this.useGeneratedSounds) {
            // Stop Howler.js engine sounds
            Object.values(this.sounds.engine).forEach(sound => {
                if (sound && sound.stop) {
                    sound.stop();
                }
            });
        }
    }

    // Helper: compute engine band from speed
    getEngineBand(speed) {
        if (speed < 5) return 'idle';
        if (speed < 15) return 'low';
        if (speed < 25) return 'medium';
        return 'high';
    }

    updateEngineSound(speed) {
        if (!this.soundEnabled || !this.engineSoundEnabled || !this.isEngineRunning) return;

        this.currentSpeed = speed;
        // Continuous RPM update for layered engine
        if (this.useGameSoundPack && this.gameSoundPack && this.gameSoundPack.updateEngineRpmFromSpeed) {
            this.gameSoundPack.updateEngineRpmFromSpeed(speed);
        }
        
        const nextBand = this.getEngineBand(speed);
        if (nextBand === this.currentEngineBand) return; // no change, keep playing
        this.currentEngineBand = nextBand;
        
        if (this.useGameSoundPack) {
            // Use the new game sound pack (only when band changes)
            try {
                this.gameSoundPack.resume();
                // For layered mode we do not stop; just hint desired band center
                this.gameSoundPack.generateEngineSound(nextBand, 2.0);
                this.lastSpeed = speed;
            } catch (error) {
                console.warn('Game Sound Pack error (staying on Game Pack):', error);
                // Stay on GameSoundPack; do not fallback to procedural
            }
            
        } else if (this.useGeneratedSounds) {
            // Generate engine sound based on speed only when band changes
            this.soundGenerator.resume();
            // Stop any existing engine sounds
            Object.values(this.sounds.engine).forEach(sound => {
                if (sound) {
                    if (sound.oscillators) {
                        sound.oscillators.forEach(osc => osc?.stop());
                    } else if (sound.oscillator) {
                        sound.oscillator?.stop();
                    }
                }
            });
            
            if (this.useSimpleEngineSounds) {
                this.sounds.engine[nextBand] = this.soundGenerator.generateSimpleEngineSound(nextBand, 2.0);
                const s = this.sounds.engine[nextBand];
                if (s && s.oscillator) s.oscillator.start();
            } else {
                this.sounds.engine[nextBand] = this.soundGenerator.generateEngineSound(nextBand, 2.0);
                const s = this.sounds.engine[nextBand];
                if (s && s.oscillators) s.oscillators.forEach(osc => osc.start());
            }
        } else {
            // File-based
            Object.values(this.sounds.engine).forEach(sound => {
                if (sound && sound.stop) sound.stop();
            });

            if (nextBand === 'idle') {
                this.sounds.engine.idle.play();
            } else if (nextBand === 'low') {
                this.sounds.engine.low.play();
            } else if (nextBand === 'medium') {
                this.sounds.engine.medium.play();
            } else {
                this.sounds.engine.high.play();
            }
        }
    }

    // Collision sounds
    playCollisionSound(type, impactForce = 1.0) {
        if (!this.soundEnabled) return;
        
        console.log('🎵 Playing collision sound:', type, 'Force:', impactForce, 'GamePack:', this.useGameSoundPack, 'Generated:', this.useGeneratedSounds);
        
        if (type === 'headshot') {
            // Always add a short crowd cheer on headshot (non-looping, file-based preferred if available)
            try {
                if (this.sounds.crowdCheer && this.sounds.crowdCheer.play) {
                    this.sounds.crowdCheer.stop();
                    this.sounds.crowdCheer.play();
                } else if (this.useGameSoundPack && this.gameSoundPack && this.gameSoundPack.generateUISound) {
                    this.gameSoundPack.resume();
                    const s = this.gameSoundPack.generateUISound('victory', 0.35);
                    if (s) {
                        s.oscillator.start();
                        s.oscillator.stop(this.gameSoundPack.audioContext.currentTime + 0.35);
                    }
                }
            } catch (_) {}
        }

        if (this.useGameSoundPack) {
            // Use the new game sound pack with impact force
            this.gameSoundPack.resume();
            const sound = this.gameSoundPack.generateCollisionSound(type, impactForce, 0.6);
            if (sound) {
                sound.oscillator.start();
                sound.oscillator.stop(this.gameSoundPack.audioContext.currentTime + 0.6);
                console.log('🎵 Game Pack collision sound played');
            }
        } else if (this.useGeneratedSounds) {
            // Use original sound generator
            this.soundGenerator.resume();
            const sound = this.soundGenerator.generateCollisionSound(type, 0.5);
            if (sound) {
                sound.oscillator.start();
                sound.oscillator.stop(this.soundGenerator.audioContext.currentTime + 0.5);
            }
        } else {
            // Use Howler.js file-based sound
            const sound = this.sounds.collision[type];
            if (sound && sound.play) {
                sound.play();
            }
        }
    }

    // Boost pad sounds
    playBoostSound(speed = 0) {
        if (!this.soundEnabled) return;
        
        console.log('🚀 Playing boost sound. Speed:', speed, 'GamePack:', this.useGameSoundPack, 'Generated:', this.useGeneratedSounds);
        
        if (this.useGameSoundPack) {
            // Use the new game sound pack with speed-based effects
            this.gameSoundPack.resume();
            const sound = this.gameSoundPack.generateBoostSound(speed, 1.2);
            if (sound) {
                sound.oscillator.start();
                sound.oscillator.stop(this.gameSoundPack.audioContext.currentTime + 1.2);
                console.log('🚀 Game Pack boost sound played');
            }
        } else if (this.useGeneratedSounds) {
            // Use original sound generator
            this.soundGenerator.resume();
            const sound = this.soundGenerator.generateBoostSound(1.0);
            if (sound) {
                sound.oscillator.start();
                sound.oscillator.stop(this.soundGenerator.audioContext.currentTime + 1.0);
            }
        } else {
            // Use Howler.js file-based sounds
            this.sounds.boost.activate.play();
            setTimeout(() => {
                this.sounds.boost.whoosh.play();
            }, 200);
        }
    }

    // UI sounds
    playUISound(type) {
        if (!this.soundEnabled) return;
        
        if (this.useGameSoundPack) {
            // Use the new game sound pack
            this.gameSoundPack.resume();
            const sound = this.gameSoundPack.generateUISound(type, 0.15);
            if (sound) {
                sound.oscillator.start();
                sound.oscillator.stop(this.gameSoundPack.audioContext.currentTime + 0.15);
            }
        } else if (this.useGeneratedSounds) {
            // Use original sound generator
            this.soundGenerator.resume();
            const sound = this.soundGenerator.generateUISound(type, 0.2);
            if (sound) {
                sound.oscillator.start();
                sound.oscillator.stop(this.soundGenerator.audioContext.currentTime + 0.2);
            }
        } else {
            // Use Howler.js file-based sound
            const sound = this.sounds.ui[type];
            if (sound && sound.play) {
                sound.play();
            }
        }
    }

    // Ambient sounds
    startAmbientSounds() {
        if (!this.soundEnabled) return;
        
        // Disabled ambient sounds to eliminate background noise
        console.log('🔇 Ambient sounds disabled to prevent background noise');
        
        // if (this.useGeneratedSounds) {
        //     // Generate ambient sounds
        //     this.sounds.ambient.crowd = this.soundGenerator.generateAmbientSound('crowd', 5.0);
        //     this.sounds.ambient.wind = this.soundGenerator.generateAmbientSound('wind', 5.0);
        //     
        //     if (this.sounds.ambient.crowd) {
        //         this.sounds.ambient.crowd.oscillator.start();
        //     }
        //     if (this.sounds.ambient.wind) {
        //         this.sounds.ambient.wind.oscillator.start();
        //     }
        // } else {
        //     // Use Howler.js file-based sounds
        //     this.sounds.ambient.crowd.play();
        //     this.sounds.ambient.wind.play();
        // }
    }

    // --- Intro anthem control ---
    unlockAudio() {
        try { if (Howler && Howler.ctx && Howler.ctx.state !== 'running') { Howler.ctx.resume(); } } catch(_) {}
        try { if (this.gameSoundPack && this.gameSoundPack.audioContext && this.gameSoundPack.audioContext.state !== 'running') { this.gameSoundPack.audioContext.resume(); } } catch(_) {}
    }
    playAnthemLoop() {
        if (!this.soundEnabled) return;
        // By default, avoid fetching external files in production; use synth anthem
        if (!this.preferFileAnthem) {
            this._startSynthAnthem();
            return;
        }
        try {
            if (!this.sounds.ambient.anthem) {
                // Files should be placed in /public/sounds if enabled
                this.sounds.ambient.anthem = new Howl({
                    src: [
                        '/sounds/anthem_rock_loop.m4a',
                        '/sounds/anthem_rock_loop.mp3',
                        '/sounds/anthem_rock_loop.webm'
                    ],
                    loop: true,
                    volume: 0.45,
                    preload: true,
                    onloaderror: () => { this._startSynthAnthem(); },
                    onplayerror: () => { this._startSynthAnthem(); }
                });
            }
            if (!this.sounds.ambient.anthem.playing()) {
                this.sounds.ambient.anthem.fade(0, 0.45, 400);
                this.sounds.ambient.anthem.play();
            }
        } catch (e) { console.warn('Anthem play error', e); }
    }
    fadeOutAnthem(ms = 3000) {
        try {
            const a = this.sounds.ambient.anthem;
            if (a && a.playing()) {
                a.fade(a.volume(), 0, Math.max(200, ms));
                setTimeout(() => { try { a.stop(); } catch(_){} }, Math.max(250, ms + 50));
            }
        } catch(_) {}
        // stop synth fallback
        this._stopSynthAnthemFade(ms);
    }

    // --- Simple synthesized anthem (fallback if file missing or blocked) ---
    _startSynthAnthem() {
        try {
            if (this._anthemTimer) return; // already running
            const ctx = (this.gameSoundPack && this.gameSoundPack.audioContext) ? this.gameSoundPack.audioContext : (Howler?.ctx || new (window.AudioContext||window.webkitAudioContext)());
            this._anthemCtx = ctx;
            const gain = ctx.createGain();
            gain.gain.value = 0.0; // fade in
            gain.connect(ctx.destination);
            this._anthemGain = gain;
            // Simple drum+bass loop at 120 BPM (0.5s beat)
            const bpm = 120; const beatMs = 60000 / bpm; // 500ms
            const scheduleBeat = () => {
                const now = ctx.currentTime;
                // Kick
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.type = 'sine'; o.frequency.setValueAtTime(110, now); o.frequency.exponentialRampToValueAtTime(40, now + 0.25);
                g.gain.setValueAtTime(0.8, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                o.connect(g).connect(gain);
                o.start(now); o.stop(now + 0.26);
                // Snare (on 2 and 4)
                const step = this._anthemStep || 0;
                if (step % 2 === 1) {
                    const sn = ctx.createOscillator(); const sg = ctx.createGain();
                    sn.type = 'triangle'; sn.frequency.setValueAtTime(220, now); sn.frequency.exponentialRampToValueAtTime(120, now + 0.12);
                    sg.gain.setValueAtTime(0.6, now); sg.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                    sn.connect(sg).connect(gain); sn.start(now); sn.stop(now + 0.13);
                }
                // Bass note (simple riff: root, root, bVII, VI)
                const notes = [55,55,49,46];
                const n = notes[step % notes.length];
                const bo = ctx.createOscillator(); const bg = ctx.createGain();
                bo.type = 'sawtooth'; bo.frequency.setValueAtTime(n, now);
                bg.gain.setValueAtTime(0.15, now); bg.gain.linearRampToValueAtTime(0.08, now + 0.3);
                bo.connect(bg).connect(gain); bo.start(now); bo.stop(now + 0.45);
                this._anthemStep = (step + 1) % 4;
            };
            this._anthemTimer = setInterval(scheduleBeat, beatMs);
            // Fade in
            const target = 0.35 * this.masterVolume;
            gain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.4);
        } catch(e) { console.warn('Synth anthem error', e); }
    }
    _stopSynthAnthemFade(ms=3000) {
        if (!this._anthemGain || !this._anthemCtx) return;
        try {
            const g = this._anthemGain; const ctx = this._anthemCtx;
            const now = ctx.currentTime; const end = now + Math.max(0.2, ms/1000);
            g.gain.cancelScheduledValues(now);
            g.gain.setValueAtTime(g.gain.value, now);
            g.gain.linearRampToValueAtTime(0.0001, end);
            setTimeout(() => {
                try { if (this._anthemTimer) { clearInterval(this._anthemTimer); this._anthemTimer = null; } } catch(_){ }
            }, ms + 60);
        } catch(_){ }
    }

    stopAmbientSounds() {
        // Ambient sounds are disabled
        console.log('🔇 Stop ambient sounds called (already disabled)');
        
        // if (this.useGeneratedSounds) {
        //     // Stop generated ambient sounds
        //     if (this.sounds.ambient.crowd) {
        //         this.sounds.ambient.crowd.oscillator?.stop();
        //     }
        //     if (this.sounds.ambient.wind) {
        //         this.sounds.ambient.wind.oscillator?.stop();
        //     }
        // } else {
        //     // Stop Howler.js file-based sounds
        //     Object.values(this.sounds.ambient).forEach(sound => {
        //         if (sound && sound.stop) {
        //             sound.stop();
        //         }
        //     });
        // }
    }

    // Movement sounds
    playTireScreech() {
        if (!this.soundEnabled) return;
        
        this.soundGenerator.resume();
        
        if (this.useGeneratedSounds) {
            const sound = this.soundGenerator.generateMovementSound('tireScreech', 0.8);
            if (sound) {
                sound.oscillator.start();
                sound.oscillator.stop(this.soundGenerator.audioContext.currentTime + 0.8);
            }
        } else {
            this.sounds.movement.tireScreech.play();
        }
    }

    playDrift() {
        if (!this.soundEnabled) return;
        
        this.soundGenerator.resume();
        
        if (this.useGeneratedSounds) {
            const sound = this.soundGenerator.generateMovementSound('drift', 0.8);
            if (sound) {
                sound.oscillator.start();
                sound.oscillator.stop(this.soundGenerator.audioContext.currentTime + 0.8);
            }
        } else {
            this.sounds.movement.drift.play();
        }
    }

    // Powerup collection sounds
    playPowerupSound(type) {
        if (!this.soundEnabled) return;
        const isShield = (type === 'shield');
        if (this.useGameSoundPack) {
            try {
                // Simple synth fallback using GameSoundPack
                this.gameSoundPack.resume();
                const ctx = this.gameSoundPack.audioContext;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = isShield ? 'sawtooth' : 'triangle';
                const now = ctx.currentTime;
                if (isShield) {
                    osc.frequency.setValueAtTime(880, now);
                    osc.frequency.exponentialRampToValueAtTime(330, now + 0.18);
                } else {
                    osc.frequency.setValueAtTime(440, now);
                    osc.frequency.exponentialRampToValueAtTime(740, now + 0.22);
                }
                gain.gain.setValueAtTime(0.0, now);
                gain.gain.linearRampToValueAtTime(0.6, now + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                osc.connect(gain).connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.26);
                return;
            } catch (_) { /* fall through */ }
        }
        if (!this.useGeneratedSounds) {
            const h = isShield ? this.sounds.powerup?.shield : this.sounds.powerup?.generic;
            if (h && h.play) { h.stop(); h.play(); return; }
        }
        // Basic WebAudio fallback when no files
        try {
            const ctx = (Howler?.ctx) || new (window.AudioContext || window.webkitAudioContext)();
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.type = isShield ? 'sawtooth' : 'triangle';
            const now = ctx.currentTime;
            if (isShield) {
                o.frequency.setValueAtTime(900, now); o.frequency.exponentialRampToValueAtTime(300, now + 0.22);
            } else {
                o.frequency.setValueAtTime(420, now); o.frequency.exponentialRampToValueAtTime(720, now + 0.22);
            }
            g.gain.setValueAtTime(0.0, now); g.gain.linearRampToValueAtTime(0.7, now + 0.03); g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            o.connect(g).connect(ctx.destination); o.start(now); o.stop(now + 0.26);
        } catch (_) {}
    }

    // Volume controls
    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        
        if (!this.useGeneratedSounds) {
            Howler.volume(this.masterVolume);
        }
        if (this.gameSoundPack && this.gameSoundPack.masterGain) {
            this.gameSoundPack.masterGain.gain.value = this.masterVolume;
        }
    }

    setSoundEnabled(enabled) {
        this.soundEnabled = enabled;
        if (!enabled) {
            this.stopEngine();
            this.stopAmbientSounds();
        }
    }

    setEngineSoundEnabled(enabled) {
        this.engineSoundEnabled = enabled;
        if (!enabled) {
            this.stopEngine();
        } else if (this.soundEnabled && !this.isEngineRunning) {
            this.startEngine();
        }
    }

    setUseGameSoundPack(enabled) {
        this.useGameSoundPack = enabled;
    }

    // Toggle between generated and file-based sounds
    setUseGeneratedSounds(useGenerated) {
        this.useGeneratedSounds = useGenerated;
        this.initializeSounds();
    }

    // Utility methods
    preloadAll() {
        if (!this.useGeneratedSounds) {
            console.log('🎵 All sounds preloaded');
        } else {
            console.log('🎵 Using generated sounds');
        }
    }

    cleanup() {
        if (!this.useGeneratedSounds) {
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
} 