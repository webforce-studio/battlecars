import * as THREE from 'three';
import { VEHICLES } from './Vehicles.js';

export class OtherPlayers {
    constructor(scene) {
        this.scene = scene;
        this.players = new Map(); // Map of playerId to car mesh
        this.playerMaterials = new Map(); // Map of playerId to materials for color coding
        this.healthBars = new Map(); // Map of playerId to health bar group
    }

    addPlayer(playerId, position = { x: 0, y: 0, z: 0 }, health = 100, vehicleId = 'balanced') {
        if (this.players.has(playerId)) {
            // Player already exists - remove and recreate to handle vehicle changes or respawns
            this.removePlayer(playerId);
        }

        // Create car mesh for other player
        const carGroup = new THREE.Group();
        const bodyColor = (VEHICLES[vehicleId]?.color) ?? this.getPlayerColor(playerId);
        console.log(`🎨 Adding player ${playerId}: vehicleId="${vehicleId}" → color=0x${bodyColor.toString(16)}`);
        const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor, transparent: true, opacity: 1 });
        const accentMat = new THREE.MeshLambertMaterial({ color: 0x333333, transparent: true, opacity: 1 });

        // Dimensions by vehicle type
        let bodySize = { x: 2.0, y: 1.0, z: 4.0 }, cabinSize = { x: 1.6, y: 0.7, z: 1.8 }, ride = 0.45, wheelR = 0.5, base = 3.2, track = 2.4;
        if (vehicleId === 'sport') { bodySize={x:1.9,y:0.8,z:4.2}; cabinSize={x:1.4,y:0.6,z:1.4}; ride=0.25; wheelR=0.45; base=3.3; track=2.1; }
        if (vehicleId === 'tank')  { bodySize={x:2.2,y:1.2,z:3.8}; cabinSize={x:1.8,y:0.9,z:1.8}; ride=0.7;  wheelR=0.65; base=3.0; track=2.6; }

        const body = new THREE.Mesh(new THREE.BoxGeometry(bodySize.x, bodySize.y, bodySize.z), bodyMat);
        body.position.y = ride;
        carGroup.add(body);

        const cabin = new THREE.Mesh(new THREE.BoxGeometry(cabinSize.x, cabinSize.y, cabinSize.z), bodyMat);
        cabin.position.set(0, ride + 0.9, 0);
        carGroup.add(cabin);

        const frontBumper = new THREE.Mesh(new THREE.BoxGeometry( bodySize.x*0.95, 0.4, 0.7 ), accentMat);
        frontBumper.position.set(0, ride - 0.05, bodySize.z/2 + 0.35);
        carGroup.add(frontBumper);

        if (vehicleId === 'tank') {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(bodySize.x*0.9,0.5,0.2), accentMat);
            bar.position.set(0, ride + 0.1, bodySize.z/2 + 0.85);
            carGroup.add(bar);
        }

        // Wheels
        const wheelGeometry = new THREE.CylinderGeometry(wheelR, wheelR, 0.35, 10);
        const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
        
        const halfTrack = track/2 - 0.15; const halfBase = base/2 - 0.2;
        const wheelPositions = [
            { x: -halfTrack, y: ride - 0.05, z:  halfBase },
            { x:  halfTrack, y: ride - 0.05, z:  halfBase },
            { x: -halfTrack, y: ride - 0.05, z: -halfBase },
            { x:  halfTrack, y: ride - 0.05, z: -halfBase }
        ];

        wheelPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
            wheel.position.set(pos.x, pos.y, pos.z);
            wheel.rotation.z = Math.PI / 2;
            carGroup.add(wheel);
        });

        // Add headlights and taillights
        const lightGeometry = new THREE.SphereGeometry(0.1, 8, 8);
        const headlightMaterial = new THREE.MeshLambertMaterial({ color: 0xffffaa });
        const taillightMaterial = new THREE.MeshLambertMaterial({ color: 0xff4444 });

        // Headlights
        const headlight1 = new THREE.Mesh(lightGeometry, headlightMaterial);
        headlight1.position.set(-0.6, 0.8, 2.1);
        carGroup.add(headlight1);

        const headlight2 = new THREE.Mesh(lightGeometry, headlightMaterial);
        headlight2.position.set(0.6, 0.8, 2.1);
        carGroup.add(headlight2);

        // Taillights
        const taillight1 = new THREE.Mesh(lightGeometry, taillightMaterial);
        taillight1.position.set(-0.6, 0.8, -2.1);
        carGroup.add(taillight1);

        const taillight2 = new THREE.Mesh(lightGeometry, taillightMaterial);
        taillight2.position.set(0.6, 0.8, -2.1);
        carGroup.add(taillight2);

        // Position the car
        carGroup.position.set(position.x, position.y, position.z);
        
        // Add to scene
        this.scene.add(carGroup);
        
        // Store references
        // Compute neutral collision footprint and store metadata (no shape-specific tightening)
        const baseHalfW = track/2;
        const baseHalfL = base/2 + 0.35; // include bumper
        const lateralBias = 0.9;
        const longitudinalBias = 0.95;
        const radiusBias = 0.9;
        const effHalfW = baseHalfW * lateralBias;
        const effHalfL = baseHalfL * longitudinalBias;
        const radius = Math.max(1.0, Math.min(3.2, Math.sqrt(effHalfW*effHalfW + effHalfL*effHalfL) * radiusBias));

        carGroup.userData = carGroup.userData || {};
        carGroup.userData.collisionRadius = radius;
        carGroup.userData.vehicleId = vehicleId;
        carGroup.userData.collisionHalfWidth = effHalfW;
        carGroup.userData.collisionHalfLength = effHalfL;
        carGroup.userData.bodyMaterial = bodyMat;
        carGroup.userData.invulnerableUntil = 0;

        this.players.set(playerId, carGroup);
        this.playerMaterials.set(playerId, bodyMat);

        // Create overhead health indicator (big percent number)
        this.createHealthBar(playerId, health);

        console.log(`Added player ${playerId} to scene with health bar`);
    }

    updatePlayer(playerId, position, rotation) {
        const carGroup = this.players.get(playerId);
        if (carGroup) {
            // Smooth position update but clamp to target to avoid overshoot causing early collision
            const target = new THREE.Vector3(position.x, position.y, position.z);
            const delta = target.clone().sub(carGroup.position);
            // Prefer snap to authoritative to prevent rubber-banding overlaps
            carGroup.position.copy(target);
            
            // Smooth rotation update
            carGroup.rotation.y = THREE.MathUtils.lerp(carGroup.rotation.y, rotation, 0.1);
        }
    }

    activateShield(playerId, shieldUntil) {
        const carGroup = this.players.get(playerId);
        if (!carGroup) return;

        // Mark invulnerability for pulsing opacity effect
        carGroup.userData = carGroup.userData || {};
        carGroup.userData.invulnerableUntil = shieldUntil;
        carGroup.userData.restoredOpacity = false;

        // Remove any existing floor ring; we only use a HUD ring around the health number
        if (carGroup.userData.shieldRing) {
            carGroup.remove(carGroup.userData.shieldRing);
            carGroup.userData.shieldRing.geometry.dispose();
            carGroup.userData.shieldRing.material.dispose();
            carGroup.userData.shieldRing = null;
        }

        // Also surround the overhead health indicator number with a HUD ring
        const sprite = this.healthBars.get(playerId);
        if (sprite) {
            // If we previously attached the ring to the sprite, remove it
            if (sprite.userData && sprite.userData.shieldRingHUD) {
                const old = sprite.userData.shieldRingHUD;
                if (old.parent) old.parent.remove(old);
                old.geometry.dispose();
                old.material.dispose();
                sprite.userData.shieldRingHUD = null;
            }

            // Create a camera-facing ring attached to the car (not to the sprite) so we can keep it circular
            const hudMat = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
            // Thinner, more elegant ring around the number
            const hud = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.35, 72), hudMat);
            hud.position.set(0, 3.2, 0); // same height as the health number
            hud.renderOrder = 1000;
            carGroup.add(hud);
            carGroup.userData.shieldRingHUD = hud;
        }
    }

    removePlayer(playerId) {
        const carGroup = this.players.get(playerId);
        if (carGroup) {
            this.scene.remove(carGroup);
            this.players.delete(playerId);
            this.playerMaterials.delete(playerId);
            this.healthBars.delete(playerId);
            console.log(`Removed player ${playerId} from scene`);
        }
    }

    createHealthBar(playerId, health) {
        const carGroup = this.players.get(playerId);
        if (!carGroup) return;

        const maxHealth = VEHICLES[carGroup.userData?.vehicleId || 'balanced']?.maxHealth || 100;

        // Create canvas for crisp, readable number
        const canvas = document.createElement('canvas');
        canvas.width = 512; // higher res for clarity
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;

        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(4.0, 2.0, 1); // world units
        sprite.position.set(0, 3.2, 0);
        sprite.renderOrder = 999;

        carGroup.add(sprite);

        // Helper to draw percent with green→red color
        const draw = (val) => {
            const percent = Math.max(0, Math.min(100, Math.round((val / maxHealth) * 100)));
            // HSL from 120 (green) to 0 (red)
            const hue = (percent / 100) * 120;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // Shadow for readability
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = 16;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 4;
            // Text
            ctx.font = 'bold 160px Arial, Helvetica, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 14;
            const text = `${percent}`;
            // Stroke then fill for contrast
            ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
            ctx.fillText(text, canvas.width / 2, canvas.height / 2);
            texture.needsUpdate = true;
        };

        draw(health);

        // Store references
        sprite.userData = { canvas, ctx, texture, maxHealth, health };
        this.healthBars.set(playerId, sprite);
        console.log(`Created health number for player ${playerId}, total: ${this.healthBars.size}`);
    }

    getHealthColor(health) {
        if (health > 70) {
            return 0x00ff00; // Green
        } else if (health > 30) {
            return 0xffff00; // Yellow
        } else {
            return 0xff0000; // Red
        }
    }

    updatePlayerHealth(playerId, health, maxHealth = null) {
        // Keep car color constant: do not tint body materials based on health
        const sprite = this.healthBars.get(playerId);
        if (sprite && sprite.userData && sprite.userData.ctx) {
            const { ctx, canvas, texture } = sprite.userData;
            // Use provided maxHealth, stored maxHealth, or default to 100
            const playerMaxHealth = maxHealth || sprite.userData.maxHealth || 100;
            const percent = Math.max(0, Math.min(100, Math.round((health / playerMaxHealth) * 100)));
            const hue = (percent / 100) * 120;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = 16; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 4;
            ctx.font = 'bold 160px Arial, Helvetica, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 14;
            const text = `${percent}`;
            ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
            ctx.fillText(text, canvas.width / 2, canvas.height / 2);
            texture.needsUpdate = true;
            sprite.userData.health = health;
            // Update stored maxHealth if provided
            if (maxHealth) {
                sprite.userData.maxHealth = maxHealth;
            }
        }
    }

    getPlayerColor(playerId) {
        // Generate consistent colors based on player ID
        const colors = [
            0x00ff00, // Green
            0x0000ff, // Blue
            0xff00ff, // Magenta
            0x00ffff, // Cyan
            0xff8800, // Orange
            0x8800ff, // Purple
            0xff0088, // Pink
            0x88ff00  // Lime
        ];
        
        // Use player ID to select a color
        const index = playerId.charCodeAt(0) % colors.length;
        return colors[index];
    }

    clearAllPlayers() {
        this.players.forEach((carGroup, playerId) => {
            this.scene.remove(carGroup);
        });
        this.players.clear();
        this.playerMaterials.clear();
        this.healthBars.clear();
    }

    getPlayerCount() {
        return this.players.size;
    }

    updateHealthBarRotations(camera) {
        // Make health bars always face the camera
        let updatedCount = 0;
        this.healthBars.forEach((indicator, playerId) => {
            if (indicator && indicator.parent) {
                // If sprite, it already faces camera; just ensure render settings
                if (indicator.isSprite && indicator.material) {
                    indicator.material.depthTest = false;
                    indicator.material.depthWrite = false;
                    indicator.renderOrder = 999;
                }
                updatedCount++;
            }
            // Also handle shield visuals and pulse opacity for invulnerable players
            const grp = this.players.get(playerId);
            if (grp && grp.userData && grp.userData.bodyMaterial) {
                // Use wall-clock time to compare with server-provided shieldUntil (epoch ms)
                const now = Date.now();
                if (grp.userData.invulnerableUntil && now < grp.userData.invulnerableUntil) {
                    const t = now * 0.008;
                    const pulse = 0.65 + 0.25 * (0.5 + 0.5 * Math.sin(t));
                    grp.traverse((obj) => {
                        if (obj.isMesh && obj.material) {
                            obj.material.transparent = true;
                            obj.material.opacity = pulse;
                        }
                    });
                    // Animate shield ring if present
                    if (grp.userData.shieldRing) {
                        const ring = grp.userData.shieldRing;
                        ring.rotation.z += 0.05;
                        ring.material.opacity = 0.6 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.25));
                        ring.visible = true;
                    }
                    // Animate HUD ring if present
                    // Keep HUD ring facing camera and animate opacity/pulse
                    const grpRing = grp.userData.shieldRingHUD;
                    if (grpRing) {
                        // Make the ring always face the camera
                        grpRing.lookAt(camera.position);
                        grpRing.material.opacity = 0.65 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.5));
                        grpRing.visible = true;
                    }
                } else if (grp.userData.restoredOpacity !== true) {
                    grp.traverse((obj) => {
                        if (obj.isMesh && obj.material) {
                            obj.material.opacity = 1;
                        }
                    });
                    grp.userData.restoredOpacity = true;
                    // Hide and remove ring once effect ends
                    if (grp.userData.shieldRing) {
                        grp.remove(grp.userData.shieldRing);
                        grp.userData.shieldRing.geometry.dispose();
                        grp.userData.shieldRing.material.dispose();
                        grp.userData.shieldRing = null;
                    }
                    if (grp.userData.shieldRingHUD) {
                        const hud = grp.userData.shieldRingHUD;
                        grp.remove(hud);
                        hud.geometry.dispose();
                        hud.material.dispose();
                        grp.userData.shieldRingHUD = null;
                    }
                }
            }
        });
        
        if (updatedCount > 0) {
            console.log(`Updated ${updatedCount} health bar rotations`);
        }
    }
} 