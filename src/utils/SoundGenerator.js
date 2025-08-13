export class SoundGenerator {
    constructor() {
        this.audioContext = null;
        this.initAudioContext();
    }

    initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }

    // Generate simple, pleasant engine sounds
    generateSimpleEngineSound(type = 'idle', duration = 2.0) {
        if (!this.audioContext) return null;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();

        // Configure filter for smooth engine sound
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, this.audioContext.currentTime);
        filter.Q.setValueAtTime(0.3, this.audioContext.currentTime);

        // Configure gain for smooth volume envelope
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.1, this.audioContext.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime + duration - 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

        // Configure oscillator based on engine type - much simpler and more pleasant
        switch (type) {
            case 'idle':
                oscillator.frequency.setValueAtTime(30, this.audioContext.currentTime);
                oscillator.type = 'sine'; // Very smooth
                break;
            case 'low':
                oscillator.frequency.setValueAtTime(45, this.audioContext.currentTime);
                oscillator.type = 'sine';
                break;
            case 'medium':
                oscillator.frequency.setValueAtTime(60, this.audioContext.currentTime);
                oscillator.type = 'sine';
                break;
            case 'high':
                oscillator.frequency.setValueAtTime(80, this.audioContext.currentTime);
                oscillator.type = 'sine';
                break;
        }

        // Connect nodes
        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        return { oscillator, gainNode };
    }

    // Generate complex engine sounds (original method)
    generateEngineSound(type = 'idle', duration = 2.0) {
        if (!this.audioContext) return null;

        // Create multiple oscillators for richer engine sound
        const oscillators = [];
        const gainNodes = [];
        const filters = [];

        // Create 3 oscillators for a more complex engine sound
        for (let i = 0; i < 3; i++) {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            const filter = this.audioContext.createBiquadFilter();

            // Configure filter for engine-like sound
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(600 + i * 200, this.audioContext.currentTime);
            filter.Q.setValueAtTime(0.5 + i * 0.3, this.audioContext.currentTime);

            // Configure gain for volume envelope with different levels
            const baseVolume = 0.15 - i * 0.05; // Decreasing volume for harmonics
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(baseVolume, this.audioContext.currentTime + 0.2);
            gainNode.gain.setValueAtTime(baseVolume, this.audioContext.currentTime + duration - 0.1);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

            // Configure oscillator based on engine type with harmonics
            let baseFreq;
            switch (type) {
                case 'idle':
                    baseFreq = 40 + i * 20; // Lower, more mellow idle
                    oscillator.type = 'triangle'; // Softer waveform
                    break;
                case 'low':
                    baseFreq = 80 + i * 30; // Gentle low RPM
                    oscillator.type = i === 0 ? 'triangle' : 'sine'; // Mix of waveforms
                    break;
                case 'medium':
                    baseFreq = 120 + i * 40; // Moderate RPM
                    oscillator.type = i === 0 ? 'sawtooth' : 'triangle'; // Mix of waveforms
                    break;
                case 'high':
                    baseFreq = 180 + i * 60; // Higher RPM but not too harsh
                    oscillator.type = 'sawtooth';
                    break;
            }

            oscillator.frequency.setValueAtTime(baseFreq, this.audioContext.currentTime);

            // Add subtle frequency modulation for realism
            const modDepth = baseFreq * 0.02; // 2% modulation
            const modRate = 0.5 + i * 0.3; // Different modulation rates
            oscillator.frequency.setValueAtTime(
                baseFreq + Math.sin(this.audioContext.currentTime * modRate) * modDepth,
                this.audioContext.currentTime
            );

            // Connect nodes
            oscillator.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillators.push(oscillator);
            gainNodes.push(gainNode);
            filters.push(filter);
        }

        return { oscillators, gainNodes, filters };
    }

    // Generate collision sounds
    generateCollisionSound(type = 'front', duration = 0.5) {
        if (!this.audioContext) return null;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();

        // Configure filter
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(200, this.audioContext.currentTime);
        filter.Q.setValueAtTime(2, this.audioContext.currentTime);

        // Configure gain envelope
        gainNode.gain.setValueAtTime(0.8, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

        // Configure oscillator based on collision type
        switch (type) {
            case 'front':
                oscillator.frequency.setValueAtTime(150, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(50, this.audioContext.currentTime + duration);
                oscillator.type = 'square';
                break;
            case 'side':
                oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(80, this.audioContext.currentTime + duration);
                oscillator.type = 'sawtooth';
                break;
            case 'rear':
                oscillator.frequency.setValueAtTime(100, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(30, this.audioContext.currentTime + duration);
                oscillator.type = 'triangle';
                break;
            case 'headshot':
                oscillator.frequency.setValueAtTime(300, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + duration);
                oscillator.type = 'sawtooth';
                break;
            case 'wall':
                oscillator.frequency.setValueAtTime(80, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(20, this.audioContext.currentTime + duration);
                oscillator.type = 'sine';
                break;
        }

        // Connect nodes
        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        return { oscillator, gainNode };
    }

    // Generate boost pad sounds
    generateBoostSound(duration = 1.0) {
        if (!this.audioContext) return null;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();

        // Configure filter
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(500, this.audioContext.currentTime);
        filter.frequency.exponentialRampToValueAtTime(2000, this.audioContext.currentTime + duration);

        // Configure gain envelope
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.6, this.audioContext.currentTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

        // Configure oscillator
        oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(2000, this.audioContext.currentTime + duration);
        oscillator.type = 'sine';

        // Connect nodes
        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        return { oscillator, gainNode };
    }

    // Generate UI sounds
    generateUISound(type = 'button', duration = 0.2) {
        if (!this.audioContext) return null;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        // Configure gain envelope
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

        // Configure oscillator based on UI type
        switch (type) {
            case 'button':
                oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(600, this.audioContext.currentTime + duration);
                oscillator.type = 'sine';
                break;
            case 'damage':
                oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(200, this.audioContext.currentTime + duration);
                oscillator.type = 'square';
                break;
            case 'respawn':
                oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(800, this.audioContext.currentTime + duration);
                oscillator.type = 'sine';
                break;
            case 'victory':
                oscillator.frequency.setValueAtTime(523, this.audioContext.currentTime); // C
                oscillator.frequency.setValueAtTime(659, this.audioContext.currentTime + 0.2); // E
                oscillator.frequency.setValueAtTime(784, this.audioContext.currentTime + 0.4); // G
                oscillator.type = 'sine';
                break;
            case 'countdown':
                oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime);
                oscillator.type = 'sine';
                break;
        }

        // Connect nodes
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        return { oscillator, gainNode };
    }

    // Generate ambient sounds
    generateAmbientSound(type = 'crowd', duration = 5.0) {
        if (!this.audioContext) return null;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();

        // Configure filter
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, this.audioContext.currentTime);
        filter.Q.setValueAtTime(0.5, this.audioContext.currentTime);

        // Configure gain envelope
        gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime + duration);

        // Configure oscillator based on ambient type
        switch (type) {
            case 'crowd':
                oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime);
                oscillator.type = 'noise';
                break;
            case 'wind':
                oscillator.frequency.setValueAtTime(100, this.audioContext.currentTime);
                oscillator.type = 'noise';
                break;
        }

        // Connect nodes
        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        return { oscillator, gainNode };
    }

    // Generate movement sounds
    generateMovementSound(type = 'tireScreech', duration = 0.8) {
        if (!this.audioContext) return null;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();

        // Configure filter
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(800, this.audioContext.currentTime);
        filter.Q.setValueAtTime(3, this.audioContext.currentTime);

        // Configure gain envelope
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.4, this.audioContext.currentTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

        // Configure oscillator based on movement type
        switch (type) {
            case 'tireScreech':
                oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(200, this.audioContext.currentTime + duration);
                oscillator.type = 'sawtooth';
                break;
            case 'drift':
                oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(150, this.audioContext.currentTime + duration);
                oscillator.type = 'square';
                break;
        }

        // Connect nodes
        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        return { oscillator, gainNode };
    }

    // Play a generated sound
    playGeneratedSound(generator, duration) {
        if (!this.audioContext) return;

        const sound = generator(duration);
        if (sound) {
            sound.oscillator.start();
            sound.oscillator.stop(this.audioContext.currentTime + duration);
        }
    }

    // Resume audio context (needed for browser autoplay policies)
    resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }
} 