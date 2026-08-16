const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const db = require('./db');

const JWT_SECRET = 'task4_websocket_super_secret_key_2026';
const PORT = process.env.PORT || 3000;

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer Storage Configuration for File Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB file limit
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// Auth Middleware for Express
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// REST API Endpoints
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, displayName, avatarColor } = req.body;
    if (!username || !password || !displayName) {
      return res.status(400).json({ error: 'Username, password, and display name are required' });
    }
    const existing = await db.findUserByUsername(username);
    if (existing) {
      return res.status(400).json({ error: 'Username is already taken' });
    }
    const newUser = await db.createUser(username, password, displayName, avatarColor);
    const token = jwt.sign({ id: newUser.id, username: newUser.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: newUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const user = await db.findUserByUsername(username);
    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }
    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    const userPayload = {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      avatarColor: user.avatar_color,
      status: user.status
    };
    res.json({ token, user: userPayload });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const users = await db.getAllUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    if (String(targetUserId) === String(req.user.id)) {
      return res.status(400).json({ error: 'Cannot delete your own account while logged in' });
    }
    await db.deleteUser(targetUserId);
    broadcastToAll({ type: 'user_deleted', userId: targetUserId });
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/rooms', authenticateToken, async (req, res) => {
  try {
    const rooms = await db.getAllRooms();
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rooms', authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Room name required' });
    const newRoom = await db.createRoom(name, description, req.user.id);
    broadcastToAll({ type: 'room_created', room: newRoom });
    res.json(newRoom);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not create room' });
  }
});

app.get('/api/messages/room/:roomName', authenticateToken, async (req, res) => {
  try {
    const messages = await db.getRoomMessages(req.params.roomName);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages/user/:userId', authenticateToken, async (req, res) => {
  try {
    const messages = await db.getDirectMessages(req.user.id, req.params.userId);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// File Upload Endpoint
app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({
    url: fileUrl,
    filename: req.file.originalname,
    filetype: req.file.mimetype,
    filesize: req.file.size
  });
});

// Create HTTP Server & WebSocket Server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Connections Map: userId -> Set of WS client objects
const connectedClients = new Map();
// Room subscriptions: roomName -> Set of WS client objects
const roomSubscriptions = new Map();

function broadcastToAll(data) {
  const json = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  });
}

function broadcastToRoom(roomName, data, senderWs = null) {
  const subscribers = roomSubscriptions.get(roomName);
  if (!subscribers) return;
  const json = JSON.stringify(data);
  subscribers.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client !== senderWs) {
      client.send(json);
    }
  });
}

