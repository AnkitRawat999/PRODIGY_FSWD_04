// Task 4 PulseChat Client Controller
let currentUser = null;
let activeChat = { type: 'room', targetId: 'general', title: '# general' };
let rooms = [];
let users = [];
let selectedFile = null;
let typingTimeout = null;
let isTypingActive = false;
let selectedAvatarColor = '#6366f1';
const unreadCounts = {};
const typingMap = new Map();

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('pulsechat_token');
  const userJson = localStorage.getItem('pulsechat_user');
  
  if (token && userJson) {
    try {
      currentUser = JSON.parse(userJson);
      initUserSession(token);
    } catch (e) {
      showAuthModal();
    }
  } else {
    showAuthModal();
  }

  setupSocketListeners();
});

function showAuthModal() {
  document.getElementById('auth-modal').style.display = 'flex';
  document.getElementById('app-container').style.display = 'none';
}

function hideAuthModal() {
  document.getElementById('auth-modal').style.display = 'none';
  document.getElementById('app-container').style.display = 'flex';
}

function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tab-login').classList.toggle('active', isLogin);
  document.getElementById('tab-register').classList.toggle('active', !isLogin);
  document.getElementById('register-fields').style.display = isLogin ? 'none' : 'block';
  document.getElementById('auth-submit-btn').innerText = isLogin ? 'Log In' : 'Sign Up';
  document.getElementById('auth-error').style.display = 'none';
}

function selectAvatarColor(color) {
  selectedAvatarColor = color;
  document.querySelectorAll('.color-option').forEach(el => {
    const elColor = el.getAttribute('data-color');
    el.classList.toggle('selected', elColor === color);
  });
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const isLogin = document.getElementById('tab-login').classList.contains('active');
  const username = document.getElementById('input-username').value.trim();
  const password = document.getElementById('input-password').value;
  const displayName = document.getElementById('input-displayname').value.trim();
  const errorEl = document.getElementById('auth-error');

  errorEl.style.display = 'none';

  const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
  const bodyData = isLogin
    ? { username, password }
    : { username, password, displayName: displayName || username, avatarColor: selectedAvatarColor };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Authentication failed');

    localStorage.setItem('pulsechat_token', data.token);
    localStorage.setItem('pulsechat_user', JSON.stringify(data.user));
    currentUser = data.user;
    initUserSession(data.token);
  } catch (err) {
    errorEl.innerText = err.message;
    errorEl.style.display = 'block';
  }
}

function initUserSession(token) {
  hideAuthModal();
  renderCurrentUserProfile();
  window.socketClient.connect(token);
  loadSidebarData();
}

function logout() {
  localStorage.removeItem('pulsechat_token');
  localStorage.removeItem('pulsechat_user');
  window.socketClient.disconnect();
  location.reload();
}

function renderCurrentUserProfile() {
  if (!currentUser) return;
  const avatarEl = document.getElementById('current-user-avatar');
  avatarEl.style.backgroundColor = currentUser.avatarColor || '#6366f1';
  avatarEl.childNodes[0].nodeValue = (currentUser.displayName || currentUser.username)[0].toUpperCase();
  document.getElementById('current-user-name').innerText = currentUser.displayName || currentUser.username;
  document.getElementById('current-user-handle').innerText = `@${currentUser.username}`;
}

// Fetch Sidebar Data (Rooms & Users)
async function loadSidebarData() {
  const token = localStorage.getItem('pulsechat_token');
  const headers = { 'Authorization': `Bearer ${token}` };

  try {
    const [roomsRes, usersRes] = await Promise.all([
      fetch('/api/rooms', { headers }),
      fetch('/api/users', { headers })
    ]);

    if (roomsRes.ok) rooms = await roomsRes.json();
    if (usersRes.ok) users = await usersRes.json();

    renderRoomsList();
    renderUsersList();

    // Default join 'general' room
    selectChat('room', 'general', '# general');
  } catch (err) {
    console.error('Error loading sidebar data:', err);
  }
}

