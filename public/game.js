// game.js - Mobile Optimized

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusDiv = document.getElementById('lobby');
const badgeDiv = document.getElementById('badge');
const bannerDiv = document.getElementById('banner');
const thumbSelector = document.getElementById('thumbSelector');
const rematchBtn = document.getElementById('rematch');
const roomInput = document.getElementById('room');
const joinBtn = document.getElementById('join');

let socket = io();
let myRole = null;
let config = { width: 800, height: 500, radius: 30, winPinSeconds: 2 };
let players = [];
let gameOver = false;
let gameStarted = false;
let keys = { up: false, down: false, left: false, right: false, pressing: false };
let glowPulse = 0;

// Thumb images
let myThumb = new Image();
let myThumbFile = 'thumb1.png';
const thumbCache = {};

function getThumbImage(file) {
    if (!file) return null;
    if (!thumbCache[file]) {
        const img = new Image();
        img.src = `/thumbs/${file}`;
        thumbCache[file] = img;
    }
    return thumbCache[file];
}

// Initialize canvas size
function resizeCanvas() {
    const container = canvas.parentElement;
    const containerWidth = container.clientWidth;
    const aspectRatio = config.width / config.height;
    
    if (window.innerWidth <= 768) {
        // Mobile: scale to fit width
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
    } else {
        // Desktop: maintain aspect ratio
        const maxWidth = Math.min(containerWidth, config.width);
        canvas.style.width = maxWidth + 'px';
        canvas.style.height = (maxWidth / aspectRatio) + 'px';
    }
}

// Room management
if (joinBtn) {
    joinBtn.addEventListener('click', () => {
        const roomId = roomInput.value.trim().toUpperCase() || 'TEST';
        window.history.pushState({}, '', `?room=${roomId}`);
        showThumbSelector();
    });
}

if (roomInput) {
    roomInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            joinBtn.click();
        }
    });
    
    // Pre-fill room from URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl) {
        roomInput.value = roomFromUrl.toUpperCase();
    }
}

function showThumbSelector() {
    thumbSelector.style.display = 'flex';
    statusDiv.textContent = 'Select your thumb to join the game.';
}

// Thumb selection
document.querySelectorAll('.thumbOption').forEach(img => {
    img.addEventListener('click', () => {
        myThumbFile = img.dataset.thumb;
        myThumb.src = `/thumbs/${myThumbFile}`;
        thumbSelector.style.display = 'none';
        joinRoom();
    });
});

// Join room
function joinRoom() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = (urlParams.get('room') || roomInput.value || 'TEST').toUpperCase();

    socket.emit('joinRoom', roomId, { thumbFile: myThumbFile }, (res) => {
        if (!res.ok) { 
            alert(res.error || 'Join failed'); 
            showThumbSelector();
            return; 
        }
        
        myRole = res.role;
        config = res.config;
        canvas.width = config.width;
        canvas.height = config.height;
        gameOver = false;
        gameStarted = false;
        
        resizeCanvas();
        statusDiv.textContent = `Room: ${roomId} — Waiting for players...`;
        
        if (badgeDiv) {
            badgeDiv.textContent = `You: ${myRole}`;
            badgeDiv.classList.remove('hide');
        }
        
        loop();
    });
}

// Input handling - Desktop
window.addEventListener('keydown', e => {
    if (gameOver) return;
    
    switch(e.code) {
        case 'ArrowUp': case 'KeyW': keys.up = true; break;
        case 'ArrowDown': case 'KeyS': keys.down = true; break;
        case 'ArrowLeft': case 'KeyA': keys.left = true; break;
        case 'ArrowRight': case 'KeyD': keys.right = true; break;
        case 'Space': keys.pressing = true; e.preventDefault(); break;
    }
    emitInput();
});

window.addEventListener('keyup', e => {
    switch(e.code) {
        case 'ArrowUp': case 'KeyW': keys.up = false; break;
        case 'ArrowDown': case 'KeyS': keys.down = false; break;
        case 'ArrowLeft': case 'KeyA': keys.left = false; break;
        case 'ArrowRight': case 'KeyD': keys.right = false; break;
        case 'Space': keys.pressing = false; e.preventDefault(); break;
    }
    emitInput();
});

function emitInput() {
    if (socket && socket.connected) {
        socket.emit('input', keys);
    }
}

// Socket events
socket.on('lobby', ({ playerCount }) => {
    const maxPlayers = 3;
    if (playerCount < 2) {
        statusDiv.textContent = `Waiting for players… (${playerCount}/${maxPlayers})`;
    } else {
        statusDiv.textContent = `Game on! (${playerCount}/${maxPlayers})`;
        gameStarted = true;
    }
});

socket.on('state', (state) => {
    players = state.players;
});

socket.on('end', ({ winner }) => {
    gameOver = true;
    gameStarted = false;
    
    const message = (winner === myRole) ? 'YOU WIN!' : `Winner: ${winner}`;
    statusDiv.textContent = message;
    
    if (bannerDiv) {
        bannerDiv.textContent = message;
        bannerDiv.classList.remove('hide');
    }
    
    if (rematchBtn) {
        rematchBtn.classList.remove('hide');
    }
});

// Rematch button
if (rematchBtn) {
    rematchBtn.addEventListener('click', () => {
        location.reload();
    });
}

