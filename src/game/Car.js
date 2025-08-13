import * as THREE from 'three';

export class Car {
    constructor(scene, preset = null) {
        this.scene = scene;
        // Defaults; can be overridden by preset
        this.health = 100;
        this.maxHealth = 100;
        this.speed = 0;
        this.maxSpeed = 40; // Increased for more dynamic movement
        this.acceleration = 60; // Faster acceleration
        this.deceleration = 15; // Slower deceleration for momentum
        this.turnSpeed = 2.5; // Slightly slower turning for smoother control
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3(0, 0, 1);
        this.momentum = 0; // Add momentum for more realistic physics
        this.damageDealtMultiplier = 1.0;
        this.damageTakenMultiplier = 1.0;
        this.knockback = new THREE.Vector3();
        this.knockbackDecayPerSecond = 7.5; // slightly slower decay to feel a bounce but not linger
        // Timed speed boost (e.g., from jump pads)
        this._padBoostUntilMs = 0;          // hard boost window end
        this._padBoostMultiplier = 1.0;     // peak multiplier during window
        this._padBoostFalloffEndMs = 0;     // fade-out end time (mult → 1)

        // Skid mark system (lightweight, fading decals)
        this._skidMarks = [];
        this._skidEmitCooldown = 0; // seconds
        this._isSkidding = false;
        this._skidAssetsReady = false;
        
        // Boost charges system
        this._boostChargesMax = 5;
        this._boostCharges = 5; // float to allow partial recharge
        this._boostRechargePerSecond = 0.25; // 1 charge every 4 seconds
        this._boostConsumeAmount = 1.0; // per use
        this._boostWasDown = false;

        // Boost ring VFX
        this._boostRings = [];

        // Slick spin state
        this._spinTime = 0;        // seconds remaining in spin lock
        this._spinCooldown = 0;    // seconds before next spin can trigger
        this._spinDir = 1;         // spin direction (+1 or -1)

        if (preset) {
            this.applyPreset(preset);
        }
        
        this.createCar();
        // Create a blob shadow plane to ensure visible car shadow even with limited light shadows
        this._createShadowBlob();
    }

    applyPreset(preset) {
        // preset: { maxHealth, maxSpeed, acceleration, deceleration, turnSpeed, color, damageDealtMultiplier, damageTakenMultiplier }
        this.maxHealth = preset.maxHealth ?? this.maxHealth;
        this.health = this.maxHealth;
        this.maxSpeed = preset.maxSpeed ?? this.maxSpeed;
        this.acceleration = preset.acceleration ?? this.acceleration;
        this.deceleration = preset.deceleration ?? this.deceleration;
        this.turnSpeed = preset.turnSpeed ?? this.turnSpeed;
        this.damageDealtMultiplier = preset.damageDealtMultiplier ?? this.damageDealtMultiplier;
        this.damageTakenMultiplier = preset.damageTakenMultiplier ?? this.damageTakenMultiplier;
        this.bodyColorOverride = preset.color;
        this.shapeId = preset.shape || 'balanced';
    }
    