function renderRoomsList() {
  const container = document.getElementById('rooms-list');
  container.innerHTML = rooms.map(room => {
    const isActive = activeChat.type === 'room' && activeChat.targetId === room.name;
    const unread = unreadCounts[`room_${room.name}`] || 0;
    return `
      <div class="chat-item ${isActive ? 'active' : ''}" onclick="selectChat('room', '${room.name}', '# ${room.name}')">
        <div class="item-info">
          <div class="item-title">
            <span># ${room.name}</span>
            ${unread > 0 ? `<span class="unread-badge">${unread}</span>` : ''}
          </div>
          <div class="item-sub">${room.description || 'Public channel'}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderUsersList() {
  const container = document.getElementById('users-list');
  const otherUsers = users.filter(u => u.id !== currentUser.id);

  container.innerHTML = otherUsers.map(user => {
    const isActive = activeChat.type === 'user' && String(activeChat.targetId) === String(user.id);
    const unread = unreadCounts[`user_${user.id}`] || 0;
    const initial = (user.display_name || user.username)[0].toUpperCase();
    const status = user.status || 'offline';

    return `
      <div class="chat-item ${isActive ? 'active' : ''}" onclick="selectChat('user', ${user.id}, '${user.display_name || user.username}')">
        <div class="avatar" style="background-color: ${user.avatar_color || '#6366f1'};">
          ${initial}
          <span class="status-dot ${status}"></span>
        </div>
        <div class="item-info">
          <div class="item-title">
            <span>${user.display_name || user.username}</span>
            ${unread > 0 ? `<span class="unread-badge">${unread}</span>` : ''}
          </div>
          <div class="item-sub">@${user.username}</div>
        </div>
      </div>
    `;
  }).join('');
}

function filterSidebarItems() {
  const q = document.getElementById('search-input').value.toLowerCase();
  document.querySelectorAll('#rooms-list .chat-item, #users-list .chat-item').forEach(item => {
    const text = item.innerText.toLowerCase();
    item.style.display = text.includes(q) ? 'flex' : 'none';
  });
}

// Select Conversation Channel / User
async function selectChat(type, targetId, title) {
  activeChat = { type, targetId, title };
  unreadCounts[`${type}_${targetId}`] = 0;

  document.getElementById('chat-header-title').innerText = title;
  
  if (type === 'room') {
    document.getElementById('chat-header-sub').innerText = 'Public Channel';
    document.getElementById('chat-header-avatar').style.display = 'none';
    window.socketClient.send('join_room', { roomName: targetId });
  } else {
    const targetUser = users.find(u => String(u.id) === String(targetId));
    if (targetUser) {
      document.getElementById('chat-header-sub').innerText = `@${targetUser.username} • ${targetUser.status || 'offline'}`;
      const headerAvatar = document.getElementById('chat-header-avatar');
      headerAvatar.style.display = 'flex';
      headerAvatar.style.backgroundColor = targetUser.avatar_color || '#6366f1';
      headerAvatar.innerHTML = `${(targetUser.display_name || targetUser.username)[0].toUpperCase()}<span class="status-dot ${targetUser.status || 'offline'}"></span>`;
    }
    loadDirectMessages(targetId);
  }

  renderRoomsList();
  renderUsersList();
  updateTypingBar();
}

async function loadDirectMessages(userId) {
  const token = localStorage.getItem('pulsechat_token');
  try {
    const res = await fetch(`/api/messages/user/${userId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const messages = await res.json();
      renderMessageFeed(messages);
    }
  } catch (err) {
    console.error('Error loading DMs:', err);
  }
}

// WebSocket Server Events Handler Setup
function setupSocketListeners() {
  window.socketClient.on('authenticated', (user) => {
    console.log('[WebSocket] Authenticated as:', user.username);
    if (activeChat && activeChat.type === 'room' && activeChat.targetId) {
      window.socketClient.send('join_room', { roomName: activeChat.targetId });
    }
  });

  window.socketClient.on('room_joined', ({ roomName, history }) => {
    if (activeChat.type === 'room' && activeChat.targetId === roomName) {
      renderMessageFeed(history);
    }
  });

  window.socketClient.on('new_message', (msg) => {
    const isCurrentChat = (msg.recipient_type === activeChat.type) &&
      ((msg.recipient_type === 'room' && msg.target_id === activeChat.targetId) ||
       (msg.recipient_type === 'user' && (String(msg.sender_id) === String(activeChat.targetId) || String(msg.target_id) === String(activeChat.targetId))));

    if (isCurrentChat) {
      appendSingleMessage(msg);
      scrollToBottom();
    } else {
      // Increment unread count for other channel
      const key = `${msg.recipient_type}_${msg.recipient_type === 'room' ? msg.target_id : msg.sender_id}`;
      unreadCounts[key] = (unreadCounts[key] || 0) + 1;
      renderRoomsList();
      renderUsersList();
    }

    // Play notification chime & desktop notification if message is from someone else
    if (String(msg.sender_id) !== String(currentUser.id)) {
      window.audioController.playNotificationSound();
      triggerDesktopNotification(msg);
    }
  });

  window.socketClient.on('typing_status', ({ userId, username, displayName, recipientType, targetId, isTyping }) => {
    const key = `${recipientType}_${targetId}_${userId}`;
    if (isTyping) {
      typingMap.set(key, displayName || username);
    } else {
      typingMap.delete(key);
    }
    updateTypingBar();
  });

  window.socketClient.on('reaction_updated', ({ messageId, reactions }) => {
    updateMessageReactionsInDOM(messageId, reactions);
  });

  window.socketClient.on('user_status_changed', ({ userId, status }) => {
    const u = users.find(x => String(x.id) === String(userId));
    if (u) u.status = status;
    renderUsersList();
    if (activeChat.type === 'user' && String(activeChat.targetId) === String(userId)) {
      document.getElementById('chat-header-sub').innerText = `@${u.username} • ${status}`;
    }
  });

  window.socketClient.on('room_created', (newRoom) => {
    rooms.push(newRoom);
    renderRoomsList();
  });
}

// Render Messages Feed
function renderMessageFeed(messages) {
  const feed = document.getElementById('message-feed');
  if (!messages || messages.length === 0) {
    feed.innerHTML = `
      <div class="empty-chat">
        <i data-feather="message-square"></i>
        <h3>No messages yet</h3>
        <p>Send the first message to start the conversation!</p>
      </div>
    `;
    feather.replace();
    return;
  }

  feed.innerHTML = messages.map(m => formatMessageHTML(m)).join('');
  feather.replace();
  scrollToBottom();
}

function appendSingleMessage(msg) {
  const feed = document.getElementById('message-feed');
  const emptyEl = feed.querySelector('.empty-chat');
  if (emptyEl) feed.innerHTML = '';
  
  const div = document.createElement('div');
  div.innerHTML = formatMessageHTML(msg);
  feed.appendChild(div.firstElementChild);
  feather.replace();
}

function formatMessageHTML(msg) {
  const isSelf = String(msg.sender_id) === String(currentUser.id);
  const initial = (msg.sender_display_name || msg.sender_username || '?')[0].toUpperCase();
  const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const reactions = msg.reactions || {};

  let attachmentHTML = '';
  if (msg.attachment) {
    const att = msg.attachment;
    if (att.filetype && att.filetype.startsWith('image/')) {
      attachmentHTML = `
        <div class="msg-attachment">
          <img src="${att.url}" alt="${att.filename}" onclick="openLightbox('${att.url}')">
        </div>
      `;
    } else if (att.filetype && att.filetype.startsWith('audio/')) {
      attachmentHTML = `
        <div class="msg-attachment">
          <audio controls class="audio-player" src="${att.url}"></audio>
        </div>
      `;
    } else if (att.filetype && att.filetype.startsWith('video/')) {
      attachmentHTML = `
        <div class="msg-attachment">
          <video controls class="video-player" src="${att.url}"></video>
        </div>
      `;
    } else {
      attachmentHTML = `
        <a href="${att.url}" download="${att.filename}" class="file-attachment-pill">
          <i data-feather="file-text"></i>
          <span>${att.filename} (${Math.round((att.filesize || 0) / 1024)} KB)</span>
        </a>
      `;
    }
  }

  let reactionsHTML = Object.keys(reactions).map(emoji => {
    const userIds = reactions[emoji] || [];
    if (userIds.length === 0) return '';
    const userReacted = userIds.includes(currentUser.id);
    return `
      <span class="reaction-pill ${userReacted ? 'user-reacted' : ''}" onclick="toggleEmojiReaction(${msg.id}, '${emoji}')">
        ${emoji} ${userIds.length}
      </span>
    `;
  }).join('');

  return `
    <div class="message-group ${isSelf ? 'self' : ''}" id="msg-${msg.id}">
      <div class="avatar" style="background-color: ${msg.sender_avatar || '#6366f1'};">
        ${initial}
      </div>
      <div class="msg-body">
        <div class="msg-meta">
          <strong>${isSelf ? 'You' : (msg.sender_display_name || msg.sender_username)}</strong>
          <span>${timeStr}</span>
        </div>
        <div class="msg-bubble">
          ${msg.content ? escapeHTML(msg.content) : ''}
          ${attachmentHTML}
          <button class="add-reaction-btn" onclick="showEmojiPicker(${msg.id})">😀</button>
        </div>
        <div class="reactions-bar" id="reactions-${msg.id}">
          ${reactionsHTML}
        </div>
      </div>
    </div>
  `;
}

function updateMessageReactionsInDOM(messageId, reactions) {
  const container = document.getElementById(`reactions-${messageId}`);
  if (!container) return;

  const html = Object.keys(reactions).map(emoji => {
    const userIds = reactions[emoji] || [];
    if (userIds.length === 0) return '';
    const userReacted = userIds.includes(currentUser.id);
    return `
      <span class="reaction-pill ${userReacted ? 'user-reacted' : ''}" onclick="toggleEmojiReaction(${messageId}, '${emoji}')">
        ${emoji} ${userIds.length}
      </span>
    `;
  }).join('');
  container.innerHTML = html;
}

function showEmojiPicker(messageId) {
  const emojis = ['👍', '❤️', '😂', '🔥', '🎉', '🚀'];
  const chosen = prompt(`Choose an emoji reaction:\n${emojis.join(' ')}`, '👍');
  if (chosen && emojis.includes(chosen)) {
    toggleEmojiReaction(messageId, chosen);
  }
}

function toggleEmojiReaction(messageId, emoji) {
  window.socketClient.send('toggle_reaction', {
    messageId,
    emoji,
    recipientType: activeChat.type,
    targetId: activeChat.targetId
  });
}

function scrollToBottom() {
  const feed = document.getElementById('message-feed');
  feed.scrollTop = feed.scrollHeight;
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// Sending Messages & Uploads
async function sendMessage() {
  const input = document.getElementById('message-input');
  const text = input.value.trim();
  
  if (!text && !selectedFile) return;

  let attachment = null;
  if (selectedFile) {
    attachment = await uploadFile(selectedFile);
    clearSelectedFile();
  }

  window.socketClient.send('send_message', {
    recipientType: activeChat.type,
    targetId: activeChat.targetId,
    content: text,
    attachment
  });

  input.value = '';
  dispatchTyping(false);
}

function handleInputKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function handleTypingEvent() {
  if (!isTypingActive) {
    isTypingActive = true;
    dispatchTyping(true);
  }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    isTypingActive = false;
    dispatchTyping(false);
  }, 2000);
}

