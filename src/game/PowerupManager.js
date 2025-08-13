import * as THREE from 'three';

export class PowerupManager {
    constructor(scene, soundManager) {
        this.scene = scene;
        this.soundManager = soundManager;
        this.powerups = new Map(); // powerupId -> { mesh, parachute, type, position, landTime }
        this.clock = new THREE.Clock();
        this.drones = []; // active delivery drones
        this.arenaBounds = { x: 160, z: 120 }; // default; can be overridden by caller
        
        // Create materials for different powerup types
        this.materials = {
            health: new THREE.MeshLambertMaterial({ 
                color: 0xff4444, 
                transparent: true, 
                opacity: 0.9 
            }),
            shield: new THREE.MeshLambertMaterial({ 
                color: 0x4444ff, 
                transparent: true, 
                opacity: 0.9 
            }),
            parachute: new THREE.MeshLambertMaterial({ 
                color: 0xffffff, 
                transparent: true, 
                opacity: 0.8 
            })
        };
    }
    // Optional ground height sampler provided by main/arena
    setHeightSampler(fn) { this._heightAt = typeof fn === 'function' ? fn : null; }
    setPlacementInfoProvider(fn) { this._placementInfo = typeof fn === 'function' ? fn : null; }

    setArenaBounds(bounds) {
        if (bounds && typeof bounds.x === 'number' && typeof bounds.z === 'number') {
            this.arenaBounds = { x: bounds.x, z: bounds.z };
        }
    }