function sendToUser(userId, data) {
  const userSockets = connectedClients.get(Number(userId));
  if (!userSockets) return;
  const json = JSON.stringify(data);
  userSockets.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  });
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.user = null;
  ws.currentRoom = null;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', async (message) => {
    try {
      const payload = JSON.parse(message);
      const { type, data } = payload;

      // Handle Authentication on WebSocket
      if (type === 'auth') {
        const { token } = data;
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          const userDetails = await db.findUserById(decoded.id);
          if (!userDetails) return ws.send(JSON.stringify({ type: 'error', data: 'User not found' }));

          ws.user = userDetails;
          
          // Track connected clients
          if (!connectedClients.has(userDetails.id)) {
            connectedClients.set(userDetails.id, new Set());
          }
          connectedClients.get(userDetails.id).add(ws);

          // Default auto-subscribe to 'general' room on connection
          ws.currentRoom = 'general';
          if (!roomSubscriptions.has('general')) {
            roomSubscriptions.set('general', new Set());
          }
          roomSubscriptions.get('general').add(ws);

          // Update online status in DB
          await db.updateUserStatus(userDetails.id, 'online');

          ws.send(JSON.stringify({ type: 'authenticated', data: userDetails }));

          // Broadcast user online status
          broadcastToAll({
            type: 'user_status_changed',
            data: { userId: userDetails.id, username: userDetails.username, status: 'online' }
          });
        } catch (e) {
          ws.send(JSON.stringify({ type: 'error', data: 'Invalid authentication token' }));
        }
        return;
      }

      // Guard check: User must be authenticated for subsequent events
      if (!ws.user) {
        return ws.send(JSON.stringify({ type: 'error', data: 'Unauthorized WebSocket request' }));
      }

      // Event: Join Room
      if (type === 'join_room') {
        const { roomName } = data;
        if (ws.currentRoom) {
          // Leave old room subscription
          const oldSubs = roomSubscriptions.get(ws.currentRoom);
          if (oldSubs) oldSubs.delete(ws);
        }
        ws.currentRoom = roomName;
        if (!roomSubscriptions.has(roomName)) {
          roomSubscriptions.set(roomName, new Set());
        }
        roomSubscriptions.get(roomName).add(ws);

        const history = await db.getRoomMessages(roomName);
        ws.send(JSON.stringify({
          type: 'room_joined',
          data: { roomName, history }
        }));
        return;
      }

      // Event: Leave Room
      if (type === 'leave_room') {
        if (ws.currentRoom) {
          const subs = roomSubscriptions.get(ws.currentRoom);
          if (subs) subs.delete(ws);
          ws.currentRoom = null;
        }
        return;
      }

      // Event: Send Message (Room or Direct Message)
      if (type === 'send_message') {
        const { recipientType, targetId, content, attachment } = data;
        if (!content && !attachment) return;

        const savedMsg = await db.saveMessage(ws.user.id, recipientType, targetId, content, attachment);

        if (recipientType === 'room') {
          // Send to everyone subscribed to room (including sender on other devices)
          const subs = roomSubscriptions.get(targetId);
          if (subs) {
            const jsonStr = JSON.stringify({ type: 'new_message', data: savedMsg });
            subs.forEach(client => {
              if (client.readyState === WebSocket.OPEN) client.send(jsonStr);
            });
          }
        } else if (recipientType === 'user') {
          // Direct Message: Send to target user AND sender's sockets
          sendToUser(targetId, { type: 'new_message', data: savedMsg });
          if (String(ws.user.id) !== String(targetId)) {
            sendToUser(ws.user.id, { type: 'new_message', data: savedMsg });
          }
        }
        return;
      }

      // Event: Typing Indicator
      if (type === 'typing') {
        const { recipientType, targetId, isTyping } = data;
        const payloadData = {
          type: 'typing_status',
          data: {
            userId: ws.user.id,
            username: ws.user.username,
            displayName: ws.user.display_name,
            recipientType,
            targetId,
            isTyping
          }
        };

        if (recipientType === 'room') {
          broadcastToRoom(targetId, payloadData, ws);
        } else if (recipientType === 'user') {
          sendToUser(targetId, payloadData);
        }
        return;
      }

      // Event: Toggle Emoji Reaction
      if (type === 'toggle_reaction') {
        const { messageId, emoji, recipientType, targetId } = data;
        const updated = await db.toggleReaction(messageId, ws.user.id, emoji);
        const payloadData = {
          type: 'reaction_updated',
          data: { messageId, reactions: updated.reactions, recipientType, targetId }
        };

        if (recipientType === 'room') {
          const subs = roomSubscriptions.get(targetId);
          if (subs) {
            const jsonStr = JSON.stringify(payloadData);
            subs.forEach(client => {
              if (client.readyState === WebSocket.OPEN) client.send(jsonStr);
            });
          }
        } else if (recipientType === 'user') {
          sendToUser(targetId, payloadData);
          sendToUser(ws.user.id, payloadData);
        }
        return;
      }

      // Event: Presence Status Change (online, away, busy)
      if (type === 'presence_change') {
        const { status } = data;
        await db.updateUserStatus(ws.user.id, status);
        broadcastToAll({
          type: 'user_status_changed',
          data: { userId: ws.user.id, username: ws.user.username, status }
        });
        return;
      }

    } catch (err) {
      console.error('WebSocket error processing message:', err);
    }
  });

  ws.on('close', async () => {
    if (ws.user) {
      const userSockets = connectedClients.get(ws.user.id);
      if (userSockets) {
        userSockets.delete(ws);
        if (userSockets.size === 0) {
          connectedClients.delete(ws.user.id);
          await db.updateUserStatus(ws.user.id, 'offline');
          broadcastToAll({
            type: 'user_status_changed',
            data: { userId: ws.user.id, username: ws.user.username, status: 'offline' }
          });
        }
      }
    }
    if (ws.currentRoom) {
      const subs = roomSubscriptions.get(ws.currentRoom);
      if (subs) subs.delete(ws);
    }
  });
});

// Heartbeat ping interval to clean dead connections
const pingInterval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(pingInterval));

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