    createCar() {
        const materialBody = new THREE.MeshLambertMaterial({ color: this.bodyColorOverride ?? 0x00ff00, transparent: true, opacity: 1 });
        const materialAccent = new THREE.MeshLambertMaterial({ color: 0x1a1a1a, transparent: true, opacity: 1 });

        let bodySize = { x: 2.0, y: 1.0, z: 4.0 };
        let cabinSize = { x: 1.6, y: 0.7, z: 1.8 };
        let cabinOffset = { x: 0, y: 1.2, z: 0.2 };
        let bumperSize = { x: 2.0, y: 0.4, z: 0.7 };
        let bumperOffsetY = 0.25;
        let wheelRadius = 0.5;
        let trackWidth = 2.4;
        let wheelbase = 3.2;
        let rideHeight = 0.55;

        if (this.shapeId === 'sport') {
            bodySize = { x: 1.9, y: 0.8, z: 4.2 };
            cabinSize = { x: 1.4, y: 0.6, z: 1.4 };
            cabinOffset = { x: 0, y: 1.0, z: 0.0 };
            bumperSize = { x: 1.9, y: 0.25, z: 0.5 };
            bumperOffsetY = 0.15;
            wheelRadius = 0.45;
            trackWidth = 2.1;
            wheelbase = 3.3;
            rideHeight = 0.25;
        } else if (this.shapeId === 'tank') {
            bodySize = { x: 2.2, y: 1.2, z: 3.8 };
            cabinSize = { x: 1.8, y: 0.9, z: 1.8 };
            cabinOffset = { x: 0, y: 1.5, z: -0.1 };
            bumperSize = { x: 2.4, y: 0.6, z: 0.9 };
            bumperOffsetY = 0.4;
            wheelRadius = 0.65;
            trackWidth = 2.6;
            wheelbase = 3.0;
            rideHeight = 0.7;
        }

        const bodyGeometry = new THREE.BoxGeometry(bodySize.x, bodySize.y, bodySize.z);
        this.mesh = new THREE.Mesh(bodyGeometry, materialBody);
        this.mesh.position.set(0, rideHeight, 0);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = false;

        const cabinGeometry = new THREE.BoxGeometry(cabinSize.x, cabinSize.y, cabinSize.z);
        this.cabin = new THREE.Mesh(cabinGeometry, materialBody);
        this.cabin.position.set(cabinOffset.x, cabinOffset.y, cabinOffset.z);
        this.cabin.castShadow = true;
        this.cabin.receiveShadow = false;

        const bumperGeometry = new THREE.BoxGeometry(bumperSize.x, bumperSize.y, bumperSize.z);
        this.frontBumper = new THREE.Mesh(bumperGeometry, materialAccent);
        // Attach bumper to the body mesh so it follows body height exactly
        // Position is relative to body center (local space)
        const bumperLocalY = -bodySize.y * 0.5 + bumperSize.y * 0.5 + bumperOffsetY; // near lower edge of body
        const bumperLocalZ = bodySize.z * 0.5 + bumperSize.z * 0.5 - 0.1;            // just in front of body
        this.frontBumper.position.set(0, bumperLocalY, bumperLocalZ);
        this.frontBumper.castShadow = true;
        this.frontBumper.receiveShadow = false;

        if (this.shapeId === 'tank') {
            const bullBar = new THREE.BoxGeometry(bumperSize.x * 0.9, bumperSize.y * 0.9, 0.2);
            const bar = new THREE.Mesh(bullBar, materialAccent);
            // Place slightly in front of the bumper face, in bumper local space
            bar.position.set(0, 0.1, bumperSize.z * 0.5 + 0.05);
            this.frontBumper.add(bar);
        } else if (this.shapeId === 'sport') {
            const spoiler = new THREE.BoxGeometry(bodySize.x * 0.8, 0.08, 0.6);
            const wing = new THREE.Mesh(spoiler, materialAccent);
            wing.position.set(0, 0.15, -bodySize.z / 2 - 0.2);
            wing.rotation.x = -Math.PI / 16;
            this.mesh.add(wing);
        }

        this.carGroup = new THREE.Group();
        this.carGroup.add(this.mesh);
        this.carGroup.add(this.cabin);
        // Parent the bumper to the body mesh to avoid "hanging" offset
        this.mesh.add(this.frontBumper);
        this.scene.add(this.carGroup);

        this.createWheels({ radius: wheelRadius, trackWidth, wheelbase, rideHeight });
        this.addCarDetails();

        // Prepare skid assets
        this._ensureSkidAssets();

        // Compute neutral collision footprint (no shape-specific tightening)
        const baseHalfWidth = (trackWidth / 2);
        const baseHalfLength = (wheelbase / 2) + (bumperSize.z * 0.5);
        const lateralBias = 0.9;      // mild shrink to avoid micro contacts
        const longitudinalBias = 0.95; // mild shrink
        const radiusBias = 0.9;       // overall radius shrink
        const effHalfW = baseHalfWidth * lateralBias;
        const effHalfL = baseHalfLength * longitudinalBias;
        const radius = Math.sqrt(effHalfW * effHalfW + effHalfL * effHalfL) * radiusBias;
        this.collisionRadius = Math.max(1.0, Math.min(3.2, radius));
        this.collisionHalfWidth = effHalfW;
        this.collisionHalfLength = effHalfL;
    }
    
