// server.js
const path = require('path');
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(http, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

function createRoomIfNeeded(roomId) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            players: {},
            width: 800,
            height: 500,
            radius: 30,
            winPinSeconds: 2.0,
            winner: null,
        });
    }
}

function assignRole(room) {
    const roles = Object.values(room.players).map(p => p.role);
    if (!roles.includes('P1')) return 'P1';
    if (!roles.includes('P2')) return 'P2';
    if (!roles.includes('P3')) return 'P3';
    return null;
}

io.on('connection', (socket) => {
    let roomId = null;

    socket.on('joinRoom', (rid, data, ack) => {
        roomId = String(rid || '').trim().toUpperCase();
        if (!roomId || roomId.length > 12) return ack && ack({ ok: false, error: 'Invalid room id' });

        createRoomIfNeeded(roomId);
        const room = rooms.get(roomId);
        const role = assignRole(room);
        if (!role) return ack && ack({ ok: false, error: 'Room is full' });

        const spawnPositions = {
            P1: { x: room.width * 0.2, y: room.height * 0.5 },
            P2: { x: room.width * 0.5, y: room.height * 0.5 },
            P3: { x: room.width * 0.8, y: room.height * 0.5 },
        };
        const spawn = spawnPositions[role];
        const thumbFile = (data && data.thumbFile) || 'thumb1.png';

        room.players[socket.id] = {
            id: socket.id,
            role,
            x: spawn.x,
            y: spawn.y,
            vx: 0,
            vy: 0,
            pressing: false,
            pinTimer: 0,
            thumbFile,
            z: 0
        };

        socket.join(roomId);
        ack && ack({
            ok: true,
            role,
            config: {
                width: room.width,
                height: room.height,
                radius: room.radius,
                winPinSeconds: room.winPinSeconds
            }
        });

        const playerCount = Object.keys(room.players).length;
        io.to(roomId).emit('lobby', { playerCount });

        if (playerCount >= 2 && !room.interval) {
            room.winner = null;
            room.interval = setInterval(() => tickRoom(roomId), 1000 / 60);
        }
    });

    socket.on('input', (data) => {
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (!room) return;
        const me = room.players[socket.id];
        if (!me || room.winner) return;

        const speed = 3.2;
        me.vx = (data.right ? 1 : 0) - (data.left ? 1 : 0);
        me.vy = (data.down ? 1 : 0) - (data.up ? 1 : 0);
        const mag = Math.hypot(me.vx, me.vy) || 1;
        me.vx = (me.vx / mag) * speed;
        me.vy = (me.vy / mag) * speed;

        me.pressing = !!data.pressing;

        // z-index logic: pressing (raising thumb) puts you on top
        if (me.pressing) {
            me.z = 1;
            for (const pid of Object.keys(room.players)) {
                if (pid !== socket.id) room.players[pid].z = 0;
            }
        } else me.z = 0;
    });

    socket.on('disconnect', () => {
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (!room) return;
        delete room.players[socket.id];

        const playerCount = Object.keys(room.players).length;
        io.to(roomId).emit('lobby', { playerCount });

        if (playerCount < 2 && room.interval) {
            clearInterval(room.interval);
            room.interval = null;
            room.winner = null;
        }

        if (playerCount === 0) rooms.delete(roomId);
    });
});

// --------------------
// Game loop
// --------------------
function tickRoom(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    const dt = 1 / 60;
    const playersArr = Object.values(room.players);
    if (playersArr.length < 2) return;

    // Move & clamp
    for (const p of playersArr) {
        p.x += p.vx;
        p.y += p.vy;
        p.x = Math.max(room.radius, Math.min(room.width - room.radius, p.x));
        p.y = Math.max(room.radius, Math.min(room.height - room.radius, p.y));
    }

    // Pin logic: only top thumb can pin lower ones
    for (let i = 0; i < playersArr.length; i++) {
        for (let j = i + 1; j < playersArr.length; j++) {
            const a = playersArr[i];
            const b = playersArr[j];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (dist < room.radius * 1.4) {
                if (a.z > b.z && a.pressing) a.pinTimer += dt;
                else a.pinTimer = Math.max(0, a.pinTimer - dt * 0.5);

                if (b.z > a.z && b.pressing) b.pinTimer += dt;
                else b.pinTimer = Math.max(0, b.pinTimer - dt * 0.5);
            } else {
                a.pinTimer = Math.max(0, a.pinTimer - dt * 0.5);
                b.pinTimer = Math.max(0, b.pinTimer - dt * 0.5);
            }
        }
    }

    // Check winner
    const winner = playersArr.find(p => p.pinTimer >= room.winPinSeconds);
    if (winner && !room.winner) {
        room.winner = winner.role;
        io.to(roomId).emit('end', { winner: winner.role });
        clearInterval(room.interval);
        room.interval = null;
    }

    io.to(roomId).emit('state', {
        players: playersArr.map(p => ({
            role: p.role,
            x: p.x,
            y: p.y,
            pressing: p.pressing,
            pinTimer: p.pinTimer,
            thumbFile: p.thumbFile,
            z: p.z
        })),
        winner: room.winner
    });
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Thumb War server (3 players, top-thumb logic) running on http://localhost:${PORT}`));
