const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'chat.db');
const db = new sqlite3.Database(dbPath);

// Initialize Database Schema
db.serialize(() => {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_color TEXT DEFAULT '#6366f1',
      status TEXT DEFAULT 'offline',
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Rooms table
  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Messages table
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      recipient_type TEXT NOT NULL, -- 'room' or 'user'
      target_id TEXT NOT NULL,      -- room name or recipient user_id
      content TEXT,
      attachment TEXT,              -- JSON string
      reactions TEXT DEFAULT '{}',  -- JSON string
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users(id)
    )
  `);

  // Seed default public rooms
  const defaultRooms = [
    { name: 'general', description: 'General conversation for everyone' },
    { name: 'tech-lounge', description: 'Discuss programming, hardware, and AI' },
    { name: 'gaming', description: 'Share gaming clips, news, and setup details' },
    { name: 'random', description: 'Casual banter and fun memes' }
  ];

  const stmt = db.prepare(`INSERT OR IGNORE INTO rooms (name, description) VALUES (?, ?)`);
  defaultRooms.forEach(room => {
    stmt.run(room.name, room.description);
  });
  stmt.finalize();
});

// Database Helper Functions using Promises
const dbHelper = {
  // User Management
  createUser: (username, password, displayName, avatarColor) => {
    return new Promise((resolve, reject) => {
      const hashedPassword = bcrypt.hashSync(password, 10);
      const sql = `INSERT INTO users (username, password, display_name, avatar_color) VALUES (?, ?, ?, ?)`;
      db.run(sql, [username.toLowerCase(), hashedPassword, displayName, avatarColor || '#6366f1'], function(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, username, displayName, avatarColor: avatarColor || '#6366f1' });
      });
    });
  },

  findUserByUsername: (username) => {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM users WHERE username = ?`;
      db.get(sql, [username.toLowerCase()], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  },

  findUserById: (id) => {
    return new Promise((resolve, reject) => {
      const sql = `SELECT id, username, display_name, avatar_color, status, last_seen FROM users WHERE id = ?`;
      db.get(sql, [id], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  },

  getAllUsers: () => {
    return new Promise((resolve, reject) => {
      const sql = `SELECT id, username, display_name, avatar_color, status, last_seen FROM users ORDER BY username ASC`;
      db.all(sql, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  },

  updateUserStatus: (userId, status) => {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE users SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?`;
      db.run(sql, [status, userId], (err) => {
        if (err) return reject(err);
        resolve(true);
      });
    });
  },

  deleteUser: (userId) => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run(`DELETE FROM messages WHERE sender_id = ? OR (recipient_type = 'user' AND target_id = ?)`, [userId, String(userId)]);
        db.run(`DELETE FROM users WHERE id = ?`, [userId], (err) => {
          if (err) return reject(err);
          resolve(true);
        });
      });
    });
  },

  // Rooms Management
  getAllRooms: () => {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM rooms ORDER BY name ASC`;
      db.all(sql, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  },

  createRoom: (name, description, createdBy) => {
    return new Promise((resolve, reject) => {
      const cleanName = name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
      const sql = `INSERT INTO rooms (name, description, created_by) VALUES (?, ?, ?)`;
      db.run(sql, [cleanName, description || '', createdBy], function(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, name: cleanName, description, createdBy });
      });
    });
  },

  // Message Management
  saveMessage: (senderId, recipientType, targetId, content, attachment = null) => {
    return new Promise((resolve, reject) => {
      const attachmentJson = attachment ? JSON.stringify(attachment) : null;
      const sql = `INSERT INTO messages (sender_id, recipient_type, target_id, content, attachment) VALUES (?, ?, ?, ?, ?)`;
      db.run(sql, [senderId, recipientType, String(targetId), content, attachmentJson], function(err) {
        if (err) return reject(err);
        const msgId = this.lastID;
        // Fetch saved message with user details
        const fetchSql = `
          SELECT m.*, u.username as sender_username, u.display_name as sender_display_name, u.avatar_color as sender_avatar
          FROM messages m
          JOIN users u ON m.sender_id = u.id
          WHERE m.id = ?
        `;
        db.get(fetchSql, [msgId], (fetchErr, msgRow) => {
          if (fetchErr) return reject(fetchErr);
          if (msgRow.attachment) {
            try { msgRow.attachment = JSON.parse(msgRow.attachment); } catch (e) {}
          }
          if (msgRow.reactions) {
            try { msgRow.reactions = JSON.parse(msgRow.reactions); } catch (e) { msgRow.reactions = {}; }
          }
          resolve(msgRow);
        });
      });
    });
  },

  getRoomMessages: (roomName, limit = 50) => {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT m.*, u.username as sender_username, u.display_name as sender_display_name, u.avatar_color as sender_avatar
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.recipient_type = 'room' AND m.target_id = ?
        ORDER BY m.timestamp ASC
        LIMIT ?
      `;
      db.all(sql, [roomName, limit], (err, rows) => {
        if (err) return reject(err);
        rows.forEach(r => {
          if (r.attachment) {
            try { r.attachment = JSON.parse(r.attachment); } catch (e) {}
          }
          if (r.reactions) {
            try { r.reactions = JSON.parse(r.reactions); } catch (e) { r.reactions = {}; }
          } else {
            r.reactions = {};
          }
        });
        resolve(rows);
      });
    });
  },

  getDirectMessages: (userId1, userId2, limit = 50) => {
    return new Promise((resolve, reject) => {
      const u1 = String(userId1);
      const u2 = String(userId2);
      const sql = `
        SELECT m.*, u.username as sender_username, u.display_name as sender_display_name, u.avatar_color as sender_avatar
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.recipient_type = 'user' AND 
              ((m.sender_id = ? AND m.target_id = ?) OR (m.sender_id = ? AND m.target_id = ?))
        ORDER BY m.timestamp ASC
        LIMIT ?
      `;
      db.all(sql, [u1, u2, u2, u1, limit], (err, rows) => {
        if (err) return reject(err);
        rows.forEach(r => {
          if (r.attachment) {
            try { r.attachment = JSON.parse(r.attachment); } catch (e) {}
          }
          if (r.reactions) {
            try { r.reactions = JSON.parse(r.reactions); } catch (e) { r.reactions = {}; }
          } else {
            r.reactions = {};
          }
        });
        resolve(rows);
      });
    });
  },

  toggleReaction: (messageId, userId, emoji) => {
    return new Promise((resolve, reject) => {
      db.get(`SELECT reactions FROM messages WHERE id = ?`, [messageId], (err, row) => {
        if (err || !row) return reject(err || new Error('Message not found'));
        let reactions = {};
        try {
          reactions = JSON.parse(row.reactions || '{}');
        } catch (e) {}

        if (!reactions[emoji]) reactions[emoji] = [];
        const index = reactions[emoji].indexOf(userId);
        if (index > -1) {
          reactions[emoji].splice(index, 1);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji].push(userId);
        }

        const jsonStr = JSON.stringify(reactions);
        db.run(`UPDATE messages SET reactions = ? WHERE id = ?`, [jsonStr, messageId], (updateErr) => {
          if (updateErr) return reject(updateErr);
          resolve({ messageId, reactions });
        });
      });
    });
  }
};

module.exports = dbHelper;