    // ---- Drone helpers ----
    _makeDrone() {
        const grp = new THREE.Group();
        // Body
        const body = new THREE.Mesh(
            new THREE.SphereGeometry(0.55, 12, 12),
            new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.35, roughness: 0.4, emissive: 0x111111, emissiveIntensity: 0.25 })
        );
        grp.add(body);
        // Arms + rotors (instanced discs)
        const armMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
        const armGeo = new THREE.BoxGeometry(1.2, 0.06, 0.06);
        for (let i = 0; i < 2; i++) {
            const arm = new THREE.Mesh(armGeo, armMat);
            arm.rotation.y = i * Math.PI / 2;
            grp.add(arm);
        }
        const rotorGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.02, 16);
        const rotorMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
        const rotors = new THREE.InstancedMesh(rotorGeo, rotorMat, 4);
        rotors.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        const rotorOffsets = [
            new THREE.Vector3(0.6, 0.05, 0.6),
            new THREE.Vector3(-0.6, 0.05, 0.6),
            new THREE.Vector3(0.6, 0.05, -0.6),
            new THREE.Vector3(-0.6, 0.05, -0.6)
        ];
        const tmp = new THREE.Object3D();
        rotorOffsets.forEach((p, i) => { tmp.position.copy(p); tmp.updateMatrix(); rotors.setMatrixAt(i, tmp.matrix); });
        grp.add(rotors);
        grp.userData.rotors = rotors;

        // Blinking LED for visibility
        const led = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xff4444 })
        );
        led.position.set(0, -0.2, 0);
        grp.add(led);
        grp.userData.led = led;

        // Slightly larger overall scale for visibility
        grp.scale.setScalar(2.0);
        return grp;
    }

    _createDroneDelivery(id, type, targetPosition, serverLandTime) {
        const now = Date.now();
        const drone = this._makeDrone();
        // Start far away and a bit high
        const dir = new THREE.Vector3(targetPosition.x, 0, targetPosition.z).normalize();
        if (!isFinite(dir.x)) dir.set(1, 0, 0);
        const start = new THREE.Vector3(targetPosition.x, 26 + Math.random() * 6, targetPosition.z).add(dir.multiplyScalar(-100 - Math.random() * 40));
        const mid1 = new THREE.Vector3(
            targetPosition.x + (Math.random() * 80 - 40),
            34,
            targetPosition.z + (Math.random() * 80 - 40)
        );
        const dropPoint = new THREE.Vector3(targetPosition.x, 20, targetPosition.z);
        // Exit point forward and slightly up
        const exitPoint = dropPoint.clone().add(dir.clone().multiplyScalar(100)).add(new THREE.Vector3(0, 16, 0));
        const curve = new THREE.CatmullRomCurve3([start, mid1, dropPoint, exitPoint], false, 'catmullrom', 0.06);
        // Slow, visible flyover so players can see the drone
        const totalMs = 9000 + Math.random() * 3000;
        const releaseFrac = 0.55;
        const releaseTime = now + totalMs * releaseFrac;
        drone.position.copy(start);
        drone.userData.path = curve;
        drone.userData.startTime = now;
        drone.userData.duration = totalMs;
        drone.userData.releaseTime = releaseTime;
        drone.userData.releaseFrac = releaseFrac;
        drone.userData.dropPoint = dropPoint.clone();
        drone.userData.state = 'carrying';

        // Create crate+parachute payload, initially attached under drone, parachute hidden
        const payloadGroup = new THREE.Group();
        const crate = this.createPowerupMesh(type);
        const parachute = this.createParachute();
        parachute.visible = false;
        crate.position.y = -1.2;
        payloadGroup.add(crate, parachute);
        drone.add(payloadGroup);

        // Register record but delay ground drop timings until release
        const record = {
            mesh: payloadGroup,
            powerupMesh: crate,
            parachute,
            type,
            position: dropPoint.clone(),
            landTime: releaseTime + 3000, // 3s descent post-release
            dropTime: releaseTime,
            landed: false,
            symbolGroup: crate.userData.symbolGroup || null,
            inTransit: true,
            id
        };
        this.powerups.set(id, record);

        this.scene.add(drone);
        this.drones.push({ obj: drone, id });
    }

    createPowerupMesh(type) {
        const group = new THREE.Group();

        // Create a more game-like powerup crate: inner core + colored edge frame + subtle glow
        const coreGeometry = new THREE.BoxGeometry(1.8, 1.8, 1.8);
        const coreMaterial = new THREE.MeshStandardMaterial({
            color: type === 'health' ? 0xd43d3d : 0x2d6cdf, // brighter reds/blues (no black)
            emissive: type === 'health' ? 0x7a1414 : 0x142a66,
            emissiveIntensity: 0.45,
            metalness: 0.2,
            roughness: 0.55
        });
        const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
        coreMesh.castShadow = false; coreMesh.receiveShadow = false;

        // Edge frame using line segments
        const frameGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(2.1, 2.1, 2.1));
        const frameMaterial = new THREE.LineBasicMaterial({
            color: type === 'health' ? 0xff6b6b : 0x5aa9ff,
            linewidth: 2
        });
        const frame = new THREE.LineSegments(frameGeometry, frameMaterial);

        // Soft outer glow
        const glowGeometry = new THREE.BoxGeometry(2.4, 2.4, 2.4);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: type === 'health' ? 0xff4444 : 0x3b82f6,
            transparent: true,
            opacity: 0.25,
            side: THREE.BackSide
        });
        const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);

        // Create floating symbol group above the box
        const symbolGroup = new THREE.Group();
        symbolGroup.position.y = 2.2; // Float above the crate

        if (type === 'health') {
            // Red cross symbol (two thin boxes)
            const barMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
            const verticalBar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.2, 0.12), barMat);
            const horizontalBar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.12), barMat);
            symbolGroup.add(verticalBar, horizontalBar);
        } else if (type === 'shield') {
            // Stylized shield: torus ring + small octa core
            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(0.65, 0.08, 8, 20),
                new THREE.MeshBasicMaterial({ color: 0x66ccff })
            );
            const core = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.35),
                new THREE.MeshBasicMaterial({ color: 0x99ddff })
            );
            ring.rotation.x = Math.PI / 2;
            symbolGroup.add(ring, core);
        }

        // Assemble
        group.add(glowMesh, coreMesh, frame, symbolGroup);

        // Expose symbol group for animation
        group.userData.symbolGroup = symbolGroup;

        return group;
    }

    createParachute() {
        const group = new THREE.Group();
        
        // Parachute canopy
        const canopyGeometry = new THREE.SphereGeometry(3, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
        const canopyMesh = new THREE.Mesh(canopyGeometry, this.materials.parachute);
        canopyMesh.position.y = 2;
        
        // Parachute lines
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x666666 });
        const points = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(-2, 2, -2),
        ];
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
        
        // Create 4 lines from center to canopy edges
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2;
            const x = Math.cos(angle) * 2;
            const z = Math.sin(angle) * 2;
            
            const linePoints = [
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(x, 2, z)
            ];
            const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
            const line = new THREE.Line(lineGeo, lineMaterial);
            group.add(line);
        }
        
        group.add(canopyMesh);
        return group;
    }

    dropPowerup(powerupData) {
        const { id, type, position, landTime } = powerupData;
        console.log(`🎁 Scheduling drone delivery for ${type} at`, position);
        this._createDroneDelivery(id, type, new THREE.Vector3(position.x, position.y, position.z), landTime);
    }

    updatePowerups() {
        const currentTime = Date.now();
        
        this.powerups.forEach((powerup, id) => {
            const { mesh, parachute, landTime, dropTime, landed, inTransit } = powerup;
            
            // If still being carried by drone, skip until release
            if (inTransit) return;

            if (!landed && currentTime >= landTime) {
                // Powerup has landed - remove parachute
                mesh.remove(parachute);
                powerup.landed = true;
                
                // Move powerup to ground/platform level
                const gx = mesh.position.x, gz = mesh.position.z;
                const groundY = this._heightAt ? this._heightAt(gx, gz) : 1;
                mesh.position.y = groundY;
                // Position crate so its bottom sits on the surface (show the underside)
                const crateHalfHeight = 1.2; // matches glow 2.4 box half height
                powerup.powerupMesh.position.y = crateHalfHeight;
                // Resolve side-wall overlaps with platform by nudging outside or snapping to top
                this._resolvePlatformOverlap(mesh);
                
                console.log(`🎁 Powerup ${id} landed`);
            } else if (!landed) {
                // Still falling - animate parachute descent
                const fallProgress = (currentTime - dropTime) / (landTime - dropTime);
                const gx = mesh.position.x, gz = mesh.position.z;
                const targetY = this._heightAt ? this._heightAt(gx, gz) : 1; // Ground/platform top
                const startY = powerup.position.y;
                
                mesh.position.y = startY + (targetY - startY) * fallProgress;
                
                // Sway the parachute gently
                const sway = Math.sin(currentTime * 0.002) * 0.5;
                mesh.rotation.z = sway * 0.1;
                parachute.rotation.y += 0.01;
            } else {
                // Landed powerup - gentle rotation and floating
                const crateHalfHeight = 1.2;
                const floatOffset = Math.sin(currentTime * 0.003) * 0.2;
                // Keep base on surface and add a subtle hover
                powerup.powerupMesh.position.y = crateHalfHeight + 0.2 + floatOffset;
                powerup.powerupMesh.rotation.y += 0.02;

                // Pulse the glow (first child is glow)
                const pulseScale = 1 + Math.sin(currentTime * 0.005) * 0.1;
                if (powerup.powerupMesh.children[0]) {
                    powerup.powerupMesh.children[0].scale.setScalar(pulseScale);
                }

                // Bob the floating symbol slightly
                if (powerup.symbolGroup) {
                    powerup.symbolGroup.position.y = 2.2 + Math.sin(currentTime * 0.0035) * 0.25;
                    powerup.symbolGroup.rotation.y += 0.015;
                }
            }
        });

        // Update drones pathing and handle release
        this._updateDrones();
    }

    _updateDrones() {
        if (!this.drones.length) return;
        const now = Date.now();
        for (let i = this.drones.length - 1; i >= 0; i--) {
            const d = this.drones[i];
            const obj = d.obj;
            const path = obj.userData.path;
            const start = obj.userData.startTime;
            const dur = obj.userData.duration || 1;
            // Smooth eased motion (ease-in-out) to feel less snappy
            const lin = Math.min(1, (now - start) / dur);
            let t = 0.5 - 0.5 * Math.cos(Math.PI * lin);
            const pos = path.getPoint(t);
            const nextT = Math.min(1, t + 0.01);
            const nextPos = path.getPoint(nextT);
            obj.position.copy(pos);
            obj.lookAt(nextPos);
            // Spin rotors
            const rotors = obj.userData.rotors; if (rotors) rotors.rotation.y += 1.4;
            const led = obj.userData.led; if (led) { const s = (Math.sin(now * 0.012) + 1) * 0.5; led.material.color.setHSL(0.0, 1.0, 0.35 + 0.25 * s); }

            // Release payload when time or when near the drop point along path
        // Consider arena boundary: only drop when well inside the oval bounds
            const dropPt = obj.userData.dropPoint || new THREE.Vector3();
            const dx = obj.position.x - dropPt.x;
            const dz = obj.position.z - dropPt.z;
            const d2Now = dx*dx + dz*dz; // planar distance squared
            const nearDrop = d2Now < (5.5 * 5.5);
            // Detect passing closest planar approach
            const prevD2 = obj.userData.prevD2;
            obj.userData.prevD2 = d2Now;
            const passedClosest = (typeof prevD2 === 'number') && d2Now > prevD2 && prevD2 < (12*12);
            if ((nearDrop || passedClosest || now >= obj.userData.releaseTime || t >= (obj.userData.releaseFrac || 0.5)) && obj.userData.state === 'carrying') {
                obj.userData.state = 'released';
                const record = this.powerups.get(d.id);
                if (record) {
                    // Compute payload world transform from current drone parent
                    obj.updateMatrixWorld(true);
                    record.mesh.updateMatrixWorld(true);
                    const payloadWorldPos = new THREE.Vector3();
                    record.mesh.getWorldPosition(payloadWorldPos);
                    // Detach from drone explicitly, then add to scene
                    obj.remove(record.mesh);
                    this.scene.add(record.mesh);
                    record.mesh.position.set(dropPt.x, payloadWorldPos.y, dropPt.z);
                    // Reset rotations so parachute stands upright
                    record.mesh.rotation.set(0, 0, 0);
                    if (record.parachute) record.parachute.rotation.set(0, 0, 0);
                    if (record.powerupMesh) {
                        record.powerupMesh.position.set(0, -1, 0);
                        record.powerupMesh.rotation.set(0, 0, 0);
                    }
                    record.parachute.visible = true;
                    record.dropTime = now;
                    record.landTime = now + 3000;
                    record.inTransit = false;
                    // Record the starting position for descent math
                    record.position = new THREE.Vector3(dropPt.x, payloadWorldPos.y, dropPt.z);
                    // If landing area is near platform side, bias XZ slightly inward/outward to avoid half-overlaps
                    if (this._placementInfo) {
                        const info = this._placementInfo(dropPt.x, dropPt.z);
                        if (info && info.nearPlatformEdge) {
                            record.position.x += info.push.x;
                            record.position.z += info.push.z;
                            record.mesh.position.x = record.position.x;
                            record.mesh.position.z = record.position.z;
                        }
                    }
                }
            }

            // Remove drone after it flies slightly past drop point
            if (obj.userData.state === 'released' && t >= 1) {
                this.scene.remove(obj);
                this.drones.splice(i, 1);
            }
        }
    }

    removePowerup(powerupId) {
        const powerup = this.powerups.get(powerupId);
        if (powerup) {
            this.scene.remove(powerup.mesh);
            this.powerups.delete(powerupId);
            console.log(`🎁 Removed powerup ${powerupId}`);
        }
    }

    checkCollisions(playerPosition, onCollision) {
        const collectionRadius = 3.0; // Distance to collect powerup
        
        this.powerups.forEach((powerup, id) => {
            if (!powerup.landed) return; // Can only collect landed powerups
            
            const distance = playerPosition.distanceTo(powerup.mesh.position);
            if (distance < collectionRadius) {
                console.log(`🎁 Player collected ${powerup.type} powerup!`);
                onCollision(id, powerup.type);
            }
        });
    }

    cleanup() {
        this.powerups.forEach((powerup, id) => {
            this.scene.remove(powerup.mesh);
        });
        this.powerups.clear();
    }
}