    createWheels(config) {
        const radius = config.radius;
        const halfTrack = config.trackWidth / 2 - 0.15;
        const halfBase = config.wheelbase / 2 - 0.2;
        const y = config.rideHeight + 0.02;
        const wheelGeometry = new THREE.CylinderGeometry(radius, radius, 0.35, 10);
        const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
        
        // Front wheels
        this.frontLeftWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        this.frontLeftWheel.position.set(-halfTrack, y, halfBase);
        this.frontLeftWheel.rotation.z = Math.PI / 2;
        this.frontLeftWheel.castShadow = true;
        this.carGroup.add(this.frontLeftWheel);
        
        this.frontRightWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        this.frontRightWheel.position.set(halfTrack, y, halfBase);
        this.frontRightWheel.rotation.z = Math.PI / 2;
        this.frontRightWheel.castShadow = true;
        this.carGroup.add(this.frontRightWheel);
        
        // Back wheels
        this.backLeftWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        this.backLeftWheel.position.set(-halfTrack, y, -halfBase);
        this.backLeftWheel.rotation.z = Math.PI / 2;
        this.backLeftWheel.castShadow = true;
        this.carGroup.add(this.backLeftWheel);
        
        this.backRightWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        this.backRightWheel.position.set(halfTrack, y, -halfBase);
        this.backRightWheel.rotation.z = Math.PI / 2;
        this.backRightWheel.castShadow = true;
        this.carGroup.add(this.backRightWheel);
    }
    
