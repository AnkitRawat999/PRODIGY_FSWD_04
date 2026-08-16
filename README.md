# Task 4 - Real-Time WebSocket Chat Application (PulseChat)

A full-stack, feature-rich real-time messaging application built with **Node.js**, **Express**, **WebSocket (`ws`)**, **SQLite**, and modern **Glassmorphic UI**.

---

## 🌟 Key Features

1. **User Authentication & Accounts**:
   - Secure Sign Up & Log In with `bcryptjs` password hashing and JWT authorization.
   - Customizable user profiles (Display Name & Avatar Accent Color).

2. **Real-Time Communication (WebSockets)**:
   - Powered by standard WebSockets (`ws`) for bidirectional instant message exchange.
   - Real-time online / offline / away user presence tracking.
   - Real-time "is typing..." indicators across rooms and direct messages.

3. **Rooms & Private Direct Messaging**:
   - Pre-loaded public channels (`#general`, `#tech-lounge`, `#gaming`, `#random`).
   - Create custom channels dynamically.
   - Initiate 1-on-1 private direct message threads with any user.

4. **Chat History & Persistence**:
   - SQLite persistent database (`chat.db`) stores user accounts, channels, and full message logs.
   - Automatically loads message history when entering a chat.

5. **Multimedia File Sharing & Voice Notes**:
   - Drag-and-drop or attachment file selector for images, video, audio clips, and documents.
   - Built-in Voice Recorder: Record voice clips directly in the chat input bar using the browser `MediaRecorder` API and send them as voice notes.
   - Lightbox image gallery preview.

6. **Interactive Reactions & Notifications**:
   - Interactive emoji reactions (`👍`, `❤️`, `😂`, `🔥`, `🎉`, `🚀`).
   - Web Audio API synthesized notification chimes for incoming messages.
   - Unread message counters and HTML5 Browser Desktop notifications.

---

## 📁 Directory Structure

```
c:\Users\rawat\OneDrive\Desktop\ankit\task4\
├── package.json         # Node.js project manifest & scripts
├── server.js            # Express HTTP server & WebSocket engine
├── db.js                # SQLite database manager & queries
├── chat.db              # Auto-generated SQLite database
├── uploads/             # Directory for uploaded files & voice notes
├── public/              # Client Single Page Application (SPA)
│   ├── index.html       # Web application UI
│   ├── css/
│   │   └── style.css    # Modern glassmorphism design system
│   └── js/
│       ├── socket.js    # Client-side WebSocket wrapper & auto-reconnect
│       ├── audio.js     # Web Audio synth chimes & voice note recorder
│       └── app.js       # SPA state, UI events & message handler
└── README.md            # Setup instructions
```

---

## 🚀 How to Run

1. Open your terminal in the `task4` directory:
   ```bash
   cd c:\Users\rawat\OneDrive\Desktop\ankit\task4
   ```

2. Install dependencies (if not already installed):
   ```bash
   cmd /c npm install
   ```

3. Start the application server:
   ```bash
   cmd /c npm start
   ```

4. Open your browser and navigate to:
   [http://localhost:3000](http://localhost:3000)

5. **Test Multi-user Real-Time Chat**:
   - Open a second browser window or Incognito tab.
   - Register a second user account (e.g. `user_two`).
   - Test instant room chat, direct messaging, voice note recording, file sharing, typing indicators, and emoji reactions!