// Drawing functions
function drawThumb(p) {
    const r = config.radius;
    const img = (p.role === myRole) ? myThumb : getThumbImage(p.thumbFile);

    // Glow effect for top thumb
    if (p.z > 0) {
        ctx.save();
        glowPulse += 0.05;
        const glowStrength = 10 + Math.sin(glowPulse) * 5;
        ctx.shadowColor = '#ffff66';
        ctx.shadowBlur = glowStrength;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }

    // Draw thumb image or fallback circle
    if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, p.x - r, p.y - r, r * 2, r * 2);
    } else {
        ctx.fillStyle = (p.role === myRole) ? '#7cc2ff' : '#ff9b9b';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Outline for top thumb
    if (p.z > 0) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffff66';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // Pin progress bar
    if (p.pinTimer > 0) {
        const pct = Math.min(1, p.pinTimer / config.winPinSeconds);
        ctx.fillStyle = '#2ea043';
        ctx.fillRect(p.x - r, p.y + r + 10, 2 * r * pct, 6);
        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x - r, p.y + r + 10, 2 * r, 6);
    }
}

// Main game loop
function loop() {
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all thumbs, sorted by z-index (bottom first)
    if (players.length > 0) {
        players.slice().sort((a, b) => a.z - b.z).forEach(drawThumb);
    }

    // Show instructions
    if (!gameOver && gameStarted) {
        ctx.fillStyle = '#ffd166';
        ctx.font = window.innerWidth <= 768 ? '14px Arial' : '16px Arial';
        ctx.textAlign = 'center';
        const text = window.innerWidth <= 768 ? 
            'Use touch controls to play!' : 
            'Use arrow keys/WASD + Space to raise thumb and pin!';
        ctx.fillText(text, canvas.width / 2, 30);
    }

    requestAnimationFrame(loop);
}

// Window resize handler
window.addEventListener('resize', resizeCanvas);

// Initialize on load
window.addEventListener('load', () => {
    resizeCanvas();
    
    // Auto-join if room in URL and no thumb selector visible
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl && thumbSelector.style.display !== 'flex') {
        showThumbSelector();
    }
});

// Mobile Controls Implementation
(function initMobileControls() {
    const raiseBtn = document.getElementById('raise-btn');
    const joystickBase = document.getElementById('joystick');
    const joystickKnob = document.getElementById('joystick-knob');
    
    if (!raiseBtn || !joystickBase || !joystickKnob) return;
    
    // Raise button handling
    let raisePointerID = null;
    
    function handleRaiseStart(e) {
        e.preventDefault();
        if (raisePointerID !== null) return;
        
        raisePointerID = e.pointerId;
        keys.pressing = true;
        emitInput();
        raiseBtn.style.transform = 'scale(0.95)';
    }
    
    function handleRaiseEnd(e) {
        if (e.pointerId !== raisePointerID) return;
        
        raisePointerID = null;
        keys.pressing = false;
        emitInput();
        raiseBtn.style.transform = '';
    }
    
    raiseBtn.addEventListener('pointerdown', handleRaiseStart);
    raiseBtn.addEventListener('pointerup', handleRaiseEnd);
    raiseBtn.addEventListener('pointercancel', handleRaiseEnd);
    raiseBtn.addEventListener('pointerleave', handleRaiseEnd);
    
    // Joystick handling
    let joystickPointerID = null;
    let joystickActive = false;
    const JOYSTICK_RADIUS = 60; // Half of joystick width
    const KNOB_TRAVEL = 35; // Max distance knob can travel
    
    function resetJoystick() {
        joystickKnob.style.transform = 'translate(0, 0)';
        keys.left = keys.right = keys.up = keys.down = false;
        emitInput();
    }
    
    function updateJoystick(e) {
        const rect = joystickBase.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const deltaX = e.clientX - centerX;
        const deltaY = e.clientY - centerY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        // Clamp to max travel distance
        const clampedDistance = Math.min(distance, KNOB_TRAVEL);
        const angle = Math.atan2(deltaY, deltaX);
        
        const knobX = Math.cos(angle) * clampedDistance;
        const knobY = Math.sin(angle) * clampedDistance;
        
        joystickKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;
        
        // Convert to normalized values [-1, 1]
        const normalX = distance > 0 ? deltaX / distance : 0;
        const normalY = distance > 0 ? deltaY / distance : 0;
        
        // Set key states based on thresholds
        const threshold = 0.3;
        keys.left = normalX < -threshold;
        keys.right = normalX > threshold;
        keys.up = normalY < -threshold;
        keys.down = normalY > threshold;
        
        emitInput();
    }
    
    function handleJoystickStart(e) {
        e.preventDefault();
        if (joystickPointerID !== null) return;
        
        joystickPointerID = e.pointerId;
        joystickActive = true;
        joystickBase.setPointerCapture(e.pointerId);
        updateJoystick(e);
    }
    
    function handleJoystickMove(e) {
        if (!joystickActive || e.pointerId !== joystickPointerID) return;
        updateJoystick(e);
    }
    
    function handleJoystickEnd(e) {
        if (e.pointerId !== joystickPointerID) return;
        
        joystickPointerID = null;
        joystickActive = false;
        resetJoystick();
    }
    
    joystickBase.addEventListener('pointerdown', handleJoystickStart);
    joystickBase.addEventListener('pointermove', handleJoystickMove);
    joystickBase.addEventListener('pointerup', handleJoystickEnd);
    joystickBase.addEventListener('pointercancel', handleJoystickEnd);
    joystickBase.addEventListener('pointerleave', handleJoystickEnd);
    
    // Prevent context menu and text selection on mobile controls
    [raiseBtn, joystickBase].forEach(element => {
        element.addEventListener('contextmenu', e => e.preventDefault());
        element.addEventListener('selectstart', e => e.preventDefault());
    });
    
})();

// Prevent zoom on double tap (mobile Safari)
document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) {
        e.preventDefault();
    }
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
}, { passive: false });