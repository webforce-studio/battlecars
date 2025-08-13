export class GameSoundPack {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.compressor = null;
        this.listener = null;
        this.panner = null; // Single panner for player vehicle; can be extended per-source later

        this.buffers = new Map(); // url -> AudioBuffer
        this.currentEngineSources = []; // Active engine AudioBufferSourceNodes OR OscillatorNodes
        this.currentOneShots = new Set(); // Track one-shot nodes to stop/cleanup if needed

        this.sampleMap = {
            // Place files in /public/sounds (Vite serves them from /sounds/...)
            engine: {
                idle: '/sounds/engine_idle.wav',
                low: '/sounds/engine_low.wav',
                medium: '/sounds/engine_medium.wav',
                high: '/sounds/engine_high.wav'
            },
            collision: {
                front: '/sounds/collision_front.wav',
                side: '/sounds/collision_side.wav',
                rear: '/sounds/collision_rear.wav',
                headshot: '/sounds/collision_headshot.wav',
                wall: '/sounds/collision_wall.wav'
            },
            boost: {
                whoosh: '/sounds/boost_whoosh.wav'
            },
            ui: {
                button: '/sounds/ui_button.wav',
                damage: '/sounds/ui_damage.wav',
                respawn: '/sounds/ui_respawn.wav',
                victory: '/sounds/ui_victory.wav',
                countdown: '/sounds/ui_countdown.wav'
            },
            ambient: {
                crowd: '/sounds/ambient_crowd.wav',
                wind: '/sounds/ambient_wind.wav'
            },
            movement: {
                tireScreech: '/sounds/tire_screech.wav',
                drift: '/sounds/drift.wav'
            }
        };

        // Engine layering state
        this.engineLayers = null; // { idle:{source,gain}, low:{...}, medium:{...}, high:{...} }
        this.engineStarted = false;
        this.engineRpm = 0; // 0..1

        this._initAudioContext();
        this._setupGraph();
    }

    _initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }

    _setupGraph() {
        if (!this.audioContext) return;

        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.9;

        this.compressor = this.audioContext.createDynamicsCompressor();
        this.compressor.threshold.value = -18;
        this.compressor.knee.value = 24;
        this.compressor.ratio.value = 3;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.25;

        // Single panner used as a simple spatialization stage for the player engine
        this.panner = this.audioContext.createPanner();
        this.panner.panningModel = 'HRTF';
        this.panner.distanceModel = 'inverse';
        this.panner.refDistance = 10;
        this.panner.maxDistance = 1000;
        this.panner.rolloffFactor = 1;
        this.panner.coneInnerAngle = 360;
        this.panner.coneOuterAngle = 0;
        this.panner.coneOuterGain = 0;
        this.panner.positionX.value = 0;
        this.panner.positionY.value = 0;
        this.panner.positionZ.value = 0;

        // Mix busses
        this.engineBus = this.audioContext.createGain();
        this.engineBus.gain.value = 0.85;
        this.sfxBus = this.audioContext.createGain();
        this.sfxBus.gain.value = 1.4;

        // Connect: engine/sfx → panner → compressor → master → destination
        this.engineBus.connect(this.panner);
        this.sfxBus.connect(this.panner);
        this.panner.connect(this.compressor);
        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.audioContext.destination);
    }

    // Public: allow camera/game to update listener orientation/position in the future
    setListenerPosition(x, y, z) {
        if (!this.audioContext) return;
        try {
            this.audioContext.listener.positionX.value = x;
            this.audioContext.listener.positionY.value = y;
            this.audioContext.listener.positionZ.value = z;
        } catch (_) {}
    }

    setSourcePosition(x, y, z) {
        if (!this.panner) return;
        this.panner.positionX.value = x;
        this.panner.positionY.value = y;
        this.panner.positionZ.value = z;
    }

    async _loadBuffer(url) {
        if (!this.audioContext || !url) return null;
        if (this.buffers.has(url)) return this.buffers.get(url);

        const tryFetchDecode = async (candidateUrl) => {
            try {
                const res = await fetch(candidateUrl);
                if (!res.ok) return null;
                const arrayBuffer = await res.arrayBuffer();
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                this.buffers.set(candidateUrl, audioBuffer);
                return audioBuffer;
            } catch (_) {
                return null;
            }
        };

        // Try original URL then alternate extensions
        const candidates = [url];
        const dot = url.lastIndexOf('.');
        if (dot !== -1) {
            const base = url.slice(0, dot);
            const ext = url.slice(dot + 1).toLowerCase();
            const order = ['mp3', 'ogg', 'wav'];
            // rotate so we try different ones next
            const rotated = [...order.filter(e => e !== ext)];
            rotated.forEach(e => candidates.push(`${base}.${e}`));
        }

        for (const candidate of candidates) {
            const buf = await tryFetchDecode(candidate);
            if (buf) {
                // Also alias under the original url key so future lookups hit the cache
                this.buffers.set(url, buf);
                return buf;
            }
        }

        console.warn('Failed to load audio buffer for all candidates:', candidates.join(', '));
        return null;
    }

    _createLoopingSource(buffer, playbackRate = 1.0, gainValue = 0.6) {
        if (!this.audioContext || !buffer) return null;
        const source = this.audioContext.createBufferSource();
        const gain = this.audioContext.createGain();
        source.buffer = buffer;
        source.loop = true;
        source.playbackRate.value = playbackRate;
        gain.gain.value = gainValue;
        source.connect(gain);
        // route through engine bus → panner → compressor → master
        gain.connect(this.engineBus);
        return { source, gain };
    }

    _createOneShotSource(buffer, playbackRate = 1.0, gainValue = 0.8) {
        if (!this.audioContext || !buffer) return null;
        const source = this.audioContext.createBufferSource();
        const gain = this.audioContext.createGain();
        source.buffer = buffer;
        source.loop = false;
        source.playbackRate.value = playbackRate;
        gain.gain.value = gainValue;
        source.connect(gain);
        gain.connect(this.sfxBus);
        return { source, gain };
    }

    _createLazyOneShot(url, playbackRate = 1.0, gainValue = 0.8, fallbackFactory = null, onStart = null) {
        const ctx = this.audioContext;
        if (!ctx) return null;
        let started = false;
        let stoppedAt = null;
        let liveSource = null;
        let liveGain = null;
        const start = () => {
            started = true;
            this._loadBuffer(url).then((buffer) => {
                if (!buffer) {
                    console.warn(`[Audio] One-shot buffer missing, using fallback for ${url}`);
                    if (fallbackFactory) {
                        const fb = fallbackFactory();
                        if (fb && fb.oscillator) fb.oscillator.start();
                    }
                    return;
                }
                const made = this._createOneShotSource(buffer, playbackRate, gainValue);
                if (!made) return;
                liveSource = made.source;
                liveGain = made.gain;
                this.currentOneShots.add(liveSource);
                liveSource.onended = () => this.currentOneShots.delete(liveSource);
                const now = ctx.currentTime;
                try { liveSource.start(now); console.log(`[Audio] One-shot sample started: ${url}`); } catch (_) {}
                if (typeof onStart === 'function') {
                    try { onStart(); } catch (_) {}
                }
                if (stoppedAt !== null) {
                    try { liveSource.stop(stoppedAt); } catch (_) {}
                }
            });
        };
        const stop = (when) => {
            stoppedAt = when ?? this.audioContext?.currentTime ?? 0;
            if (liveSource) {
                try { liveSource.stop(stoppedAt); } catch (_) {}
            }
        };
        return { oscillator: { start, stop }, gainNode: liveGain };
    }

    _createLazyFilteredOneShot(url, {
        playbackRate = 1.0,
        gainValue = 0.8,
        filterType = 'lowpass',
        filterFrequency = 5000,
        filterQ = 0.7,
        filterGainDb = 0,
        fallbackFactory = null,
        onStart = null,
    } = {}) {
        const ctx = this.audioContext;
        if (!ctx) return null;
        let liveSource = null;
        let liveGain = null;
        let stoppedAt = null;
        const start = () => {
            this._loadBuffer(url).then((buffer) => {
                if (!buffer) {
                    console.warn(`[Audio] Filtered one-shot buffer missing, using fallback for ${url}`);
                    if (fallbackFactory) {
                        const fb = fallbackFactory();
                        if (fb && fb.oscillator) fb.oscillator.start();
                    }
                    return;
                }
                const source = ctx.createBufferSource();
                const filter = ctx.createBiquadFilter();
                const gain = ctx.createGain();
                source.buffer = buffer;
                source.loop = false;
                source.playbackRate.value = playbackRate;
                filter.type = filterType;
                filter.frequency.setValueAtTime(filterFrequency, ctx.currentTime);
                filter.Q.value = filterQ;
                if ('gain' in filter) { try { filter.gain.value = filterGainDb; } catch (_) {} }
                gain.gain.value = gainValue;
                source.connect(filter);
                filter.connect(gain);
                gain.connect(this.sfxBus);
                liveSource = source;
                liveGain = gain;
                this.currentOneShots.add(liveSource);
                liveSource.onended = () => this.currentOneShots.delete(liveSource);
                const now = ctx.currentTime;
                try { liveSource.start(now); console.log(`[Audio] One-shot filtered sample started: ${url}`); } catch (_) {}
                if (typeof onStart === 'function') {
                    try { onStart(); } catch (_) {}
                }
                if (stoppedAt !== null) {
                    try { liveSource.stop(stoppedAt); } catch (_) {}
                }
            });
        };
        const stop = (when) => {
            stoppedAt = when ?? this.audioContext?.currentTime ?? 0;
            if (liveSource) {
                try { liveSource.stop(stoppedAt); } catch (_) {}
            }
        };
        return { oscillator: { start, stop }, gainNode: liveGain };
    }

    _duckEngine(amount = 0.6, attack = 0.01, release = 0.35) {
        if (!this.engineBus || !this.audioContext) return;
        const now = this.audioContext.currentTime;
        const target = Math.max(0, Math.min(1, amount));
        try {
            this.engineBus.gain.cancelScheduledValues(now);
            this.engineBus.gain.setTargetAtTime(target, now, Math.max(0.005, attack));
            this.engineBus.gain.setTargetAtTime(0.85, now + Math.max(0.05, attack), Math.max(0.05, release));
        } catch (_) {
            this.engineBus.gain.value = target;
            setTimeout(() => { this.engineBus.gain.value = 0.95; }, Math.round((attack + release) * 1000));
        }
    }

    // Create and start all engine layers once, keep running for crossfades
    async _ensureEngineLayersStarted() {
        if (!this.audioContext) return false;
        if (this.engineStarted && this.engineLayers) return true;

        const urls = this.sampleMap.engine;
        const [idleBuf, lowBuf, medBuf, highBuf] = await Promise.all([
            this._loadBuffer(urls.idle),
            this._loadBuffer(urls.low),
            this._loadBuffer(urls.medium),
            this._loadBuffer(urls.high)
        ]);
        // If any buffer missing, do not start layered mode here
        if (!idleBuf || !lowBuf || !medBuf || !highBuf) return false;

        const idle = this._createLoopingSource(idleBuf, 1.0, 0.0);
        const low = this._createLoopingSource(lowBuf, 1.0, 0.0);
        const medium = this._createLoopingSource(medBuf, 1.0, 0.0);
        const high = this._createLoopingSource(highBuf, 1.0, 0.0);

        const now = this.audioContext.currentTime;
        try { idle.source.start(now); } catch (_) {}
        try { low.source.start(now); } catch (_) {}
        try { medium.source.start(now); } catch (_) {}
        try { high.source.start(now); } catch (_) {}

        this.engineLayers = { idle, low, medium, high };
        this.engineStarted = true;
        // Track to stop later
        this.currentEngineSources.push(idle.source, low.source, medium.source, high.source);

        // Initialize to current RPM
        this._applyEngineMix(this.engineRpm);
        return true;
    }

    _applyEngineMix(rpm01) {
        if (!this.engineLayers || !this.audioContext) return;
        const time = this.audioContext.currentTime;
        const tc = 0.08; // smoothing time constant
        const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
        const r = clamp(rpm01, 0, 1);

        // Three crossfade zones: [0,1/3] idle↔low, (1/3,2/3] low↔medium, (2/3,1] medium↔high
        const zone = r < 1/3 ? 'idle-low' : r < 2/3 ? 'low-medium' : 'medium-high';
        let gIdle = 0, gLow = 0, gMed = 0, gHigh = 0;
        let t = 0;
        if (zone === 'idle-low') {
            t = r / (1/3);
            gIdle = 1 - t;
            gLow = t;
        } else if (zone === 'low-medium') {
            t = (r - 1/3) / (1/3);
            gLow = 1 - t;
            gMed = t;
        } else {
            t = (r - 2/3) / (1/3);
            gMed = 1 - t;
            gHigh = t;
        }
        // Prevent total silence at extremes
        if (r === 0) gIdle = 1;
        if (r === 1) gHigh = 1;

        const setGain = (node, value) => {
            node.gain.cancelScheduledValues(time);
            node.gain.setTargetAtTime(value, time, tc);
        };
        setGain(this.engineLayers.idle.gain, gIdle * 0.7);
        setGain(this.engineLayers.low.gain, gLow * 0.85);
        setGain(this.engineLayers.medium.gain, gMed * 0.95);
        setGain(this.engineLayers.high.gain, gHigh * 0.98);

        // Mild playbackRate modulation for perceived RPM movement
        const setRate = (src, base) => {
            try { src.playbackRate.setTargetAtTime(base, time, 0.12); } catch (_) { src.playbackRate.value = base; }
        };
        setRate(this.engineLayers.idle.source, 0.9 + r * 0.2);
        setRate(this.engineLayers.low.source, 0.95 + r * 0.25);
        setRate(this.engineLayers.medium.source, 1.0 + r * 0.3);
        setRate(this.engineLayers.high.source, 1.05 + r * 0.35);
    }

    // Public: set RPM 0..1 continuously (called every frame)
    setEngineRpm(rpm01) {
        this.engineRpm = Math.max(0, Math.min(1, rpm01));
        if (this.engineStarted) this._applyEngineMix(this.engineRpm);
    }

    // Convenience: derive RPM from approximate speed thresholds used in manager
    updateEngineRpmFromSpeed(speed) {
        // Map 0..25+ → 0..1
        const r = Math.max(0, Math.min(1, speed / 25));
        this.setEngineRpm(r);
    }

    // ===== Engine (layered sample-based) =====
    async _prepareEngine(type) {
        const url = this.sampleMap.engine[type];
        const buffer = await this._loadBuffer(url);
        if (!buffer) return null;
        const { source, gain } = this._createLoopingSource(buffer, 1.0, 0.55);
        return { source, gain };
    }

    stopEngineSound() {
        // Stop and clear any active engine sources
        this.currentEngineSources.forEach((node) => {
            try { node.stop(0); } catch (_) {}
            try { node.disconnect(); } catch (_) {}
        });
        this.currentEngineSources = [];
        this.engineLayers = null;
        this.engineStarted = false;
    }

    // Keep signature. Returns { oscillators: [AudioBufferSourceNode, ...] }
    generateEngineSound(type = 'idle', duration = 2.0) {
        if (!this.audioContext) return null;

        // Try layered mode first
        this._ensureEngineLayersStarted().then((ok) => {
            if (ok) {
                // Move RPM near the chosen band instantly
                const bandCenter = { idle: 0.05, low: 0.25, medium: 0.55, high: 0.85 }[type] ?? 0.25;
                this.setEngineRpm(bandCenter);
                console.log(`[Audio] Engine layered mix active: ${type}`);
                return;
            }
            // Fallback: single-sample start
            this._prepareEngine(type).then((prepared) => {
                if (!prepared) return; // Will use fallback below
                this.stopEngineSound();
                const { source, gain } = prepared;

                const now = this.audioContext.currentTime;
                gain.gain.cancelScheduledValues(now);
                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.exponentialRampToValueAtTime(0.75, now + 0.25);

                try { source.start(now); } catch (_) {}
                console.log(`[Audio] Engine single sample started: ${type}`);
                source.onended = () => { this.currentEngineSources = this.currentEngineSources.filter(s => s !== source); };
                this.currentEngineSources.push(source);
            });
        });

        // Only return procedural fallback object for API compatibility; do not autostart oscillators here
        // const fallback = this._generateProceduralEngine(type, duration);
        // return fallback;
        
        // Return empty object to disable oscillator fallbacks
        return { oscillators: [], gainNodes: [], filters: [] };
    }

    _generateProceduralEngine(type = 'idle', duration = 2.0) {
        const oscillators = [];
        const gainNodes = [];
        const filters = [];
        const freqsByType = {
            idle: [90, 140, 190],
            low: [120, 180, 240],
            medium: [180, 260, 340],
            high: [240, 320, 420]
        };
        const freqs = freqsByType[type] || freqsByType.idle;
        for (let i = 0; i < 3; i++) {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            const filter = this.audioContext.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 1500 + i * 300;
            filter.Q.value = 0.9;
            const volume = 0.12 - i * 0.03; // quieter fallback to avoid masking samples
            const now = this.audioContext.currentTime;
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.01), now + 0.15);
            gain.gain.setValueAtTime(Math.max(volume, 0.01), now + duration - 0.1);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
            osc.frequency.value = freqs[i];
            osc.type = i === 0 ? 'sawtooth' : 'triangle';
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.panner);
            this.currentEngineSources.push(osc);
            osc.onended = () => {
                this.currentEngineSources = this.currentEngineSources.filter(s => s !== osc);
            };
            oscillators.push(osc);
            gainNodes.push(gain);
            filters.push(filter);
        }
        console.log(`[Audio] Engine procedural fallback available: ${type}`);
        return { oscillators, gainNodes, filters };
    }

    // ===== Collisions =====
    generateCollisionSound(type = 'front', impactForce = 1.0, duration = 0.6) {
        if (!this.audioContext) return null;
        const norm = this._normalizeCollisionType(type);
        const url = this.sampleMap.collision[norm];
        const rate = 0.9 + impactForce * 0.15;
        const gain = Math.min(1.8 + impactForce * 1.6, 3.0);
        const fallbackFactory = null; // Disable oscillator fallbacks
        return this._createLazyFilteredOneShot(url, {
            playbackRate: rate,
            gainValue: gain,
            filterType: 'peaking',
            filterFrequency: 1800,
            filterQ: 1.1,
            filterGainDb: 8,
            fallbackFactory,
            onStart: () => this._duckEngine(0.2, 0.008, 0.6),
        });
    }

    _normalizeCollisionType(type) {
        const t = String(type || '').toLowerCase();
        if (t in (this.sampleMap?.collision || {})) return t;
        if (t.includes('front')) return 'front';
        if (t.includes('rear') || t.includes('back')) return 'rear';
        if (t.includes('side')) return 'side';
        if (t.includes('wall')) return 'wall';
        if (t.includes('head')) return 'headshot';
        if (t === 'medium' || t === 'light' || t === 'heavy') return 'front';
        return 'front';
    }

    _generateProceduralCollision(type, impactForce, duration) {
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        // White noise burst
        const noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = false;

        // Shaping filters for metallic ping
        const hipass = ctx.createBiquadFilter();
        hipass.type = 'highpass';
        hipass.frequency.value = 600;

        const band1 = ctx.createBiquadFilter(); band1.type = 'bandpass'; band1.frequency.value = 1100; band1.Q.value = 4;
        const band2 = ctx.createBiquadFilter(); band2.type = 'bandpass'; band2.frequency.value = 2000; band2.Q.value = 3;
        const band3 = ctx.createBiquadFilter(); band3.type = 'bandpass'; band3.frequency.value = 3200; band3.Q.value = 2.5;

        const gainNode = ctx.createGain();
        const maxVol = Math.min(1.4 * (0.7 + impactForce * 0.8), 2.2);
        gainNode.gain.setValueAtTime(0.0001, now);
        gainNode.gain.exponentialRampToValueAtTime(maxVol, now + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.65, duration));

        noise.connect(hipass);
        hipass.connect(band1);
        band1.connect(band2);
        band2.connect(band3);
        band3.connect(gainNode);
        gainNode.connect(this.sfxBus);

        // Return controls similar to oscillator API
        const oscillator = {
            start: (t) => {
                try { noise.start(t ?? now); } catch (_) {}
            },
            stop: (t) => {
                try { noise.stop(t ?? (now + Math.max(0.55, duration))); } catch (_) {}
            }
        };
        return { oscillator, gainNode };
    }

    // ===== Boost =====
    generateBoostSound(speed = 0, duration = 1.2) {
        if (!this.audioContext) return null;
        const url = this.sampleMap.boost.whoosh;
        const rate = 0.9 + Math.min(speed / 100, 1.0) * 0.6; // slightly slower for softness
        const gain = Math.min(0.45 + speed * 0.008, 0.85);
        const cutoff = 3800 + Math.min(speed, 100) * 12; // tame highs
        const fallbackFactory = null; // Disable oscillator fallbacks
        return this._createLazyFilteredOneShot(url, {
            playbackRate: rate,
            gainValue: gain,
            filterType: 'lowpass',
            filterFrequency: cutoff,
            filterQ: 0.6,
            fallbackFactory,
            onStart: () => this._duckEngine(0.8, 0.02, 0.2), // gentle duck
        });
    }

    _generateProceduralBoost(speed, duration) {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'highpass';
        const startFreq = 400 + speed * 10;
        const endFreq = 1500 + speed * 20;
        const now = this.audioContext.currentTime;
        filter.frequency.setValueAtTime(startFreq, now);
        filter.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
        const volume = Math.min(0.5 + speed * 0.01, 1.0);
        gainNode.gain.setValueAtTime(0.0001, now);
        gainNode.gain.exponentialRampToValueAtTime(volume, now + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        const startFreqOsc = 600 + speed * 5;
        const endFreqOsc = 1800 + speed * 10;
        oscillator.frequency.setValueAtTime(startFreqOsc, now);
        oscillator.frequency.exponentialRampToValueAtTime(endFreqOsc, now + duration);
        oscillator.type = 'sine';
        filter.connect(gainNode);
        gainNode.connect(this.sfxBus);
        return { oscillator, gainNode };
    }

    // ===== UI =====
    generateUISound(type = 'button', duration = 0.15) {
        if (!this.audioContext) return null;
        if (type === 'victory') {
            this.playVictoryChord();
            const oscillator = { start: () => {}, stop: () => {} };
            return { oscillator, gainNode: null };
        }
        const url = this.sampleMap.ui[type];
        const fallbackFactory = () => this._generateProceduralUI(type, duration);
        return this._createLazyOneShot(url, 1.0, 0.5, fallbackFactory);
    }

    _generateProceduralUI(type, duration) {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const now = this.audioContext.currentTime;
        gainNode.gain.setValueAtTime(0.0001, now);
        gainNode.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        switch (type) {
            case 'button':
                oscillator.frequency.setValueAtTime(800, now);
                oscillator.frequency.exponentialRampToValueAtTime(600, now + duration);
                oscillator.type = 'sine';
                break;
            case 'damage':
                oscillator.frequency.setValueAtTime(300, now);
                oscillator.frequency.exponentialRampToValueAtTime(150, now + duration);
                oscillator.type = 'square';
                break;
            case 'respawn':
                oscillator.frequency.setValueAtTime(500, now);
                oscillator.frequency.exponentialRampToValueAtTime(700, now + duration);
                oscillator.type = 'sine';
                break;
            case 'victory':
                this.playVictoryChord();
                break;
            case 'countdown':
                oscillator.frequency.setValueAtTime(440, now);
                oscillator.type = 'sine';
                break;
        }
        oscillator.connect(gainNode);
        gainNode.connect(this.sfxBus);
        return { oscillator, gainNode };
    }

    playVictoryChord() {
        if (!this.audioContext) return;
        const notes = [523, 659, 784];
        const duration = 0.8;
        notes.forEach((freq, i) => {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            const now = this.audioContext.currentTime;
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.2, now + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
            osc.frequency.value = freq;
            osc.type = 'sine';
            osc.connect(gain);
            gain.connect(this.sfxBus);
            osc.start(now + i * 0.1);
            osc.stop(now + duration + i * 0.1);
        });
    }

    // Optional: ambient/movement (not directly used by HybridSoundManager for GameSoundPack)
    generateAmbientSound(type = 'crowd', duration = 5.0) {
        if (!this.audioContext) return null;
        const url = this.sampleMap.ambient[type];
        const controller = { oscillator: { start: () => {}, stop: () => {} }, gainNode: null };
        this._loadBuffer(url).then((buffer) => {
            if (!buffer) return; // ignore if missing
            const source = this.audioContext.createBufferSource();
            const gain = this.audioContext.createGain();
            source.buffer = buffer;
            source.loop = true;
            source.playbackRate.value = 1.0;
            gain.gain.value = 0.15;
            source.connect(gain);
            gain.connect(this.sfxBus);
            controller.oscillator = source;
            controller.gainNode = gain;
        });
        return controller;
    }

    generateMovementSound(type = 'tireScreech', duration = 0.8) {
        if (!this.audioContext) return null;
        const url = this.sampleMap.movement[type];
        const controller = { oscillator: { start: () => {}, stop: () => {} }, gainNode: null };
        this._loadBuffer(url).then((buffer) => {
            if (!buffer) { console.warn(`[Audio] Movement buffer missing: ${url}`); return; }
            const { source, gain } = this._createOneShotSource(buffer, 1.0, 0.7);
            controller.oscillator = source;
            controller.gainNode = gain;
            this.currentOneShots.add(source);
            source.onended = () => this.currentOneShots.delete(source);
            console.log(`[Audio] Movement sample ready: ${type}`);
        });
        return controller;
    }

    // Resume audio context (needed for autoplay policies)
    resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }
} 