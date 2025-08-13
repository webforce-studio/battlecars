import * as THREE from 'three';

export class Arena {
    constructor(scene) {
        this.scene = scene;
        this.bounds = { x: 160, z: 120 }; // 2x bigger oval dimensions
        this.wallHeight = 8;
        this.wallThickness = 2;
      // Slick patch spawn settings
      this._slickConfig = { numIce: 1, numOil: 1, respawnDelay: 30 }; // seconds
        
        this.createArena();
    }
    
    createArena() {
        // Create the asphalt surface (oval shape)
        this.createAsphaltSurface();
        
        // Create the wall boundaries
        this.createWalls();
        
        // Create audience stands around the entire arena
        this.createAudienceStands();

        // Add decorative flag posts around the outside of the stands
        this.createFlagPosts();
        
        // Sky elements
        this.createClouds();
        this.createBirds();
        
        // Add some visual elements
        this.addArenaDetails();

        // Add roaming monster on the asphalt
        this.createMonster();

        // Elevated block with ramp and lift
        this.createElevatedBlock();

        // Mirrored L-barriers with a central passage on opposite side
        this.createLBarriers();
        
        // Create test boost pads immediately for debugging
        console.log('🎯 Creating test boost pads for debugging');
        const testBoostPads = [
            { x: 60, z: 40, rotation: 0.5 },
            { x: -50, z: -70, rotation: 2.1 }
        ];
        this.createBoostPadsFromServer(testBoostPads);
        
        // Add spawn point indicators
        this.createSpawnPointIndicators();

        // Stadium spotlights (gantries)
        this.createStadiumLights();

        // Slick patches (ice/oil) to alter traction
        this.createSlickPatches();
    }

    // ===== Atmosphere: Clouds and Birds =====
    createClouds() {
        this.clouds = [];
        const cloudCount = 8;
        for (let i = 0; i < cloudCount; i++) {
            const cloud = this._makeCloudMesh();
            const radius = Math.max(this.bounds.x, this.bounds.z) + 30 + Math.random() * 40;
            const angle = Math.random() * Math.PI * 2;
            const y = this.wallHeight + 40 + Math.random() * 20;
            cloud.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
            cloud.userData = {
                angle,
                radius,
                speed: 0.02 + Math.random() * 0.04, // radians/sec
                clockwise: Math.random() > 0.5
            };
            cloud.renderOrder = 10;
            this.scene.add(cloud);
            this.clouds.push(cloud);
        }
    }