function dispatchTyping(isTyping) {
  window.socketClient.send('typing', {
    recipientType: activeChat.type,
    targetId: activeChat.targetId,
    isTyping
  });
}

function updateTypingBar() {
  const keyPrefix = `${activeChat.type}_${activeChat.targetId}_`;
  const names = [];
  typingMap.forEach((name, key) => {
    if (key.startsWith(keyPrefix)) names.push(name);
  });

  const bar = document.getElementById('typing-bar');
  const text = document.getElementById('typing-text');

  if (names.length > 0) {
    bar.style.visibility = 'visible';
    text.innerText = names.length === 1 ? `${names[0]} is typing...` : `${names.join(', ')} are typing...`;
  } else {
    bar.style.visibility = 'hidden';
  }
}

// File Upload Handling
function handleFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;
  selectedFile = file;
  document.getElementById('preview-filename').innerText = `Attached: ${file.name}`;
  document.getElementById('file-preview-bar').style.display = 'flex';
}

function clearSelectedFile() {
  selectedFile = null;
  document.getElementById('file-input').value = '';
  document.getElementById('file-preview-bar').style.display = 'none';
}

async function uploadFile(file) {
  const token = localStorage.getItem('pulsechat_token');
  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    if (!res.ok) throw new Error('File upload failed');
    return await res.json();
  } catch (err) {
    alert('File upload error: ' + err.message);
    return null;
  }
}

