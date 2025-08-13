export class InputManager {
    constructor() {
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            boost: false
        };
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Keyboard event listeners
        document.addEventListener('keydown', (event) => {
            // If user is typing in a text field (e.g., chat), ignore game input
            if (this._isTyping()) return;
            this.handleKeyDown(event);
        });
        
        document.addEventListener('keyup', (event) => {
            if (this._isTyping()) return;
            this.handleKeyUp(event);
        });
        
        // Prevent default behavior for game keys
        document.addEventListener('keydown', (event) => {
            if (this.isGameKey(event.code) && !this._isTyping()) {
                event.preventDefault();
            }
        });
        
        // Handle window focus/blur to reset keys
        window.addEventListener('blur', () => {
            this.resetKeys();
        });
        
        window.addEventListener('focus', () => {
            this.resetKeys();
        });
    }

    _isTyping() {
        const el = document.activeElement;
        if (!el) return false;
        const tag = (el.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
        if (el.isContentEditable) return true;
        return false;
    }
    
    handleKeyDown(event) {
        switch (event.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.keys.forward = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.backward = true;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.left = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.right = true;
                break;
            case 'Space':
                this.keys.boost = true;
                break;
        }
    }
    
    handleKeyUp(event) {
        switch (event.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.keys.forward = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.backward = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.left = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.right = false;
                break;
            case 'Space':
                this.keys.boost = false;
                break;
        }
    }
    
    isGameKey(keyCode) {
        const gameKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        return gameKeys.includes(keyCode);
    }
    
    resetKeys() {
        // Reset all keys to false
        Object.keys(this.keys).forEach(key => {
            this.keys[key] = false;
        });
    }
    
    // Method to check if any movement key is pressed
    isMoving() {
        return this.keys.forward || this.keys.backward || this.keys.left || this.keys.right;
    }
    
    // Method to get movement direction as a normalized vector
    getMovementDirection() {
        const direction = { x: 0, z: 0 };
        
        if (this.keys.forward) direction.z -= 1;
        if (this.keys.backward) direction.z += 1;
        if (this.keys.left) direction.x -= 1;
        if (this.keys.right) direction.x += 1;
        
        // Normalize the direction vector
        const length = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
        if (length > 0) {
            direction.x /= length;
            direction.z /= length;
        }
        
        return direction;
    }
    
    // Method to get input as a string for debugging
    getInputString() {
        const inputs = [];
        if (this.keys.forward) inputs.push('W');
        if (this.keys.backward) inputs.push('S');
        if (this.keys.left) inputs.push('A');
        if (this.keys.right) inputs.push('D');
        if (this.keys.boost) inputs.push('SPACE');
        
        return inputs.join('+') || 'NONE';
    }
} 