    addCarDetails() {
        // Add windshield
        const windshieldGeometry = new THREE.PlaneGeometry(1.8, 1.2);
        const windshieldMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x87ceeb,
            transparent: true,
            opacity: 0.6
        });
        
        this.windshield = new THREE.Mesh(windshieldGeometry, windshieldMaterial);
        this.windshield.position.set(0, 1.1, 0.8);
        this.windshield.rotation.x = Math.PI / 6;
        this.carGroup.add(this.windshield);
        
        // Add headlights
        const headlightGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        const headlightMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xffff00,
            emissive: 0xffff00,
            emissiveIntensity: 0.3
        });
        
        this.leftHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        this.leftHeadlight.position.set(-0.8, 0.8, 2.1);
        this.carGroup.add(this.leftHeadlight);
        
        this.rightHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        this.rightHeadlight.position.set(0.8, 0.8, 2.1);
        this.carGroup.add(this.rightHeadlight);
        
        // Add taillights
        const taillightMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.2
        });
        
        this.leftTaillight = new THREE.Mesh(headlightGeometry, taillightMaterial);
        this.leftTaillight.position.set(-0.8, 0.8, -2.1);
        this.carGroup.add(this.leftTaillight);
        
        this.rightTaillight = new THREE.Mesh(headlightGeometry, taillightMaterial);
        this.rightTaillight.position.set(0.8, 0.8, -2.1);
        this.carGroup.add(this.rightTaillight);
    }
    
    update(deltaTime, inputManager, soundManager) {
        // Handle input
        this.handleInput(inputManager, deltaTime, soundManager);
        
        // Update physics
        this.updatePhysics(deltaTime);
        
        // Update visual effects
        this.updateVisualEffects(deltaTime);

        // Update invulnerability visual pulse if active
        if (this.invulnerableUntil && (performance.now ? performance.now() : Date.now()) < this.invulnerableUntil) {
            const t = (performance.now ? performance.now() : Date.now()) * 0.008;
            const pulse = 0.65 + 0.25 * (0.5 + 0.5 * Math.sin(t));
            this.setOpacity(pulse);
        } else if (this._wasInvulnerable) {
            this.setOpacity(1.0);
            this._wasInvulnerable = false;
            this.invulnerableUntil = 0;
        }
    }
    
    handleInput(inputManager, deltaTime, soundManager) {
        // Forward/Backward movement with momentum
        // If car is spinning due to slick patch, ignore player steering/throttle briefly
        if (this._spinTime > 0) {
            // Rapid yaw rotation and quick momentum bleed
            this.carGroup.rotation.y += this._spinDir * 9 * deltaTime;
            this.momentum *= (1 - 1.8 * deltaTime);
            this.speed = this.momentum;
            this._spinTime = Math.max(0, this._spinTime - deltaTime);
            return;
        }
        if (inputManager.keys.forward) {
            this.momentum = Math.min(this.momentum + this.acceleration * deltaTime, this.maxSpeed);
            this.speed = this.momentum;
        } else if (inputManager.keys.backward) {
            this.momentum = Math.max(this.momentum - this.acceleration * deltaTime, -this.maxSpeed * 0.6);
            this.speed = this.momentum;
        } else {
            // Natural deceleration with momentum
            if (this.momentum > 0) {
                this.momentum = Math.max(0, this.momentum - this.deceleration * deltaTime);
            } else if (this.momentum < 0) {
                this.momentum = Math.min(0, this.momentum + this.deceleration * deltaTime);
            }
            this.speed = this.momentum;
        }
        
        // Steering (smoother with momentum)
        const turnMultiplier = Math.max(0.3, Math.abs(this.speed) / this.maxSpeed);
        if (Math.abs(this.speed) > 0.5) {
            if (inputManager.keys.left) {
                this.carGroup.rotation.y += this.turnSpeed * deltaTime * turnMultiplier;
            }
            if (inputManager.keys.right) {
                this.carGroup.rotation.y -= this.turnSpeed * deltaTime * turnMultiplier;
            }
        }
        
        // Boost (Space) - gated by charges; rising-edge activation
        if (inputManager.keys.boost && this.speed > 0) {
            if (!this._boostWasDown) {
                if (this.canUseBoost()) {
                    this.consumeBoost();
                    if (soundManager && soundManager.playBoostSound) {
                        soundManager.playBoostSound(Math.abs(this.speed));
                    }
                    this.triggerPadBoost(0.3, 1.6);
                }
            }
            this._boostWasDown = true;
        } else {
            this._boostWasDown = false;
        }

        // Determine skidding state: turning fast or braking while moving
        const turning = inputManager.keys.left || inputManager.keys.right;
        const braking = inputManager.keys.backward && Math.abs(this.speed) > 8;
        this._isSkidding = (Math.abs(this.speed) > 12 && turning) || braking;
    }
    
    updatePhysics(deltaTime) {
        // Reduce spin cooldown over time
        if (this._spinCooldown > 0) this._spinCooldown = Math.max(0, this._spinCooldown - deltaTime);
        // Calculate movement direction based on car rotation
        const direction = new THREE.Vector3(0, 0, 1);
        direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.carGroup.rotation.y);
        
        // Update horizontal velocity
        const effectiveSpeed = this.speed * this.getBoostMultiplier();
        this.velocity.x = direction.x * effectiveSpeed;
        this.velocity.z = direction.z * effectiveSpeed;
        
        // Apply gravity
        const gravity = -20; // Gravity strength
        this.velocity.y += gravity * deltaTime;
        
        // Apply knockback impulse (decays over time)
        if (this.knockback.lengthSq() > 1e-6) {
            // Apply knockback but clamp the displacement to avoid big jumps that cause stalls
            const kbStep = this.knockback.clone().multiplyScalar(deltaTime);
            if (kbStep.length() > 0.6) kbStep.setLength(0.6);
            this.carGroup.position.add(kbStep);
            const decay = Math.exp(-this.knockbackDecayPerSecond * deltaTime);
            this.knockback.multiplyScalar(decay);
        }

        // Update position from main velocity
        this.carGroup.position.add(this.velocity.clone().multiplyScalar(deltaTime));
        
        // Ground collision (basic)
        if (this.carGroup.position.y < 0) {
            this.carGroup.position.y = 0;
            this.velocity.y = 0;
        }

        // Only cast real light shadows while in the air
        const inAir = (this.carGroup.position.y > 0.12) || (this.velocity.y > 0.8);
        this._setCarCastShadow(inAir);
        
        // Update wheel rotation for visual effect
        const wheelRotationSpeed = this.speed * 2;
        this.frontLeftWheel.rotation.x += wheelRotationSpeed * deltaTime;
        this.frontRightWheel.rotation.x += wheelRotationSpeed * deltaTime;
        this.backLeftWheel.rotation.x += wheelRotationSpeed * deltaTime;
        this.backRightWheel.rotation.x += wheelRotationSpeed * deltaTime;

        // Possibly emit skid marks after movement update so positions are current
        this._maybeEmitSkidMarks(deltaTime);
        // Update blob shadow after physics
        this._updateShadowBlob();

        // Trigger slick patch spin once upon contact while grounded
        const grounded = this.carGroup.position.y <= 0.12 && this.velocity.y <= 0.2;
        if (grounded && !this._spinCooldown && this.scene && this.scene.__arenaRef && this.scene.__arenaRef.consumeSlickAt) {
            const touched = this.scene.__arenaRef.consumeSlickAt(this.carGroup.position);
            if (touched) {
                // Start a quick uncontrollable spin
                this._spinDir = Math.random() > 0.5 ? 1 : -1;
                this._spinTime = touched === 'ice' ? 0.75 : 0.6;
                this._spinCooldown = 1.0;
                // Hard cut of speed so you end near a stop
                this.speed *= 0.25;
                this.momentum = this.speed;
            }
        }
    }

    // Activate a short timed speed multiplier (e.g., from a jump pad)
    // Optional 4th argument spawnRings: pass false for jump pads (manual boosts show rings)
    triggerPadBoost(durationSeconds = 0.3, multiplier = 1.6, falloffSeconds = 0.2, spawnRings = true) {
        const nowMs = (performance.now ? performance.now() : Date.now());
        const durMs = Math.max(10, durationSeconds * 1000);
        const fallMs = Math.max(0, falloffSeconds * 1000);
        this._padBoostMultiplier = Math.max(1.0, multiplier || 1.0);
        this._padBoostUntilMs = nowMs + durMs;
        this._padBoostFalloffEndMs = this._padBoostUntilMs + fallMs;
        // Spawn visual rings only when requested (manual boosts)
        if (spawnRings) {
            this._spawnBoostRings();
        }
    }

    // Current multiplier including fade-out after the hard boost window
    getBoostMultiplier() {
        const nowMs = (performance.now ? performance.now() : Date.now());
        if (nowMs <= this._padBoostUntilMs) return this._padBoostMultiplier;
        if (nowMs <= this._padBoostFalloffEndMs) {
            const span = Math.max(1, this._padBoostFalloffEndMs - this._padBoostUntilMs);
            const r = (nowMs - this._padBoostUntilMs) / span; // 0..1 over fade
            return 1 + (1 - r) * (this._padBoostMultiplier - 1);
        }
        return 1.0;
    }

    applyKnockback(directionVector, strength) {
        const dir = directionVector.clone();
        if (dir.lengthSq() < 1e-6) return;
        dir.normalize();
        const s = Math.max(0, strength || 0);
        this.knockback.add(dir.multiplyScalar(s));
    }
    
    updateVisualEffects(deltaTime) {
        // Add some visual feedback based on speed
        const speedFactor = Math.abs(this.speed) / this.maxSpeed;
        
        // Headlight intensity based on speed
        this.leftHeadlight.material.emissiveIntensity = 0.3 + speedFactor * 0.3;
        this.rightHeadlight.material.emissiveIntensity = 0.3 + speedFactor * 0.3;
        
        // Taillight intensity (reverse when going backward)
        const tailIntensity = this.speed < 0 ? 0.5 + speedFactor * 0.5 : 0.2;
        this.leftTaillight.material.emissiveIntensity = tailIntensity;
        this.rightTaillight.material.emissiveIntensity = tailIntensity;
        
        // Keep preset body color; no dynamic health tint to preserve vehicle identity
        
        // Add slight tilt based on turning (for more dynamic feel)
        if (Math.abs(this.speed) > 5) {
            const tiltAmount = 0.1 * speedFactor;
            this.carGroup.rotation.z = -tiltAmount * Math.sin(this.carGroup.rotation.y * 2);
        } else {
            this.carGroup.rotation.z *= 0.9; // Return to level
        }

        // Update existing skid marks fade and cleanup
        this._updateSkidMarks(deltaTime);

        // Recharge boost charges continuously
        if (this._boostCharges < this._boostChargesMax) {
            this._boostCharges = Math.min(
                this._boostChargesMax,
                this._boostCharges + this._boostRechargePerSecond * deltaTime
            );
        }

        // Animate boost rings
        this._updateBoostRings(deltaTime);
    }

    // --- Skid marks implementation ---
    _ensureSkidAssets() {
        if (this._skidAssetsReady) return;
        // Create a small elongated oval texture via canvas
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const grad = ctx.createRadialGradient(64, 32, 4, 64, 32, 30);
        grad.addColorStop(0, 'rgba(0,0,0,0.55)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(64, 32, 52, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        this._skidTexture = new THREE.CanvasTexture(canvas);
        this._skidMaterial = new THREE.MeshBasicMaterial({
            map: this._skidTexture,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            toneMapped: false
        });
        this._skidMaterial.polygonOffset = true;
        this._skidMaterial.polygonOffsetFactor = -1;
        this._skidMaterial.polygonOffsetUnits = -1;
        this._skidGeo = new THREE.PlaneGeometry(0.32, 1.2);
        this._skidAssetsReady = true;
    }

    _maybeEmitSkidMarks(deltaTime) {
        if (!this._skidAssetsReady) return;
        this._skidEmitCooldown -= deltaTime;
        if (!this._isSkidding || this._skidEmitCooldown > 0) return;
        this._skidEmitCooldown = 0.05; // emit rate

        const wheels = [this.backLeftWheel, this.backRightWheel];
        for (const w of wheels) {
            if (!w) continue;
            const pos = new THREE.Vector3();
            w.getWorldPosition(pos);
            pos.y = 0.015; // slightly above ground
            const mesh = new THREE.Mesh(this._skidGeo, this._skidMaterial.clone());
            mesh.rotation.x = -Math.PI / 2;
            mesh.rotation.z = this.carGroup.rotation.y + (Math.random() - 0.5) * 0.1;
            mesh.position.copy(pos);
            mesh.renderOrder = 12;
            this.scene.add(mesh);
            this._skidMarks.push({ mesh, age: 0, lifetime: 12.0, fadeStart: 9.0 });
        }

        // Cap total marks to keep perf stable
        const maxMarks = 220;
        if (this._skidMarks.length > maxMarks) {
            const removeCount = this._skidMarks.length - maxMarks;
            for (let i = 0; i < removeCount; i++) {
                const m = this._skidMarks.shift();
                if (m && m.mesh && m.mesh.parent) m.mesh.parent.remove(m.mesh);
            }
        }
    }

    _updateSkidMarks(deltaTime) {
        if (!this._skidMarks.length) return;
        for (let i = this._skidMarks.length - 1; i >= 0; i--) {
            const m = this._skidMarks[i];
            m.age += deltaTime;
            if (!m.mesh) { this._skidMarks.splice(i, 1); continue; }
            // Fade after fadeStart
            if (m.age > m.fadeStart) {
                const r = Math.min(1, (m.age - m.fadeStart) / Math.max(0.001, m.lifetime - m.fadeStart));
                m.mesh.material.opacity = 0.95 * (1 - r);
            }
            if (m.age >= m.lifetime) {
                if (m.mesh.parent) m.mesh.parent.remove(m.mesh);
                this._skidMarks.splice(i, 1);
            }
        }
    }
    
    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
        
        // Visual feedback for damage
        this.showDamageEffect();
        
        // Check if car is destroyed
        if (this.health <= 0) {
            this.destroy();
        }
    }
    
    showDamageEffect() {
        // Keep vehicle base color; no color flash on damage
        // Optional: could add a subtle white flash via emissive or a brief scale pulse instead
    }
    
    destroy() {
        // Car destruction effect
        console.log('Car destroyed!');
        
        // Could add explosion particles here
        // For now, just hide the car
        this.carGroup.visible = false;
    }

    setInvulnerableFor(ms) {
        const now = (performance.now ? performance.now() : Date.now());
        this.invulnerableUntil = now + (ms || 3000);
        this._wasInvulnerable = true;
        this.setOpacity(0.8);
    }

    setOpacity(opacity) {
        const clamp = Math.max(0.2, Math.min(1, opacity));
        const setMat = (mesh) => {
            if (mesh && mesh.material) {
                mesh.material.transparent = true;
                mesh.material.opacity = clamp;
            }
        };
        setMat(this.mesh);
        setMat(this.cabin);
        setMat(this.frontBumper);
        if (this.leftHeadlight) setMat(this.leftHeadlight);
        if (this.rightHeadlight) setMat(this.rightHeadlight);
        if (this.leftTaillight) setMat(this.leftTaillight);
        if (this.rightTaillight) setMat(this.rightTaillight);
        // Wheels remain opaque for readability
    }
    
    respawn() {
        this.health = this.maxHealth;
        this.speed = 0;
        this.velocity.set(0, 0, 0);
        this.carGroup.position.set(0, 0, 0);
        this.carGroup.rotation.set(0, 0, 0);
        this.carGroup.visible = true;
    }
    
    getPosition() {
        return this.carGroup.position.clone();
    }
    
    getRotation() {
        return this.carGroup.rotation.y;
    }
    
    getHealth() {
        return this.health;
    }
    
    getSpeed() {
        return this.speed * this.getBoostMultiplier();
    }

    // Boost charges API for UI
    canUseBoost() {
        return this._boostCharges >= this._boostConsumeAmount - 1e-6;
    }
    consumeBoost() {
        this._boostCharges = Math.max(0, this._boostCharges - this._boostConsumeAmount);
    }
    getBoostCharges() {
        return this._boostCharges;
    }
    getBoostMax() {
        return this._boostChargesMax;
    }

    // --- Blob shadow implementation ---
    _createShadowBlob() {
        if (!this.scene) return;
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const g = ctx.createRadialGradient(size/2, size/2, size*0.1, size/2, size/2, size*0.5);
        g.addColorStop(0, 'rgba(0,0,0,0.55)');
        g.addColorStop(1, 'rgba(0,0,0,0.0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(size/2, size/2, size*0.5, 0, Math.PI*2); ctx.fill();
        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
        const geo = new THREE.PlaneGeometry(3.8, 3.8);
        const blob = new THREE.Mesh(geo, mat);
        blob.rotation.x = -Math.PI / 2;
        blob.renderOrder = 3;
        // Reduce z-fighting
        mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -1;
        this._shadowBlob = blob;
        this.scene.add(blob);
        this._updateShadowBlob();
    }

    _updateShadowBlob() {
        if (!this._shadowBlob) return;
        const p = this.carGroup ? this.carGroup.position : new THREE.Vector3();
        this._shadowBlob.position.set(p.x, 0.02, p.z);
        const h = Math.max(0, p.y);
        const inAir = h > 0.12; // show only when slightly off ground
        if (!inAir) {
            this._shadowBlob.material.opacity = 0.0;
            return;
        }
        const scale = 3.4 + Math.min(7.5, h * 1.6);
        this._shadowBlob.scale.set(scale, scale, 1);
        const opacity = Math.max(0.18, 0.75 - h * 0.22);
        this._shadowBlob.material.opacity = opacity;
    }

    // ---- Boost Ring VFX ----
    _spawnBoostRings() {
        if (!this.scene || !this.carGroup) return;
        const forward = new THREE.Vector3(Math.sin(this.carGroup.rotation.y), 0, Math.cos(this.carGroup.rotation.y));
        const rearDir = forward.clone().negate();
        const carWidth = (this.collisionHalfWidth ? this.collisionHalfWidth * 2 : 2.4);
        const baseScale = Math.max(1.2, carWidth * 0.8);
        const delays = [0.0, 0.25, 0.5];
        // Place rings just beyond the rear bumper and keep them attached to the car
        const halfLen = (this.collisionHalfLength ? this.collisionHalfLength : 2.0);
        const baseOffset = halfLen + 0.7; // start just behind the car

        for (let i = 0; i < 3; i++) {
            const ringGeo = new THREE.RingGeometry(0.45, 0.60, 64);
            const colors = [0x66e0ff, 0x32ffd6, 0x7aa6ff];
            const ringMat = new THREE.MeshBasicMaterial({ color: colors[i], transparent: true, opacity: 1.0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            // Orient so the ring faces backward along the exhaust (jet-like)
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), rearDir.clone().normalize());
            ring.quaternion.copy(q);
            // All rings originate from the same near-back position; delays create the 3 pulses
            const startPos = this.carGroup.position.clone().add(rearDir.clone().multiplyScalar(baseOffset));
            ring.position.copy(startPos.setY(this.carGroup.position.y + 0.6));
            const startScale = baseScale * (1 - i * 0.1);
            ring.scale.set(startScale, startScale, startScale);
            ring.renderOrder = 9;
            ring.visible = false; // show after delay
            this.scene.add(ring);
            this._boostRings.push({ mesh: ring, age: 0, lifetime: 0.5, delay: delays[i], started: false, baseOffset: baseOffset, maxExtra: 3.0, startScale });
        }
    }

    _updateBoostRings(deltaTime) {
        if (!this._boostRings || this._boostRings.length === 0) return;
        for (let i = this._boostRings.length - 1; i >= 0; i--) {
            const r = this._boostRings[i];
            if (!r.started) {
                r.delay -= deltaTime;
                if (r.delay <= 0) { r.started = true; r.mesh.visible = true; }
                else continue;
            }
            r.age += deltaTime;
            const t = Math.min(1, r.age / r.lifetime);
            // Recompute rear direction and place ring relative to current car position so it stays attached
            const rearDir = new THREE.Vector3(-Math.sin(this.carGroup.rotation.y), 0, -Math.cos(this.carGroup.rotation.y));
            const dist = r.baseOffset + r.maxExtra * t; // travel a short distance behind car
            const pos = this.carGroup.position.clone().add(rearDir.multiplyScalar(dist));
            const y = (this.carGroup ? this.carGroup.position.y : 0) + 0.6;
            r.mesh.position.set(pos.x, y, pos.z);
            // Keep the ring facing backward as the car turns
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), rearDir.normalize());
            r.mesh.quaternion.copy(q);
            // Size determined by distance so nearest ring is always largest (conical look)
            const travel = Math.max(0, Math.min(1, (dist - r.baseOffset) / Math.max(0.0001, r.maxExtra)));
            const scale = Math.max(0.25, r.startScale * (1 - 0.55 * travel));
            r.mesh.scale.set(scale, scale, scale);
            r.mesh.material.opacity = 0.95 * (1 - t);
            if (r.age >= r.lifetime) {
                this.scene.remove(r.mesh);
                this._boostRings.splice(i, 1);
            }
        }
        // Cap to avoid buildup
        if (this._boostRings.length > 12) {
            const excess = this._boostRings.length - 12;
            for (let i = 0; i < excess; i++) {
                const e = this._boostRings.shift();
                if (e && e.mesh && e.mesh.parent) e.mesh.parent.remove(e.mesh);
            }
        }
    }

    _setCarCastShadow(enabled) {
        if (this._castShadowState === enabled) return;
        this._castShadowState = enabled;
        const parts = [this.mesh, this.cabin, this.frontBumper, this.frontLeftWheel, this.frontRightWheel, this.backLeftWheel, this.backRightWheel];
        parts.forEach((m) => { if (m) m.castShadow = !!enabled; });
    }
} 