// Voice Note Recording
async function toggleVoiceRecording() {
  const btn = document.getElementById('voice-record-btn');
  if (!window.audioController.isRecording) {
    try {
      await window.audioController.startRecording();
      btn.classList.add('recording-pulse');
      btn.title = 'Stop and attach voice note';
    } catch (err) {
      alert(err.message);
    }
  } else {
    try {
      const audioFile = await window.audioController.stopRecording();
      btn.classList.remove('recording-pulse');
      btn.title = 'Record Voice Note';
      selectedFile = audioFile;
      document.getElementById('preview-filename').innerText = `Attached: Voice Note (${Math.round(audioFile.size / 1024)} KB)`;
      document.getElementById('file-preview-bar').style.display = 'flex';
    } catch (err) {
      console.error(err);
    }
  }
}

// Modals & Controls
function openCreateRoomModal() {
  document.getElementById('create-room-modal').style.display = 'flex';
}

function closeCreateRoomModal() {
  document.getElementById('create-room-modal').style.display = 'none';
}

async function submitCreateRoom() {
  const name = document.getElementById('new-room-name').value.trim();
  const description = document.getElementById('new-room-desc').value.trim();
  if (!name) return alert('Room name is required');

  const token = localStorage.getItem('pulsechat_token');
  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name, description })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create room');
    closeCreateRoomModal();
    selectChat('room', data.name, `# ${data.name}`);
  } catch (err) {
    alert(err.message);
  }
}

function openLightbox(url) {
  document.getElementById('lightbox-img').src = url;
  document.getElementById('lightbox').style.display = 'flex';
}

function closeLightbox() {
  document.getElementById('lightbox').style.display = 'none';
}

function toggleSound() {
  window.audioController.soundEnabled = !window.audioController.soundEnabled;
  const btn = document.getElementById('btn-sound');
  btn.classList.toggle('active', window.audioController.soundEnabled);
}

function toggleNotifications() {
  if (!('Notification' in window)) {
    return alert('This browser does not support desktop notifications.');
  }
  if (Notification.permission === 'granted') {
    alert('Notifications are enabled.');
  } else {
    Notification.requestPermission().then(perm => {
      document.getElementById('btn-notify').classList.toggle('active', perm === 'granted');
    });
  }
}

function triggerDesktopNotification(msg) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const title = msg.recipient_type === 'room' ? `#${msg.target_id}` : (msg.sender_display_name || msg.sender_username);
  const body = msg.content || (msg.attachment ? 'Sent an attachment' : 'New message');
  new Notification(title, { body });
}