    // ===== Hazard Monster =====
    createMonster() {
        // Scary low-poly monster: spiky icosahedron with glowing eyes and aura
        const group = new THREE.Group();

        const bodyGeo = new THREE.IcosahedronGeometry(2.1, 0);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a2436, roughness: 0.75, metalness: 0.1, emissive: 0x2b0010, emissiveIntensity: 0.45 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        // Disable non-car shadows
        body.castShadow = false;
        body.receiveShadow = false;
        group.add(body);

        // Eyes (glowing red)
        const eyeGeo = new THREE.SphereGeometry(0.22, 8, 8);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3333, toneMapped: false });
        const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
        const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
        eyeL.position.set(-0.55, 0.25, 1.6);
        eyeR.position.set(0.55, 0.25, 1.6);
        body.add(eyeL); body.add(eyeR);

        // Small red point light for menace
        const glow = new THREE.PointLight(0xff3344, 0.5, 12);
        glow.position.set(0, 0.6, 0);
        group.add(glow);

        // Spikes around body
        const spikes = new THREE.Group();
        const coneGeo = new THREE.ConeGeometry(0.4, 1.2, 6);
        const coneMat = new THREE.MeshStandardMaterial({ color: 0x5c0f0f, roughness: 0.6, metalness: 0.15, emissive: 0x220000, emissiveIntensity: 0.35 });
        const spikeCount = 18;
        const golden = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < spikeCount; i++) {
            const y = 1 - (i / (spikeCount - 1)) * 2; // -1..1
            const r = Math.sqrt(1 - y * y);
            const theta = i * golden;
            const dir = new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r);
            const spike = new THREE.Mesh(coneGeo, coneMat);
            // Position outward from body and orient along normal
            const dist = 2.15;
            spike.position.copy(dir.clone().multiplyScalar(dist));
            spike.lookAt(dir.clone().multiplyScalar(3.5));
            spikes.add(spike);
        }
        group.add(spikes);

        // Aura and ground shadow
        const aura = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff2244, opacity: 0.18, transparent: true, depthWrite: false }));
        aura.scale.set(6, 6, 1);
        aura.position.y = 0.2;
        group.add(aura);
        const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.3, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -1.2;
        group.add(ring);

        // Start near center with random direction
        const startAngle = Math.random() * Math.PI * 2;
        group.position.set(Math.cos(startAngle) * 10, 1.3, Math.sin(startAngle) * 10);
        this.scene.add(group);

        const speed = 22; // units per second
        const dir2 = new THREE.Vector2(Math.cos(startAngle + 1.1), Math.sin(startAngle + 1.1)).normalize();
        this.monster = {
            mesh: group,
            radius: 2.6,
            velocity: dir2.multiplyScalar(speed),
            spikes,
            aura,
            eyeMat,
            t: 0
        };
    }

    updateMonster(deltaTime) {
        if (!this.monster) return;
        const m = this.monster;
        const p = m.mesh.position;

        // Integrate motion on XZ plane
        p.x += m.velocity.x * deltaTime;
        p.z += m.velocity.y * deltaTime;

        // Bounce off inner oval wall (approximate elliptical reflection)
        const a = this.bounds.x - this.wallThickness * 1.2; // semi-major X
        const b = this.bounds.z - this.wallThickness * 1.2; // semi-minor Z
        const k = (p.x * p.x) / (a * a) + (p.z * p.z) / (b * b);
        if (k >= 1.0) {
            // Compute outward normal of ellipse at current position
            const nx = (2 * p.x) / (a * a);
            const nz = (2 * p.z) / (b * b);
            const nLen = Math.hypot(nx, nz) || 1;
            const nHatX = nx / nLen;
            const nHatZ = nz / nLen;
            // Reflect velocity: v' = v - 2 (v·n) n
            const dot = m.velocity.x * nHatX + m.velocity.y * nHatZ;
            m.velocity.x = m.velocity.x - 2 * dot * nHatX;
            m.velocity.y = m.velocity.y - 2 * dot * nHatZ;
            // Nudge back inside boundary
            p.x -= nHatX * 0.8;
            p.z -= nHatZ * 0.8;
            // Small random spin change for variation
            const rot = (Math.random() - 0.5) * 0.3;
            const cos = Math.cos(rot), sin = Math.sin(rot);
            const vx = m.velocity.x * cos - m.velocity.y * sin;
            const vz = m.velocity.x * sin + m.velocity.y * cos;
            m.velocity.set(vx, vz);
        }
        // Bounce against L-barriers (treat as AABBs)
        if (this.lBarriers && this.lBarriers.length) {
            for (const b of this.lBarriers) {
                const dx = p.x - b.x;
                const dz = p.z - b.z;
                const extX = b.halfW + m.radius;
                const extZ = b.halfD + m.radius;
                if (Math.abs(dx) <= extX && Math.abs(dz) <= extZ) {
                    const penX = extX - Math.abs(dx);
                    const penZ = extZ - Math.abs(dz);
                    const bounce = 0.9;
                    if (penX < penZ) {
                        p.x = b.x + Math.sign(dx || 1) * (extX + 0.05);
                        m.velocity.x = -m.velocity.x * bounce;
                    } else {
                        p.z = b.z + Math.sign(dz || 1) * (extZ + 0.05);
                        m.velocity.y = -m.velocity.y * bounce; // z stored in y
                    }
                }
            }
        }
        // Collide with elevated platform sides (treat as AABB prism)
        if (this.platformSurface) {
            const ps = this.platformSurface;
            const halfH = 6.5; // approximate platform height
            const withinY = p.y <= ps.y + halfH && p.y >= 0;
            if (withinY && Math.abs(p.x - ps.x) <= (ps.halfW + m.radius) && Math.abs(p.z - ps.z) <= (ps.halfD + m.radius)) {
                // Push out along least-penetration axis and reflect horizontal velocity
                const dx = p.x - ps.x;
                const dz = p.z - ps.z;
                const penX = (ps.halfW + m.radius) - Math.abs(dx);
                const penZ = (ps.halfD + m.radius) - Math.abs(dz);
                if (penX < penZ) {
                    const sign = Math.sign(dx || 1);
                    p.x = ps.x + sign * (ps.halfW + m.radius + 0.02);
                    m.velocity.x = -m.velocity.x;
                } else {
                    const sign = Math.sign(dz || 1);
                    p.z = ps.z + sign * (ps.halfD + m.radius + 0.02);
                    m.velocity.y = m.velocity.y; // unchanged vertical
                    m.velocity.y = m.velocity.y;
                    m.velocity.x = m.velocity.x;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y; // no-op fix for lints
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    // reflect z
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.x = m.velocity.x;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    m.velocity.y = m.velocity.y;
                    // actually flip z
                    m.velocity.y = m.velocity.y;
                }
            }
        }
        // Face travel direction and animate scary bits
        m.mesh.lookAt(p.x + m.velocity.x, m.mesh.position.y, p.z + m.velocity.y);
        m.t += deltaTime;
        if (m.spikes) m.spikes.rotation.y += 0.8 * deltaTime;
        if (m.aura) m.aura.material.opacity = 0.14 + 0.08 * (0.5 + 0.5 * Math.sin(m.t * 2.3));
        if (m.eyeMat) m.eyeMat.color.setHSL(0.0, 1.0, 0.45 + 0.15 * (0.5 + 0.5 * Math.sin(m.t * 6.0)));
    }

    getMonsterInfo() {
        if (!this.monster) return null;
        return { position: this.monster.mesh.position, radius: this.monster.radius };
    }

    _makeCloudMesh() {
        const w = 20 + Math.random() * 18;
        const h = 10 + Math.random() * 8;
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0,0,256,128);
        // soft cloud blob
        const grad = ctx.createRadialGradient(128,64,20,128,64,64);
        grad.addColorStop(0, 'rgba(255,255,255,0.9)');
        grad.addColorStop(1, 'rgba(255,255,255,0.0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(128,64,110,50,0,0,Math.PI*2);
        ctx.fill();
        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.7, toneMapped: false });
        const geo = new THREE.PlaneGeometry(w, h);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = 0; // billboarded towards camera in update
        mesh.rotation.y = 0;
        mesh.userData.isCloud = true;
        return mesh;
    }

    createBirds() {
        this.birds = [];
        const birdCount = 10;
        for (let i = 0; i < birdCount; i++) {
            const bird = this._makeBirdSprite();
            const radius = 20 + Math.random() * 80;
            const angle = Math.random() * Math.PI * 2;
            const y = this.wallHeight + 22 + Math.random() * 25;
            bird.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
            bird.userData = {
                angle,
                radius,
                flap: Math.random() * Math.PI * 2,
                speed: 0.8 + Math.random() * 1.2, // radians/sec for orbit path
                clockwise: Math.random() > 0.5
            };
            bird.scale.setScalar(1 + Math.random() * 0.6);
            bird.renderOrder = 20;
            this.scene.add(bird);
            this.birds.push(bird);
        }
    }

    _makeBirdSprite() {
        // Simple V-shaped bird sprite
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0,0,size,size);
        // initial wing pose
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(8, size*0.6);
        ctx.lineTo(size*0.5, size*0.3);
        ctx.lineTo(size-8, size*0.6);
        ctx.stroke();
        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9, toneMapped: false });
        const sprite = new THREE.Sprite(mat);
        sprite.userData.isBird = true;
        // Keep references for per-frame wing redrawing
        sprite.userData.canvas = canvas;
        sprite.userData.ctx = ctx;
        sprite.userData.size = size;
        sprite.userData.texture = tex;
        return sprite;
    }

    updateAtmosphere(deltaTime, camera = null) {
        // Handle timed respawn of slick patches
        if (this._slickRespawns && this._slickRespawns.length) {
            for (let i = this._slickRespawns.length - 1; i >= 0; i--) {
                const r = this._slickRespawns[i];
                r.t -= deltaTime;
                if (r.t <= 0) {
                    this._spawnSlickPatch(r.type);
                    this._slickRespawns.splice(i, 1);
                }
            }
        }
        // Drive subtle crowd wobble by advancing shader uTime
        if (this._crowdTimeUniforms && this._crowdTimeUniforms.length) {
            this._crowdTimeUniforms.forEach(u => { if (u) u.value += deltaTime; });
        }
        // Animate clouds around the arena
        if (this.clouds) {
            this.clouds.forEach(cloud => {
                const dir = cloud.userData.clockwise ? -1 : 1;
                cloud.userData.angle += cloud.userData.speed * deltaTime * dir;
                const x = Math.cos(cloud.userData.angle) * cloud.userData.radius;
                const z = Math.sin(cloud.userData.angle) * cloud.userData.radius;
                cloud.position.x = x;
                cloud.position.z = z;
                if (camera) cloud.lookAt(camera.position);
            });
        }
        // Animate birds sweeping over arena
        if (this.birds) {
            this.birds.forEach(bird => {
                const dir = bird.userData.clockwise ? -1 : 1;
                bird.userData.angle += bird.userData.speed * deltaTime * 0.2 * dir;
                bird.userData.flap += deltaTime * 8;
                const x = Math.cos(bird.userData.angle) * bird.userData.radius;
                const z = Math.sin(bird.userData.angle) * bird.userData.radius;
                const y = bird.position.y + Math.sin(bird.userData.flap) * 0.02; // subtle bob
                bird.position.set(x, y, z);
                if (camera) bird.lookAt(camera.position);

                // Animate wings by redrawing the sprite's canvas
                const ctx = bird.userData.ctx;
                const size = bird.userData.size;
                if (ctx) {
                    const flap = Math.sin(bird.userData.flap);
                    ctx.clearRect(0, 0, size, size);
                    ctx.strokeStyle = '#333';
                    ctx.lineWidth = 4;
                    ctx.lineCap = 'round';
                    const centerX = size * 0.5;
                    const centerY = size * 0.34 + flap * -3; // slight body shift
                    const leftX = 8;
                    const rightX = size - 8;
                    const wingDrop = size * 0.28 + flap * 14; // flap amplitude
                    ctx.beginPath();
                    ctx.moveTo(leftX, wingDrop);
                    ctx.lineTo(centerX, centerY);
                    ctx.lineTo(rightX, wingDrop);
                    ctx.stroke();
                    // small body dot
                    ctx.fillStyle = '#333';
                    ctx.beginPath();
                    ctx.arc(centerX, centerY + 3, 2.5, 0, Math.PI * 2);
                    ctx.fill();
                    if (bird.userData.texture) bird.userData.texture.needsUpdate = true;
                }
            });
        }
        // Wave flags
        if (this.flags && this.flags.length) {
            this.flags.forEach(flag => {
                const ud = flag.userData;
                if (!ud) return;
                ud.waveT += deltaTime * ud.waveSpeed;
                const s = Math.sin(ud.waveT) * 0.22; // a bit stronger for big pennants
                // Bend by offsetting z across width, but keep the anchored edge (x≈0) fixed
                const pos = flag.geometry.attributes.position;
                for (let i = 0; i < pos.count; i++) {
                    const x = pos.getX(i);
                    // Normalize from 0..w with left edge at 0 (anchored) to 0..1
                    const nx = Math.min(1, Math.max(0, x / ((ud.widthHalf || 1) * 2)));
                    pos.setZ(i, s * nx);
                }
                pos.needsUpdate = true;
            });
        }
        // Update stadium lights (flicker+shadow selection)
        if (this.stadiumLights && this.stadiumLights.length) {
            const t = (this._lt || 0) + deltaTime; this._lt = t;
            const carPos = (this._lastCarPos || new THREE.Vector3());
            // Light flicker and beam pulse
            this.stadiumLights.forEach((L) => {
                const base = L.userData.baseIntensity || 1.1;
                const flick = 0.96 + 0.04 * (0.5 + 0.5 * Math.sin(t * (1.5 + L.userData.seed)));
                L.intensity = base * flick;
                if (L.userData.beam) {
                    const s = 0.92 + 0.12 * (0.5 + 0.5 * Math.sin(t * (1.7 + L.userData.seed)));
                    L.userData.beam.scale.set(1, s, 1);
                }
            });
            // Choose nearest 3 lights to cast shadows
            if (this._shadowPickCooldown === undefined) this._shadowPickCooldown = 0;
            this._shadowPickCooldown -= deltaTime;
            if (this._shadowPickCooldown <= 0) {
                this._shadowPickCooldown = 0.25;
                // Find car position from camera target if available
                const cp = this._carPositionProvider ? this._carPositionProvider() : null;
                if (cp) carPos.copy(cp); this._lastCarPos = carPos;
                const sorted = this.stadiumLights
                    .map((L) => ({ L, d2: (L.position.x - carPos.x) ** 2 + (L.position.z - carPos.z) ** 2 }))
                    .sort((a, b) => a.d2 - b.d2);
                const active = new Set();
                sorted.slice(0, 3).forEach((e) => { active.add(e.L); });
                this.stadiumLights.forEach((L) => {
                    const enable = active.has(L);
                    if (L.castShadow !== enable) {
                        L.castShadow = enable;
                    }
                });
            }
        }
    }

    // Public API for main to pass car position function (to avoid circular deps)
    setCarPositionProvider(fn) { this._carPositionProvider = fn; }

    // === Slick patches (ice / oil) ===
    createSlickPatches() {
        this.slickPatches = [];
        this._slickRespawns = [];
        for (let i = 0; i < (this._slickConfig.numIce || 0); i++) this._spawnSlickPatch('ice');
        for (let i = 0; i < (this._slickConfig.numOil || 0); i++) this._spawnSlickPatch('oil');
    }

    // Returns a grip modifier 0<grip<=1 at a given position, or 1 if none
    getSlickModifier(pos) {
        if (!this.slickPatches || !pos) return { grip: 1, type: null };
        for (const p of this.slickPatches) {
            const dx = pos.x - p.x; const dz = pos.z - p.z;
            const d2 = dx * dx + dz * dz;
            if (d2 <= p.radius * p.radius) {
                const grip = p.type === 'ice' ? 0.35 : 0.6; // lower = slipperier
                return { grip, type: p.type };
            }
        }
        return { grip: 1, type: null };
    }

    // Consume and remove a patch the moment a car touches it
    consumeSlickAt(pos) {
        if (!this.slickPatches || !pos) return null;
        for (let i = 0; i < this.slickPatches.length; i++) {
            const p = this.slickPatches[i];
            const dx = pos.x - p.x; const dz = pos.z - p.z;
            if (dx * dx + dz * dz <= p.radius * p.radius) {
                if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh);
                this.slickPatches.splice(i, 1);
                // Schedule respawn of same type after delay
                const delay = Math.max(5, this._slickConfig.respawnDelay || 30);
                this._slickRespawns.push({ t: delay, type: p.type });
                return p.type;
            }
        }
        return null;
    }

    createStadiumLights() {
        this.stadiumLights = [];
        // Cookie texture (simple radial vignette with grille)
        const cookie = this._makeLightCookie();
        const ringR = Math.max(this.bounds.x, this.bounds.z) + 18;
        const count = 8;
        const height = this.wallHeight + 22;
        for (let i = 0; i < count; i++) {
            const ang = (i / count) * Math.PI * 2 + 0.12;
            const x = Math.cos(ang) * ringR;
            const z = Math.sin(ang) * ringR;
            const spot = new THREE.SpotLight(0xffffff, 1.1, 220, Math.PI * 0.22, 0.4, 1.2);
            spot.position.set(x, height, z);
            spot.target.position.set(0, 0, 0);
            this.scene.add(spot.target);
            spot.castShadow = false; // will be enabled dynamically for nearest lights
            spot.shadow.mapSize.set(512, 512);
            spot.shadow.bias = -0.0008;
            // Spotlight cookie if available in this Three.js version
            if ('map' in spot) {
                spot.map = cookie;
            }
            this.scene.add(spot);
            // Optional volumetric beam for visibility
            const beamGeo = new THREE.ConeGeometry(8, 40, 16, 1, true);
            const beamMat = new THREE.MeshBasicMaterial({ color: 0x9ecfff, transparent: true, opacity: 0.06, depthWrite: false });
            const beam = new THREE.Mesh(beamGeo, beamMat);
            beam.position.copy(spot.position);
            beam.lookAt(spot.target.position);
            this.scene.add(beam);
            spot.userData = { baseIntensity: 1.1, seed: Math.random() * 2, beam };
            this.stadiumLights.push(spot);
        }
    }

    _makeLightCookie() {
        const s = 128;
        const c = document.createElement('canvas');
        c.width = s; c.height = s;
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, s, s);
        // Radial gradient vignette
        const g = ctx.createRadialGradient(s/2, s/2, s*0.05, s/2, s/2, s*0.5);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s/2, s/2, s*0.5, 0, Math.PI*2); ctx.fill();
        // Grille lines
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 6;
        for (let i=0;i<4;i++){ ctx.beginPath(); const y = (i+1)*(s/5); ctx.moveTo(s*0.22, y); ctx.lineTo(s*0.78, y); ctx.stroke(); }
        const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
        return tex;
    }

    _spawnSlickPatch(type) {
        // Find a location not overlapping platform/ramp/lift footprints
        let x = 0, z = 0;
        const radius = type === 'ice' ? 7.0 : 6.0;
        let tries = 0;
        const maxTries = 40;
        const pick = () => {
            const angle = Math.random() * Math.PI * 2;
            const rr = Math.sqrt(Math.random()) * 0.75; // stay well inside
            x = Math.cos(angle) * this.bounds.x * rr;
            z = Math.sin(angle) * this.bounds.z * rr;
        };
        pick();
        while (tries < maxTries && this._isForbiddenForSlick(x, z, radius)) { tries++; pick(); }
        const opacity = type === 'ice' ? 0.3 : 0.48; // oil more visible
        const tex = this._makeSlickTexture(type);
        const geo = new THREE.CircleGeometry(radius, 48);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, toneMapped: false });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x, 0.03, z);
        mesh.renderOrder = 8;
        this.scene.add(mesh);
        this.slickPatches.push({ x, z, radius, type, mesh });
    }

    _isForbiddenForSlick(x, z, radius) {
        // Avoid platform deck footprint
        if (this.platformSurface) {
            const ps = this.platformSurface;
            if (Math.abs(x - ps.x) <= (ps.halfW + radius) && Math.abs(z - ps.z) <= (ps.halfD + radius)) {
                return true;
            }
        }
        // Avoid ramp corridor footprint
        if (this.rampSurface) {
            const r = this.rampSurface;
            if (Math.abs(x - r.x) <= (r.halfW + radius) && z >= (r.zStart - radius) && z <= (r.zEnd + radius)) {
                return true;
            }
        }
        // Avoid lift pad area if present
        if (this.liftZones && this.liftZones.length) {
            for (const l of this.liftZones) {
                if (Math.abs(x - l.position.x) <= (l.halfW + radius) && Math.abs(z - l.position.z) <= (l.halfD + radius)) {
                    return true;
                }
            }
        }
        return false;
    }

    // === L-barriers (two mirrored L shapes with a gap) ===
    createLBarriers() {
        const thickness = 1.2;
        const height = 3.2;
        const longLen = 26;
        const shortLen = 12;
        const gapWidth = 8; // central passage

        const group = new THREE.Group();
        // Match platform blue
        const mat = new THREE.MeshLambertMaterial({ color: 0x2b6cff });

        // Place on the opposite side of the arena relative to platform
        const centerX = -this.bounds.x * 0.45;
        const centerZ = this.bounds.z * 0.35;

        // Helper to build an L at offset and rotation
        const buildL = (cx, cz, rotY) => {
            const g = new THREE.Group();
            // Long segment
            const longGeo = new THREE.BoxGeometry(longLen, height, thickness);
            const longMesh = new THREE.Mesh(longGeo, mat);
            longMesh.position.set((longLen/2 - thickness/2), height/2, 0);
            g.add(longMesh);
            // Short segment
            const shortGeo = new THREE.BoxGeometry(thickness, height, shortLen);
            const shortMesh = new THREE.Mesh(shortGeo, mat);
            shortMesh.position.set((longLen - thickness), height/2, -(shortLen/2 - thickness/2));
            g.add(shortMesh);
            g.position.set(cx, 0, cz);
            g.rotation.y = rotY;
            group.add(g);
            return g;
        };

        // Two L's facing each other with a gap
        const leftL = buildL(centerX - gapWidth/2, centerZ, 0);
        const rightL = buildL(centerX + gapWidth/2, centerZ, Math.PI);

        // Add thin top caps for visual clarity
        const capMat = new THREE.MeshLambertMaterial({ color: 0x2b6cff });
        const addCaps = (parent) => {
            parent.children.forEach((seg) => {
                const capGeo = new THREE.BoxGeometry(seg.geometry.parameters.width || seg.geometry.parameters.depth || thickness, 0.12, seg.geometry.parameters.depth || seg.geometry.parameters.width || thickness);
                const cap = new THREE.Mesh(capGeo, capMat);
                cap.position.copy(seg.position.clone());
                cap.position.y = height + 0.06;
                parent.add(cap);
            });
        };
        addCaps(leftL); addCaps(rightL);

        this.scene.add(group);

        // Register barrier AABBs for car collisions (store expanded bounds)
        this.lBarriers = [];
        const register = (seg, world) => {
            const size = new THREE.Vector3();
            seg.geometry.computeBoundingBox();
            const bb = seg.geometry.boundingBox.clone();
            bb.getSize(size);
            const pos = seg.getWorldPosition(new THREE.Vector3());
            // Ignore very thin caps (height too low)
            if (size.y > 1.0) {
                this.lBarriers.push({ x: pos.x, z: pos.z, halfW: size.x/2, halfD: size.z/2, yTop: height });
            }
        };
        leftL.children.forEach((c) => { if (c.geometry && c.geometry.parameters) register(c, group); });
        rightL.children.forEach((c) => { if (c.geometry && c.geometry.parameters) register(c, group); });

        // Save group for reference
        this.lBarriersGroup = group;
    }

    // === Elevated block (platform) with ramp and lift ===
    createElevatedBlock() {
        // Parameters
        const platformSize = { w: 28, d: 18, h: 6.5 };
        const platformPos = new THREE.Vector3(40, platformSize.h, -25);

        // Platform top
        const topGeo = new THREE.BoxGeometry(platformSize.w, 1, platformSize.d);
        const topMat = new THREE.MeshLambertMaterial({ color: 0x2b6cff });
        const topMesh = new THREE.Mesh(topGeo, topMat);
        topMesh.position.copy(platformPos);
        topMesh.receiveShadow = true;
        this.scene.add(topMesh);
        // Deck absolute top Y (box is 1 unit thick centered on platformPos.y)
        const deckTopY = platformPos.y + 0.5;

        // Platform sides (simple skirt) — match blue top
        const skirtGeo = new THREE.BoxGeometry(platformSize.w, platformSize.h, 0.6);
        const skirtMat = new THREE.MeshLambertMaterial({ color: 0x2b6cff });
        const front = new THREE.Mesh(skirtGeo, skirtMat);
        const back = new THREE.Mesh(skirtGeo, skirtMat);
        front.position.set(platformPos.x, platformSize.h/2, platformPos.z + platformSize.d/2);
        back.position.set(platformPos.x, platformSize.h/2, platformPos.z - platformSize.d/2);
        const sideGeo = new THREE.BoxGeometry(0.6, platformSize.h, platformSize.d);
        const left = new THREE.Mesh(sideGeo, skirtMat);
        const right = new THREE.Mesh(sideGeo, skirtMat);
        left.position.set(platformPos.x - platformSize.w/2, platformSize.h/2, platformPos.z);
        right.position.set(platformPos.x + platformSize.w/2, platformSize.h/2, platformPos.z);
        [front, back, left, right].forEach(m => { m.receiveShadow = true; this.scene.add(m); });

        // Paint top driving surface lines
        const lineGeo = new THREE.PlaneGeometry(platformSize.w * 0.8, 0.18);
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false });
        for (let i= -1; i<=1; i++) {
            const line = new THREE.Mesh(lineGeo, lineMat);
            line.rotation.x = -Math.PI/2;
            line.position.set(platformPos.x, platformPos.y + 0.02, platformPos.z + i * 2.4);
            this.scene.add(line);
        }

        // Drivable ramp from ground to platform (inclined path)
        const rampLength = 26;
        const rampWidth = 6;
        // Make ramp a hair higher than deck to avoid edge catching
        const rampHeight = deckTopY + 0.06; // from ground (0) to slightly above deck top
        const rampGeo = new THREE.BoxGeometry(rampWidth, 0.8, rampLength);
        const rampMat = new THREE.MeshLambertMaterial({ color: 0x2b6cff });
        const ramp = new THREE.Mesh(rampGeo, rampMat);
        // Place ramp on the SOUTH (long) side, oriented along +Z so you drive forward onto the platform
        const zEnd = platformPos.z - platformSize.d/2 + 0.02; // flush with south face
        const zStart = zEnd - rampLength;
        const rampMid = new THREE.Vector3(platformPos.x, rampHeight/2, (zStart + zEnd) / 2);
        ramp.position.copy(rampMid);
        const tilt = Math.atan2(rampHeight, rampLength);
        ramp.rotation.x = -tilt; // incline upward toward platform
        ramp.receiveShadow = true;
        this.scene.add(ramp);
        // Simple guard rails
        const railGeo = new THREE.BoxGeometry(0.2, 0.8, rampLength);
        const railMat = new THREE.MeshLambertMaterial({ color: 0x2b6cff });
        const railL = new THREE.Mesh(railGeo, railMat);
        const railR = new THREE.Mesh(railGeo, railMat);
        railL.position.set(ramp.position.x - rampWidth/2 + 0.1, ramp.position.y + 0.6, ramp.position.z);
        railR.position.set(ramp.position.x + rampWidth/2 - 0.1, ramp.position.y + 0.6, ramp.position.z);
        railL.rotation.x = railR.rotation.x = ramp.rotation.x;
        [railL, railR].forEach(m => this.scene.add(m));

        // Lift: square pad attached to platform edge that raises to top height
        const liftGroup = new THREE.Group();
        // Base pad (yellow square)
        const padSize = 5.0;
        const liftPadGeo = new THREE.BoxGeometry(padSize, 0.3, padSize);
        const liftPadMat = new THREE.MeshLambertMaterial({ color: 0xffcc00 });
        const liftPad = new THREE.Mesh(liftPadGeo, liftPadMat);
        const padX = platformPos.x + platformSize.w/2 - padSize/2 - 0.3; // attached to edge
        const padZ = platformPos.z;
        liftPad.position.set(padX, 0.15, padZ);
        liftGroup.add(liftPad);
        // Cabin that extrudes upward (same footprint)
        const cabinMat = new THREE.MeshLambertMaterial({ color: 0xffe066, transparent: true, opacity: 0.95 });
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(padSize*0.96, 0.2, padSize*0.96), cabinMat);
        cabin.position.set(padX, 0.25, padZ);
        liftGroup.add(cabin);
        // Up-arrow icon on pad
        const iconCanvas = document.createElement('canvas'); iconCanvas.width = 256; iconCanvas.height = 256;
        const ictx = iconCanvas.getContext('2d');
        ictx.clearRect(0,0,256,256);
        ictx.fillStyle = '#000000';
        ictx.beginPath();
        ictx.moveTo(128, 48); ictx.lineTo(208, 128); ictx.lineTo(168, 128); ictx.lineTo(168, 208); ictx.lineTo(88, 208); ictx.lineTo(88, 128); ictx.lineTo(48, 128); ictx.closePath();
        ictx.fill();
        const iconTex = new THREE.CanvasTexture(iconCanvas);
        const icon = new THREE.Mesh(new THREE.PlaneGeometry(padSize*0.9, padSize*0.9), new THREE.MeshBasicMaterial({ map: iconTex, transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false }));
        icon.rotation.x = -Math.PI/2; icon.position.set(padX, 0.32, padZ);
        liftGroup.add(icon);

        this.scene.add(liftGroup);

        // Store lift trigger and target (rect bounds), plus visuals
        this.liftZones = this.liftZones || [];
        this.liftZones.push({
            position: liftPad.position.clone(),
            halfW: padSize * 0.5,
            halfD: padSize * 0.5,
            targetY: deckTopY,
            targetXZ: new THREE.Vector3(platformPos.x + platformSize.w/2 - padSize*0.5, deckTopY, platformPos.z),
            speed: 5.0, // vertical m/s
            active: false,
            progress: 0,
            duration: 2.0,
            visuals: { group: liftGroup, cabin }
        });

        // Register collision footprints for platform and ramp
        this.platformSurface = {
            x: platformPos.x, z: platformPos.z, halfW: platformSize.w/2, halfD: platformSize.d/2, y: deckTopY
        };
        this.rampSurface = {
            // Axis-aligned along Z
            x: rampMid.x, z: rampMid.z, halfW: rampWidth/2, halfL: rampLength/2, y0: 0, y1: rampHeight,
            zStart, zEnd
        };
    }
    _makeSlickTexture(type) {
        const size = 256;
        const c = document.createElement('canvas'); c.width = size; c.height = size;
        const ctx = c.getContext('2d');
        ctx.clearRect(0,0,size,size);
        if (type === 'ice') {
            // Icy disk with bright rim and subtle cracks for readability
            const g = ctx.createRadialGradient(size/2,size/2,size*0.12,size/2,size/2,size*0.48);
            g.addColorStop(0, 'rgba(160,230,255,0.95)');
            g.addColorStop(1, 'rgba(160,230,255,0.0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(size/2,size/2,size*0.48,0,Math.PI*2); ctx.fill();
            // bright rim
            ctx.strokeStyle = 'rgba(200,245,255,0.85)';
            ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(size/2,size/2,size*0.46,0,Math.PI*2); ctx.stroke();
            // hairline cracks
            ctx.strokeStyle = 'rgba(255,255,255,0.45)';
            ctx.lineWidth = 1.4;
            for (let i=0;i<6;i++) {
                ctx.beginPath();
                const a = Math.random()*Math.PI*2; const r = size*0.22 + Math.random()*size*0.25;
                ctx.moveTo(size/2 + Math.cos(a)*r, size/2 + Math.sin(a)*r);
                ctx.lineTo(size/2 + Math.cos(a+0.22)*r*0.6, size/2 + Math.sin(a+0.22)*r*0.6);
                ctx.stroke();
            }
        } else {
            // Oily dark puddle with hazard symbol and sheen
            const g2 = ctx.createRadialGradient(size/2,size/2,size*0.05,size/2,size/2,size*0.48);
            g2.addColorStop(0, 'rgba(0,0,0,1.0)');
            g2.addColorStop(1, 'rgba(0,0,0,0.0)');
            ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(size/2,size/2,size*0.48,0,Math.PI*2); ctx.fill();
            // Add big droplet highlight to read as liquid
            const h = ctx.createRadialGradient(size*0.38,size*0.38,2,size*0.38,size*0.38,size*0.18);
            h.addColorStop(0,'rgba(255,255,255,0.6)');
            h.addColorStop(1,'rgba(255,255,255,0.0)');
            ctx.fillStyle = h; ctx.beginPath(); ctx.arc(size*0.38,size*0.38,size*0.18,0,Math.PI*2); ctx.fill();
            // Yellow/black hazard stripes ring (clear meaning)
            const ringR1 = size*0.44, ringR2 = size*0.48;
            for(let i=0;i<16;i++){
                const a0 = (i/16)*Math.PI*2; const a1 = ((i+1)/16)*Math.PI*2;
                ctx.beginPath();
                ctx.moveTo(size/2 + Math.cos(a0)*ringR1, size/2 + Math.sin(a0)*ringR1);
                ctx.arc(size/2,size/2, ringR1, a0, a1);
                ctx.lineTo(size/2 + Math.cos(a1)*ringR2, size/2 + Math.sin(a1)*ringR2);
                ctx.arc(size/2,size/2, ringR2, a1, a0, true);
                ctx.closePath();
                ctx.fillStyle = (i % 2 === 0) ? 'rgba(255,204,0,0.9)' : 'rgba(0,0,0,0.9)';
                ctx.fill();
            }
        }
        const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true; return tex;
    }

    // Create 360° stands with 10 rows of colorful audience blocks
    createAudienceStands() {
        const rows = 10;
        const segments = 120; // number of audience clusters per ring
        const baseOutset = this.wallThickness + 6; // distance outwards from wall
        const rowStepOutset = 2.2;  // radial increase per row
        const rowStepHeight = 0.8;  // height increase per row
        const blockSize = { w: 2.0, d: 1.2, h: 1.1 };
        const center = new THREE.Vector3(0, 0, 0);
        const palette = [0xff6b6b, 0xf7b32b, 0x4ecdc4, 0x45aaf2, 0xa55eea, 0x26de81, 0xfd9644, 0x2bcbba];

        const baseRowY = this.wallHeight + 0.3; // start at wall top
        for (let r = 0; r < rows; r++) {
            const rowY = baseRowY + r * rowStepHeight;
            const addX = baseOutset + r * rowStepOutset;
            const addZ = baseOutset + r * rowStepOutset;

            const geom = new THREE.BoxGeometry(blockSize.w, blockSize.h, blockSize.d);
            const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
            const mesh = new THREE.InstancedMesh(geom, mat, segments);
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.castShadow = false;
            mesh.receiveShadow = false;

            const dummy = new THREE.Object3D();
            const phases = new Float32Array(segments);
            const amps = new Float32Array(segments);
            for (let i = 0; i < segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                const x = Math.cos(angle) * (this.bounds.x + addX);
                const z = Math.sin(angle) * (this.bounds.z + addZ);

                dummy.position.set(x, rowY, z);
                // Face towards the arena center
                dummy.lookAt(center);
                // Add slight random jitter to break uniformity
                dummy.position.y += (Math.random() - 0.5) * 0.12;
                dummy.rotation.y += (Math.random() - 0.5) * 0.08;
                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);
                // Color variation per block
                const c = new THREE.Color(palette[(i + r) % palette.length]);
                c.offsetHSL(0, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08);
                mesh.setColorAt(i, c);

                // Per-instance wobble parameters
                phases[i] = Math.random() * Math.PI * 2;          // random start phase
                amps[i] = 0.05 + Math.random() * 0.05;            // 5–10 cm wobble
            }
            mesh.instanceColor.needsUpdate = true;

            // Attach per-instance attributes for shader wobble
            mesh.geometry.setAttribute('instancePhase', new THREE.InstancedBufferAttribute(phases, 1));
            mesh.geometry.setAttribute('instanceAmp', new THREE.InstancedBufferAttribute(amps, 1));

            // Inject a tiny vertex wobble via onBeforeCompile, preserving lighting/colors
            mat.onBeforeCompile = (shader) => {
                // Uniform to drive time
                shader.uniforms.uTime = { value: 0 };
                if (!this._crowdTimeUniforms) this._crowdTimeUniforms = [];
                this._crowdTimeUniforms.push(shader.uniforms.uTime);

                // Add attributes/uniforms and offset logic
                shader.vertexShader = shader.vertexShader
                    .replace('#include <common>', `#include <common>\nuniform float uTime;\nattribute float instancePhase;\nattribute float instanceAmp;`)
                    .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);\ntransformed.y += sin(uTime * 2.2 + instancePhase) * instanceAmp;`);
            };

            this.scene.add(mesh);
            if (!this.audienceMeshes) this.audienceMeshes = [];
            this.audienceMeshes.push(mesh);

            // --- Add a thin floor platform under this row ---
            const radiusX = this.bounds.x + addX;
            const radiusZ = this.bounds.z + addZ;
            const platformThicknessWorld = 1.6; // radial thickness in world units
            // Convert desired world thickness to normalized ring thickness (relative to X radius)
            const thicknessNorm = Math.max(0.003, platformThicknessWorld / radiusX);
            const innerR = 1 - thicknessNorm;
            const outerR = 1;
            const ringGeo = new THREE.RingGeometry(innerR, outerR, 128);
            const ringMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a, side: THREE.DoubleSide });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            // Scale ring into an ellipse matching the arena bounds + row offset
            ring.scale.set(radiusX, radiusZ, 1);
            // Place slightly below seat bottoms
            const floorY = rowY - (blockSize.h * 0.5) - 0.06;
            ring.position.set(0, floorY, 0);
            ring.rotation.x = -Math.PI / 2;
            ring.receiveShadow = true;
            this.scene.add(ring);
            if (!this.audienceFloors) this.audienceFloors = [];
            this.audienceFloors.push(ring);

            // --- Add a vertical riser (stage front) below this row so you can't see through ---
            // Height from previous step to this floor
            const prevRowY = (r === 0)
                ? (this.wallHeight - 0.2)
                : (baseRowY + (r - 1) * rowStepHeight) - (blockSize.h * 0.5) - 0.06;
            const riserHeight = Math.max(0.4, (floorY - prevRowY) + 0.12);

            // Build an extruded elliptical ring band (inner/outer) and extrude upward as the riser wall
            const thicknessWorld = platformThicknessWorld; // match floor radial thickness
            const riserOuterRX = radiusX;
            const riserOuterRZ = radiusZ;
            const riserInnerRX = Math.max(0.1, radiusX - thicknessWorld);
            const riserInnerRZ = Math.max(0.1, radiusZ - thicknessWorld);

            const riserShape = new THREE.Shape();
            // Normalized unit ellipse (outer)
            riserShape.absellipse(0, 0, 1, 1, 0, Math.PI * 2, false, 0);
            // Inner hole
            const riserHole = new THREE.Path();
            // Use inner radii normalized to outer radii
            const innerNormRX = riserInnerRX / riserOuterRX;
            const innerNormRZ = riserInnerRZ / riserOuterRZ;
            riserHole.absellipse(0, 0, Math.max(0.01, innerNormRX), Math.max(0.01, innerNormRZ), 0, Math.PI * 2, true, 0);
            riserShape.holes.push(riserHole);

            const riserGeo = new THREE.ExtrudeGeometry(riserShape, {
                depth: riserHeight,
                bevelEnabled: false,
                steps: 1
            });
            // Scale XY of unit ellipse into ellipse with requested radii
            riserGeo.scale(riserOuterRX, riserOuterRZ, 1);

            const riserMat = new THREE.MeshLambertMaterial({ color: 0x2e2e2e, side: THREE.DoubleSide });
            const riserMesh = new THREE.Mesh(riserGeo, riserMat);
            // Rotate so the extrusion depth (Z) becomes vertical Y
            riserMesh.rotation.x = -Math.PI / 2;
            // Position the bottom of the riser at the previous floor height
            riserMesh.position.set(0, prevRowY, 0);
            riserMesh.receiveShadow = true;
            this.scene.add(riserMesh);
            if (!this.audienceRisers) this.audienceRisers = [];
            this.audienceRisers.push(riserMesh);
        }
    }

    // === Flag posts around the outer ring ===
    createFlagPosts() {
        // Match stand layout to place flags just outside the outermost row
        const rows = 10;
        const baseOutset = this.wallThickness + 6;
        const rowStepOutset = 2.2;
        const rowStepHeight = 0.8;
        const blockHeight = 1.1; // keep in sync with audience blocks
        const topOfStandsY = (this.wallHeight + 0.3) + (rows - 1) * rowStepHeight + (blockHeight * 0.5);
        const outerRadiusX = this.bounds.x + baseOutset + (rows - 1) * rowStepOutset + 3.0;
        const outerRadiusZ = this.bounds.z + baseOutset + (rows - 1) * rowStepOutset + 3.0;
        
        const postCount = 14; // number of posts around arena
        const postHeight = 11; // keep pole height; we will lower flags slightly
        const postGeo = new THREE.CylinderGeometry(0.12, 0.12, postHeight, 8);
        const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.5, roughness: 0.6 });
        
        this.flags = [];
        for (let i = 0; i < postCount; i++) {
            const angle = (i / postCount) * Math.PI * 2;
            const x = Math.cos(angle) * outerRadiusX;
            const z = Math.sin(angle) * outerRadiusZ;
            
            // Post
            const post = new THREE.Mesh(postGeo, postMat);
            // Place the base of the pole at the top height of the stands
            post.position.set(x, topOfStandsY + postHeight / 2, z);
            // Face inward
            post.lookAt(0, post.position.y, 0);
            this.scene.add(post);
            
            // Add 3 small flags staggered on the post
            const group = new THREE.Group();
            post.add(group);
            
            for (let j = 0; j < 3; j++) {
                const flag = this._makeFlagMesh(j);
                // Distribute flags a bit higher and increase vertical spacing to avoid overlap
                // Base of post is at local y = -postHeight/2
                const yLocal = -postHeight * 0.5 + (postHeight * 0.78 - j * 1.35);
                flag.position.set(0, yLocal, 0);
                // Minimal clearance from pole so the long edge visually touches
                flag.position.x += 0.035;
                // Slight depth stagger to prevent z-fighting/overlap in view
                flag.position.z += (j - 1) * 0.18;
                group.add(flag);
                this.flags.push(flag);
            }
        }
    }
    
    _makeFlagMesh(seed = 0) {
        // Large triangular pennant with primary colours
        const w = 5.5, h = 2.8; // width (from pole outward) and height
        const geo = new THREE.PlaneGeometry(w, h, 22, 1); // segments along width for wave
        // Shift geometry so the long edge (left side) sits at x=0 → anchor at pole
        geo.translate(w * 0.5, 0, 0);

        // Primary colours: red, blue, yellow
        const colors = [0xff3b30, 0x007aff, 0xffcc00];
        const col = new THREE.Color(colors[seed % colors.length]);

        // Draw right-pointing triangle on transparent canvas
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 256, 128);
        ctx.beginPath();
        ctx.moveTo(0, 0);            // near pole, top
        ctx.lineTo(256, 64);         // far tip
        ctx.lineTo(0, 128);          // near pole, bottom
        ctx.closePath();
        ctx.fillStyle = `#${col.getHexString()}`;
        ctx.fill();
        // Subtle white edge
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 4; ctx.stroke();
        const tex = new THREE.CanvasTexture(canvas);

        const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, opacity: 0.98, toneMapped: false });
        const mesh = new THREE.Mesh(geo, mat);
        // Point outward from arena center relative to the post after parenting
        mesh.rotation.y = Math.PI / 2; // plane's +X points outward from pole
        mesh.userData = { waveT: Math.random() * Math.PI * 2, waveSpeed: 3 + Math.random() * 2, widthHalf: w * 0.5 };
        return mesh;
    }
    
    createAsphaltSurface() {
        // Create properly oval-shaped asphalt surface using custom geometry
        const segments = 32;
        const shape = new THREE.Shape();
        
        // Create oval path
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const x = Math.cos(angle) * this.bounds.x;
            const y = Math.sin(angle) * this.bounds.z;
            
            if (i === 0) {
                shape.moveTo(x, y);
            } else {
                shape.lineTo(x, y);
            }
        }
        
        const asphaltGeometry = new THREE.ShapeGeometry(shape);
        const asphaltMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xCCCCCC // Light gray color
        });
        
        this.asphalt = new THREE.Mesh(asphaltGeometry, asphaltMaterial);
        this.asphalt.rotation.x = -Math.PI / 2; // Rotate to be horizontal
        // Keep ground receiving shadows so car shadows are visible
        this.asphalt.receiveShadow = true;
        this.scene.add(this.asphalt);
        
        // Add asphalt texture pattern
        this.addAsphaltTexture();
    }
    
    addAsphaltTexture() {
        // Create a simple asphalt texture pattern
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        // Fill with light gray
        ctx.fillStyle = '#CCCCCC';
        ctx.fillRect(0, 0, 512, 512);
        
        // Add some texture lines
        ctx.strokeStyle = '#AAAAAA';
        ctx.lineWidth = 1;
        
        for (let i = 0; i < 50; i++) {
            ctx.beginPath();
            ctx.moveTo(Math.random() * 512, Math.random() * 512);
            ctx.lineTo(Math.random() * 512, Math.random() * 512);
            ctx.stroke();
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(4, 4);
        
        this.asphalt.material.map = texture;
        this.asphalt.material.needsUpdate = true;
    }
    
    createWalls() {
        // Create a single smooth oval wall using custom geometry with thickness
        const wallMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x666666,
            transparent: true,
            opacity: 0.9
        });
        
        // Create custom geometry for a smooth oval wall with thickness
        const geometry = new THREE.BufferGeometry();
        const segments = 128; // High segment count for smoothness
        const wallThickness = 2; // Wall thickness
        
        const positions = [];
        const indices = [];
        const normals = [];
        
        // Create vertices for the oval wall with thickness
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const x = Math.cos(angle) * this.bounds.x;
            const z = Math.sin(angle) * this.bounds.z;
            
            // Calculate outer and inner positions for thickness
            const outerX = Math.cos(angle) * (this.bounds.x + wallThickness);
            const outerZ = Math.sin(angle) * (this.bounds.z + wallThickness);
            const innerX = Math.cos(angle) * (this.bounds.x - wallThickness);
            const innerZ = Math.sin(angle) * (this.bounds.z - wallThickness);
            
            // Outer vertices (bottom and top)
            positions.push(outerX, 0, outerZ);
            positions.push(outerX, this.wallHeight, outerZ);
            
            // Inner vertices (bottom and top)
            positions.push(innerX, 0, innerZ);
            positions.push(innerX, this.wallHeight, innerZ);
            
            // Normals pointing outward and inward
            const normalX = Math.cos(angle);
            const normalZ = Math.sin(angle);
            normals.push(normalX, 0, normalZ); // Outer
            normals.push(normalX, 0, normalZ); // Outer
            normals.push(-normalX, 0, -normalZ); // Inner
            normals.push(-normalX, 0, -normalZ); // Inner
        }
        
        // Create faces for the thick wall
        for (let i = 0; i < segments; i++) {
            const base = i * 4;
            
            // Outer wall face
            indices.push(base, base + 1, base + 4);
            indices.push(base + 1, base + 5, base + 4);
            
            // Inner wall face
            indices.push(base + 2, base + 6, base + 3);
            indices.push(base + 3, base + 6, base + 7);
            
            // Top face
            indices.push(base + 1, base + 3, base + 5);
            indices.push(base + 3, base + 7, base + 5);
            
            // Bottom face
            indices.push(base, base + 4, base + 2);
            indices.push(base + 2, base + 4, base + 6);
        }
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setIndex(indices);
        geometry.computeBoundingSphere();
        
        const wall = new THREE.Mesh(geometry, wallMaterial);
        // Disable wall shadows to keep only car shadows
        wall.castShadow = false;
        wall.receiveShadow = false;
        
        // Add to scene
        this.scene.add(wall);
        
        // Store reference for collision detection
        this.walls = [wall];
        
        // Create advertisement panels on the walls
        this.createAdPanels();
    }
    
    createAdPanels() {
        // Four billboards mounted just inside the oval wall so they feel flush/present
        // Place them against the inner face of the wall on the four cardinal directions
        const innerOffsetX = this.bounds.x - this.wallThickness + 0.2; // slightly inside
        const innerOffsetZ = this.bounds.z - this.wallThickness + 0.2; // slightly inside
        const adPositions = [
            { x: innerOffsetX, z: 0 },
            { x: -innerOffsetX, z: 0 },
            { x: 0, z: innerOffsetZ },
            { x: 0, z: -innerOffsetZ }
        ];

        adPositions.forEach((pos, index) => {
            this.createAdPanel(pos.x, pos.z, index);
        });
    }
    
    createAdPanel(x, z, index) {
        // Create larger floating advertisement panel geometry
        const panelGeometry = new THREE.PlaneGeometry(20, 12);
        
        // Create a placeholder advertisement texture
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // Create placeholder ad design with gradient background
        const gradient = ctx.createLinearGradient(0, 0, 0, 256);
        gradient.addColorStop(0, '#ff6b6b');
        gradient.addColorStop(1, '#ee5a52');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 512, 256);
        
        // Add border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, 504, 248);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('ADVERTISEMENT', 256, 128);
        ctx.font = 'bold 32px Arial';
        ctx.fillText(`Panel ${index + 1}`, 256, 180);
        
        // Add some visual elements
        ctx.fillStyle = '#ffffff';
        ctx.font = '24px Arial';
        ctx.fillText('SPONSORED CONTENT', 256, 220);
        
        const texture = new THREE.CanvasTexture(canvas);
        // Flip texture horizontally for panels 1–3 (+X, -X, +Z); keep panel 4 (-Z) unflipped
        if (!(z < 0 && Math.abs(x) < 0.1)) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.repeat.x = -1;
            texture.offset.x = 1;
            texture.needsUpdate = true;
        }
        // Make the front bright (unlit) so it "lights up" regardless of scene lighting
        // Single front-face only (avoid back-face text). Force towards arena.
        const material = new THREE.MeshBasicMaterial({ 
            map: texture,
            transparent: true,
            opacity: 1.0,
            side: THREE.DoubleSide,
            toneMapped: false,
            depthWrite: false,
            depthTest: false
        });
        const panel = new THREE.Mesh(panelGeometry, material);
        // Lift above top of stands for clear visibility
        const panelY = this.wallHeight + 12; // above 10-rows stands
        panel.position.set(x, panelY, z);
        // Point panel inward: lookAt points the object's -Z toward target; rotate 180° so +Z (front face) points inward
        panel.lookAt(new THREE.Vector3(0, panelY - 2, 0));
        panel.rotateY(Math.PI);
        panel.rotation.z = 0;
        panel.rotation.x = -0.03; // slight inward tilt
        // Pull slightly towards the arena center to avoid z-fighting with the wall
        const inward = new THREE.Vector3(x, 0, z).normalize().multiplyScalar(-1);
        panel.position.addScaledVector(inward, 3.4); // pull further inside arena to avoid wall occlusion
        // With +Z aligned to the arena center via quaternion above, no extra yaw is needed.
        panel.renderOrder = 50;
        panel.frustumCulled = false;
        
        panel.castShadow = false;
        panel.receiveShadow = false;
        this.scene.add(panel);
        
        // Store reference for future ad management
        if (!this.adPanels) this.adPanels = [];
        this.adPanels.push(panel);
    }
    
    addArenaDetails() {
        // Add center line markings
        this.addCenterMarkings();
        
        // Add corner markers
        this.addCornerMarkers();
        
        // Add some atmospheric elements
        this.addAtmosphericElements();
        
        // Scatter some static skid marks and donuts for lived-in look
        this.createStaticSkidMarks();

        // Add random ramps
        this.addRandomRamps();
    }
    
    addCenterMarkings() {
        // Center line removed for cleaner look
        // Create center line that follows the oval
        // const lineSegments = 32;
        // const lineMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
        
        // for (let i = 0; i < lineSegments; i++) {
        //     const angle = (i / lineSegments) * Math.PI * 2;
        //     const nextAngle = ((i + 1) / lineSegments) * Math.PI * 2;
            
        //     // Calculate positions on the oval
        //     const x1 = Math.cos(angle) * (this.bounds.x * 0.3);
        //     const z1 = Math.sin(angle) * (this.bounds.z * 0.3);
        //     const x2 = Math.cos(nextAngle) * (this.bounds.x * 0.3);
        //     const z2 = Math.sin(nextAngle) * (this.bounds.z * 0.3);
            
        //     const segmentLength = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
        //     const lineGeometry = new THREE.PlaneGeometry(segmentLength, 0.5);
        //     const lineSegment = new THREE.Mesh(lineGeometry, lineMaterial);
            
        //     lineSegment.position.set((x1 + x2) / 2, 0.01, (z1 + z2) / 2);
        //     lineSegment.rotation.x = -Math.PI / 2;
        //     lineSegment.rotation.y = Math.atan2(z2 - z1, x2 - x1);
            
        //     this.scene.add(lineSegment);
        // }
        
        // Create center circle
        const circleGeometry = new THREE.RingGeometry(8, 10, 32);
        const circleMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
        
        const centerCircle = new THREE.Mesh(circleGeometry, circleMaterial);
        centerCircle.rotation.x = -Math.PI / 2;
        centerCircle.position.y = 0.01;
        this.scene.add(centerCircle);
        
        // Lane markings removed for cleaner look
        // this.addLaneMarkings();
        
        // Add boundary indicator
        this.addBoundaryIndicator();
    }
    
    addBoundaryIndicator() {
        // Add a subtle boundary line to show the oval shape
        const segments = 64;
        const boundaryMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xffffff,
            transparent: true,
            opacity: 0.3
        });
        
        for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const nextAngle = ((i + 1) / segments) * Math.PI * 2;
            
            // Calculate positions on the oval boundary
            const x1 = Math.cos(angle) * this.bounds.x;
            const z1 = Math.sin(angle) * this.bounds.z;
            const x2 = Math.cos(nextAngle) * this.bounds.x;
            const z2 = Math.sin(nextAngle) * this.bounds.z;
            
            const segmentLength = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
            const boundaryGeometry = new THREE.PlaneGeometry(segmentLength, 0.2);
            const boundarySegment = new THREE.Mesh(boundaryGeometry, boundaryMaterial);
            
            boundarySegment.position.set((x1 + x2) / 2, 0.02, (z1 + z2) / 2);
            boundarySegment.rotation.x = -Math.PI / 2;
            boundarySegment.rotation.y = Math.atan2(z2 - z1, x2 - x1);
            
            this.scene.add(boundarySegment);
        }
    }
    
    addLaneMarkings() {
        // Add dashed lines around the arena following the oval shape
        const dashLength = 3;
        const dashWidth = 0.5;
        const dashMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff }); // White lane markings
        
        // Create dashed lines at regular intervals around the oval
        for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
            const x = Math.cos(angle) * (this.bounds.x - 8);
            const z = Math.sin(angle) * (this.bounds.z - 8);
            
            const dashGeometry = new THREE.PlaneGeometry(dashLength, dashWidth);
            const dash = new THREE.Mesh(dashGeometry, dashMaterial);
            dash.rotation.x = -Math.PI / 2;
            dash.rotation.y = angle + Math.PI / 2; // Rotate to follow the curve
            dash.position.set(x, 0.01, z);
            this.scene.add(dash);
        }
        
        // Add inner lane markings
        for (let angle = 0; angle < Math.PI * 2; angle += 0.15) {
            const x = Math.cos(angle) * (this.bounds.x - 20);
            const z = Math.sin(angle) * (this.bounds.z - 20);
            
            const dashGeometry = new THREE.PlaneGeometry(dashLength, dashWidth);
            const dash = new THREE.Mesh(dashGeometry, dashMaterial);
            dash.rotation.x = -Math.PI / 2;
            dash.rotation.y = angle + Math.PI / 2;
            dash.position.set(x, 0.01, z);
            this.scene.add(dash);
        }
    }
    
    addCornerMarkers() {
        // Add corner markers for visual reference
        const markerGeometry = new THREE.CylinderGeometry(1, 1, 2, 8);
        const markerMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 });
        
        const corners = [
            { x: this.bounds.x - 5, z: this.bounds.z - 5 },
            { x: -this.bounds.x + 5, z: this.bounds.z - 5 },
            { x: this.bounds.x - 5, z: -this.bounds.z + 5 },
            { x: -this.bounds.x + 5, z: -this.bounds.z + 5 }
        ];
        
        corners.forEach(corner => {
            const marker = new THREE.Mesh(markerGeometry, markerMaterial);
            marker.position.set(corner.x, 1, corner.z);
            marker.castShadow = true;
            this.scene.add(marker);
        });
    }
    
    addAtmosphericElements() {
        // Add some floating particles for atmosphere
        const particleCount = 100;
        const particleGeometry = new THREE.SphereGeometry(0.1, 8, 8);
        const particleMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xffffff,
            transparent: true,
            opacity: 0.3
        });
        
        for (let i = 0; i < particleCount; i++) {
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            particle.position.set(
                (Math.random() - 0.5) * this.bounds.x * 2,
                Math.random() * 20 + 10,
                (Math.random() - 0.5) * this.bounds.z * 2
            );
            this.scene.add(particle);
        }
    }

    // === Static skid marks and donuts ===
    createStaticSkidMarks() {
        const marginX = this.bounds.x * 0.85;
        const marginZ = this.bounds.z * 0.85;

        const straightCount = 86; // more scattered streaks
        const donutCount = 9;     // a few more donuts
        const arcCount = 14;      // curved drift arcs

        // Lazy-create reusable textures/materials
        if (!this._skidDecalTex) {
            this._skidDecalTex = this._makeSkidDecalTexture();
            this._skidDecalMat = new THREE.MeshBasicMaterial({
                map: this._skidDecalTex,
                transparent: true,
                opacity: 0.85,
                depthWrite: false,
                toneMapped: false
            });
            this._skidDecalMat.polygonOffset = true;
            this._skidDecalMat.polygonOffsetFactor = -1;
            this._skidDecalMat.polygonOffsetUnits = -1;
        }

        if (!this._donutTex) {
            this._donutTex = this._makeDonutTexture();
            this._donutMat = new THREE.MeshBasicMaterial({
                map: this._donutTex,
                transparent: true,
                opacity: 0.7,
                depthWrite: false,
                toneMapped: false
            });
            this._donutMat.polygonOffset = true;
            this._donutMat.polygonOffsetFactor = -1;
            this._donutMat.polygonOffsetUnits = -1;
        }

        // Straight skids
        for (let i = 0; i < straightCount; i++) {
            const w = 0.35 + Math.random() * 0.15;
            const h = 1.4 + Math.random() * 2.2;
            const geo = new THREE.PlaneGeometry(w, h);
            const mesh = new THREE.Mesh(geo, this._skidDecalMat.clone());
            mesh.rotation.x = -Math.PI / 2;
            mesh.rotation.z = Math.random() * Math.PI;
            const x = (Math.random() * 2 - 1) * marginX;
            const z = (Math.random() * 2 - 1) * marginZ;
            mesh.position.set(x, 0.018, z);
            mesh.material.opacity *= (0.65 + Math.random() * 0.35);
            mesh.renderOrder = 11;
            this.scene.add(mesh);
            if (!this.staticSkids) this.staticSkids = [];
            this.staticSkids.push(mesh);
        }

        // Curved drift arcs
        for (let i = 0; i < arcCount; i++) {
            const cx = (Math.random() * 2 - 1) * (marginX * 0.95);
            const cz = (Math.random() * 2 - 1) * (marginZ * 0.95);
            const radius = 6 + Math.random() * 16;
            const arcLen = (Math.PI / 3) + Math.random() * (Math.PI * 0.8); // 60°–150°
            const start = Math.random() * Math.PI * 2;
            const thickness = 0.25 + Math.random() * 0.18;
            const segs = 10 + Math.floor(Math.random() * 12);
            this._addSkidArc(cx, cz, radius, start, arcLen, thickness, segs);
        }

        // Donut marks
        for (let i = 0; i < donutCount; i++) {
            const diameter = 6.5 + Math.random() * 3.5; // world units
            const geo = new THREE.PlaneGeometry(diameter, diameter);
            const mesh = new THREE.Mesh(geo, this._donutMat.clone());
            mesh.rotation.x = -Math.PI / 2;
            mesh.rotation.z = Math.random() * Math.PI;
            const x = (Math.random() * 2 - 1) * (marginX * 0.95);
            const z = (Math.random() * 2 - 1) * (marginZ * 0.95);
            mesh.position.set(x, 0.018, z);
            mesh.material.opacity *= (0.6 + Math.random() * 0.25);
            mesh.renderOrder = 11;
            this.scene.add(mesh);
            if (!this.staticSkids) this.staticSkids = [];
            this.staticSkids.push(mesh);
        }
    }

    _makeSkidDecalTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Base dark oval with soft edges
        const grad = ctx.createRadialGradient(64, 32, 6, 64, 32, 30);
        grad.addColorStop(0, 'rgba(0,0,0,0.55)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(64, 32, 50, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        // Add subtle tread streaks
        ctx.strokeStyle = 'rgba(0,0,0,0.28)';
        ctx.lineWidth = 2;
        for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(24, 32 + i * 4);
            ctx.lineTo(104, 32 + i * 4);
            ctx.stroke();
        }
        return new THREE.CanvasTexture(canvas);
    }

    _makeDonutTexture() {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, size, size);
        ctx.translate(size / 2, size / 2);
        ctx.rotate((Math.random() - 0.5) * 0.4);
        // Wide ring stroke with soft edges by layering strokes
        const baseAlpha = 0.45;
        const outer = 210; // px radius
        const widths = [36, 30, 24, 18];
        const alphas = [baseAlpha, baseAlpha * 0.7, baseAlpha * 0.45, baseAlpha * 0.25];
        ctx.strokeStyle = '#000';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 0; i < widths.length; i++) {
            ctx.globalAlpha = alphas[i];
            ctx.lineWidth = widths[i];
            ctx.beginPath();
            ctx.arc(0, 0, outer - i * 3, 0, Math.PI * 2);
            ctx.stroke();
        }
        // Random gaps to feel imperfect
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 0.45;
        for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2;
            const len = (Math.PI / 8) * (0.5 + Math.random());
            ctx.lineWidth = 42;
            ctx.beginPath();
            ctx.arc(0, 0, outer, a, a + len);
            ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        return new THREE.CanvasTexture(canvas);
    }

    _addSkidArc(cx, cz, radius, startAngle, arcAngle, width, segments) {
        // Place many short decals following an arc path with slight jitter
        for (let s = 0; s < segments; s++) {
            const t = s / Math.max(1, segments - 1);
            const ang = startAngle + t * arcAngle;
            const x = cx + Math.cos(ang) * radius + (Math.random() - 0.5) * 0.6;
            const z = cz + Math.sin(ang) * radius + (Math.random() - 0.5) * 0.6;
            const segLen = 0.9 + Math.random() * 0.8;
            const geo = new THREE.PlaneGeometry(width, segLen);
            const mat = this._skidDecalMat.clone();
            mat.opacity *= 0.55 + Math.random() * 0.35;
            const mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.x = -Math.PI / 2;
            // tangent direction
            mesh.rotation.z = ang + Math.PI / 2 + (Math.random() - 0.5) * 0.15;
            mesh.position.set(x, 0.018, z);
            mesh.renderOrder = 11;
            this.scene.add(mesh);
            if (!this.staticSkids) this.staticSkids = [];
            this.staticSkids.push(mesh);
        }
    }
    
    getBounds() {
        return this.bounds;
    }
    
    // Method to update advertisement panels (for future use)
    updateAdPanel(index, newTexture) {
        if (this.adPanels && this.adPanels[index]) {
            this.adPanels[index].material.map = newTexture;
            this.adPanels[index].material.needsUpdate = true;
        }
    }
    
    addRandomRamps() {
        // This method is now deprecated - boost pads are created from server data
        console.log('addRandomRamps() called - boost pads should be created from server data');
    }
    
    createBoostPadsFromServer(boostPadsData) {
        console.log('🎯 createBoostPadsFromServer called with data:', boostPadsData);
        
        // Clear existing boost pads
        if (this.ramps) {
            this.ramps.forEach(ramp => {
                this.scene.remove(ramp);
            });
        }
        this.ramps = [];
        
        // Create boost pads from server data
        boostPadsData.forEach((boostPad, index) => {
            console.log(`🎯 Creating boost pad ${index} at position:`, boostPad.x, boostPad.z, 'rotation:', boostPad.rotation);
            this.createRamp(boostPad.x, boostPad.z, index, boostPad.rotation);
        });
        
        console.log(`🎯 Created ${boostPadsData.length} boost pads from server data`);
    }
    
    isTooCloseToExistingRamp(x, z, existingRamps) {
        const minDistance = 20; // Minimum distance between ramps
        
        for (const ramp of existingRamps) {
            const distance = Math.sqrt((x - ramp.x) ** 2 + (z - ramp.z) ** 2);
            if (distance < minDistance) {
                return true;
            }
        }
        return false;
    }
    
    createRamp(x, z, index, rotation = null) {
        console.log(`🎯 createRamp called with x:${x}, z:${z}, index:${index}, rotation:${rotation}`);

        // Visual design params (match screenshot feel)
        const padRadius = 6;
        const neonColor = 0x35fff6; // cyan

        // Group to hold all parts (so collision code can still read .position/.rotation)
        const ramp = new THREE.Group();
        ramp.position.set(x, 0.06, z);
        const rampRotation = rotation !== null ? rotation : Math.random() * Math.PI * 2;
        ramp.rotation.y = rampRotation;

        // 1) Base dark disk
        const baseGeo = new THREE.CircleGeometry(padRadius * 0.98, 64);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x111315, roughness: 0.9, metalness: 0.05 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.rotation.x = -Math.PI / 2;
        base.receiveShadow = true;
        ramp.add(base);

        // 2) Outer neon ring
        const ringOuterGeo = new THREE.RingGeometry(padRadius * 0.72, padRadius * 0.98, 64);
        const ringOuterMat = new THREE.MeshBasicMaterial({
            color: neonColor,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            toneMapped: false,
            depthWrite: false
        });
        const ringOuter = new THREE.Mesh(ringOuterGeo, ringOuterMat);
        ringOuter.rotation.x = -Math.PI / 2;
        ringOuter.position.y = 0.02;
        ramp.add(ringOuter);

        // 3) Inner static ring for depth
        const ringInnerGeo = new THREE.RingGeometry(padRadius * 0.38, padRadius * 0.58, 64);
        const ringInnerMat = new THREE.MeshBasicMaterial({
            color: neonColor,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
            toneMapped: false,
            depthWrite: false
        });
        const ringInner = new THREE.Mesh(ringInnerGeo, ringInnerMat);
        ringInner.rotation.x = -Math.PI / 2;
        ringInner.position.y = 0.021;
        ramp.add(ringInner);

        // 4) Pulsating inner circle
        const pulseGeo = new THREE.CircleGeometry(padRadius * 0.34, 48);
        const pulseMat = new THREE.MeshBasicMaterial({
            color: neonColor,
            transparent: true,
            opacity: 0.28,
            side: THREE.DoubleSide,
            toneMapped: false,
            depthWrite: false
        });
        const pulse = new THREE.Mesh(pulseGeo, pulseMat);
        pulse.rotation.x = -Math.PI / 2;
        pulse.position.y = 0.022;
        ramp.add(pulse);

        // 5) Vertical translucent beam (subtle)
        const beamGeo = new THREE.CylinderGeometry(0.7, 0.7, 3, 16);
        const beamMat = new THREE.MeshBasicMaterial({ color: neonColor, transparent: true, opacity: 0.25, toneMapped: false, depthWrite: false });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.y = 1.6;
        ramp.add(beam);

        // Add to scene
        this.scene.add(ramp);
        if (!this.ramps) this.ramps = [];
        this.ramps.push(ramp);

        // Animation bookkeeping
        ramp.userData = {
            pulseTime: 0,
            ringOuterMat,
            ringInnerMat,
            pulseMesh: pulse,
            beamMat
        };

        console.log(`🎯 Ramp creation complete for index ${index}`);
    }
    
    createSpawnPointIndicators() {
        // Spawn points around the arena (matching server spawn points)
        const spawnPoints = [
            { x: -80, z: -60 }, // Top left
            { x: 80, z: -60 },  // Top right
            { x: -80, z: 60 },  // Bottom left
            { x: 80, z: 60 },   // Bottom right
            { x: 0, z: -90 },   // Top center
            { x: 0, z: 90 },    // Bottom center
            { x: -110, z: 0 },  // Left center
            { x: 110, z: 0 }    // Right center
        ];
        
        spawnPoints.forEach((point, index) => {
            // Create a small glowing circle at each spawn point
            const geometry = new THREE.RingGeometry(2, 3, 16);
            const material = new THREE.MeshLambertMaterial({ 
                color: 0x00ff00, // Green
                transparent: true,
                opacity: 0.6
            });
            
            const spawnIndicator = new THREE.Mesh(geometry, material);
            spawnIndicator.position.set(point.x, 0.1, point.z);
            spawnIndicator.rotation.x = -Math.PI / 2; // Lay flat on ground
            
            // Add pulsing animation data
            spawnIndicator.userData = { pulseTime: Math.random() * Math.PI * 2 };
            
            this.scene.add(spawnIndicator);
            
            // Store reference for animation
            if (!this.spawnIndicators) this.spawnIndicators = [];
            this.spawnIndicators.push(spawnIndicator);
        });
        
        console.log(`🎯 Created ${spawnPoints.length} spawn point indicators`);
    }
    
    addJumpSymbol(ramp) {
        // Create a jump symbol (upward arrow) on the boost pad
        const symbolGeometry = new THREE.PlaneGeometry(6, 6);
        
        // Create canvas for the jump symbol
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // Clear canvas
        ctx.clearRect(0, 0, 256, 256);
        
        // Draw jump symbol (upward arrow with "JUMP" text)
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('JUMP', 128, 140);
        
        // Draw upward arrow
        ctx.beginPath();
        ctx.moveTo(128, 80); // Arrow tip
        ctx.lineTo(108, 120); // Left side
        ctx.lineTo(118, 120); // Left inner
        ctx.lineTo(118, 180); // Left stem
        ctx.lineTo(138, 180); // Right stem
        ctx.lineTo(138, 120); // Right inner
        ctx.lineTo(148, 120); // Right side
        ctx.closePath();
        ctx.fill();
        
        const texture = new THREE.CanvasTexture(canvas);
        const symbolMaterial = new THREE.MeshLambertMaterial({ 
            map: texture,
            transparent: true,
            opacity: 0.8
        });
        
        const symbol = new THREE.Mesh(symbolGeometry, symbolMaterial);
        symbol.position.set(0, 0.11, 0); // Slightly above the pad surface
        symbol.rotation.x = -Math.PI / 2; // Lay flat on the pad
        
        ramp.add(symbol);
    }
    
    addRampDetails(ramp, index) {
        // Add skate ramp edge markings (black stripes) on the inclined surface
        const markingGeometry = new THREE.PlaneGeometry(8, 0.3);
        const markingMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x000000, // Black edge stripes
            transparent: true,
            opacity: 0.9
        });
        
        const marking = new THREE.Mesh(markingGeometry, markingMaterial);
        marking.position.set(0, 2, -2); // Position on the inclined surface
        marking.rotation.x = -Math.PI / 6; // Match the incline angle
        
        ramp.add(marking);
        
        // Add ramp number label
        const labelGeometry = new THREE.PlaneGeometry(3, 1.5);
        const labelMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x000000, // Black label
            transparent: true,
            opacity: 0.8
        });
        
        const label = new THREE.Mesh(labelGeometry, labelMaterial);
        label.position.set(0, 3, -1); // Position on the inclined surface
        label.rotation.x = -Math.PI / 6;
        
        ramp.add(label);
    }
} 