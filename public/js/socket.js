// Task 4 WebSocket Connection Manager
class SocketClient {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.token = null;
    this.reconnectTimer = null;
    this.isConnecting = false;
    this.isAuthenticated = false;
    this.messageQueue = [];
  }

  connect(token) {
    if (token) this.token = token;
    if (!this.token) return;

    this.isAuthenticated = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    this.socket = new WebSocket(wsUrl);
    this.isConnecting = true;

    this.socket.onopen = () => {
      console.log('[WebSocket] Connected');
      this.isConnecting = false;
      // Send authentication payload immediately
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'auth', data: { token: this.token } }));
      }
    };

    this.socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { type, data } = payload;

        if (type === 'authenticated') {
          this.isAuthenticated = true;
          this.flushQueue();
        }
        
        if (this.listeners.has(type)) {
          this.listeners.get(type).forEach(callback => callback(data));
        }
      } catch (err) {
        console.error('[WebSocket] Message parsing error:', err);
      }
    };

    this.socket.onclose = () => {
      console.warn('[WebSocket] Connection closed. Attempting reconnect in 3s...');
      this.isConnecting = false;
      this.isAuthenticated = false;
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        if (this.token) this.connect(this.token);
      }, 3000);
    };

    this.socket.onerror = (err) => {
      console.error('[WebSocket] Error:', err);
    };
  }

  on(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(callback);
  }

  off(type, callback) {
    if (!this.listeners.has(type)) return;
    const callbacks = this.listeners.get(type).filter(cb => cb !== callback);
    this.listeners.set(type, callbacks);
  }

  send(type, data = {}) {
    if (type === 'auth') {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type, data }));
      }
      return;
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN && this.isAuthenticated) {
      this.socket.send(JSON.stringify({ type, data }));
    } else {
      console.log('[WebSocket] Socket not ready/authenticated. Queuing event:', type);
      this.messageQueue.push({ type, data });
    }
  }

  flushQueue() {
    if (this.messageQueue.length === 0) return;
    console.log(`[WebSocket] Flushing ${this.messageQueue.length} queued events...`);
    while (this.messageQueue.length > 0 && this.socket && this.socket.readyState === WebSocket.OPEN && this.isAuthenticated) {
      const item = this.messageQueue.shift();
      this.socket.send(JSON.stringify(item));
    }
  }

  disconnect() {
    this.token = null;
    this.isAuthenticated = false;
    this.messageQueue = [];
    clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}

window.socketClient = new SocketClient();

