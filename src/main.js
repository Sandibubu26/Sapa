import './style.css'

const chats = [
  {
    id: 1,
    name: 'Rina',
    avatar: 'R',
    online: true,
    message: 'Besok jadi ketemu?',
    time: '10:42',
    unread: 2
  },
  {
    id: 2,
    name: 'Keluarga ❤️',
    avatar: 'K',
    online: false,
    message: 'Ibu: Jangan lupa makan ya',
    time: '09:18',
    unread: 4
  },
  {
    id: 3,
    name: 'Dimas',
    avatar: 'D',
    online: true,
    message: 'Oke, siap 👍',
    time: 'Kemarin',
    unread: 0
  },
  {
    id: 4,
    name: 'Tim SAPA',
    avatar: 'S',
    online: false,
    message: 'Andi mengirim foto',
    time: 'Kemarin',
    unread: 0
  },
  {
    id: 5,
    name: 'Nadia',
    avatar: 'N',
    online: false,
    message: 'Makasih yaa 😄',
    time: 'Sen',
    unread: 0
  }
]

const messages = [
  {
    text: 'Hai Rina 👋',
    time: '10:35',
    mine: true
  },
  {
    text: 'Hai! Gimana kabarnya?',
    time: '10:36',
    mine: false
  },
  {
    text: 'Baik 😄 Kamu gimana?',
    time: '10:37',
    mine: true
  },
  {
    text: 'Aku juga baik. Besok jadi ketemu?',
    time: '10:42',
    mine: false
  }
]

const app = document.querySelector('#app')

function renderHome() {
  app.innerHTML = `
    <div class="app-shell">

      <header class="topbar">
        <div class="brand-area">
          <div class="brand">
            <span class="brand-mark">S</span>
            <span>SAPA</span>
          </div>
          <p>Tetap terhubung, kapan saja.</p>
        </div>

        <button class="header-btn" id="searchBtn">⌕</button>
        <button class="header-btn">⋮</button>
      </header>

      <main class="home-content">

        <div class="search-box">
          <span>⌕</span>
          <input id="searchInput" type="text" placeholder="Cari percakapan..." />
        </div>

        <section class="stories">
          <div class="section-title">
            <h2>Status</h2>
            <span>Lihat semua</span>
          </div>

          <div class="story-list">
            <div class="story">
              <div class="story-avatar add">+</div>
              <small>Status saya</small>
            </div>

            <div class="story">
              <div class="story-avatar">R</div>
              <small>Rina</small>
            </div>

            <div class="story">
              <div class="story-avatar">D</div>
              <small>Dimas</small>
            </div>

            <div class="story">
              <div class="story-avatar">N</div>
              <small>Nadia</small>
            </div>

            <div class="story">
              <div class="story-avatar">A</div>
              <small>Andi</small>
            </div>
          </div>
        </section>

        <section class="chat-section">
          <div class="section-title">
            <h2>Pesan</h2>
            <span>Terbaru</span>
          </div>

          <div class="chat-list" id="chatList">
            ${renderChatList(chats)}
          </div>
        </section>

      </main>

      <button class="new-chat" id="newChat">＋</button>

      <nav class="bottom-nav">
        <button class="nav-item active">
          <span>▣</span>
          <small>Chat</small>
        </button>

        <button class="nav-item">
          <span>◉</span>
          <small>Status</small>
        </button>

        <button class="nav-item">
          <span>☎</span>
          <small>Panggilan</small>
        </button>

        <button class="nav-item">
          <span>●</span>
          <small>Profil</small>
        </button>
      </nav>

    </div>
  `

  document.querySelectorAll('.chat-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = Number(item.dataset.id)
      const chat = chats.find(c => c.id === id)
      renderChat(chat)
    })
  })

  document.querySelector('#searchInput').addEventListener('input', e => {
    const keyword = e.target.value.toLowerCase()

    const filtered = chats.filter(chat =>
      chat.name.toLowerCase().includes(keyword) ||
      chat.message.toLowerCase().includes(keyword)
    )

    document.querySelector('#chatList').innerHTML = renderChatList(filtered)

    document.querySelectorAll('.chat-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = Number(item.dataset.id)
        const chat = chats.find(c => c.id === id)
        renderChat(chat)
      })
    })
  })
}

function renderChatList(list) {
  if (!list.length) {
    return `
      <div class="empty-state">
        <div>⌕</div>
        <p>Percakapan tidak ditemukan</p>
      </div>
    `
  }

  return list.map(chat => `
    <button class="chat-item" data-id="${chat.id}">

      <div class="avatar-wrap">
        <div class="avatar">${chat.avatar}</div>
        ${chat.online ? '<span class="online"></span>' : ''}
      </div>

      <div class="chat-info">

        <div class="chat-top">
          <strong>${chat.name}</strong>
          <time>${chat.time}</time>
        </div>

        <div class="chat-bottom">
          <span>${chat.message}</span>
          ${chat.unread ? `<b>${chat.unread}</b>` : ''}
        </div>

      </div>

    </button>
  `).join('')
}

function renderChat(chat) {
  app.innerHTML = `
    <div class="chat-page">

      <header class="chat-header">

        <button class="back-btn" id="backBtn">‹</button>

        <div class="chat-user">
          <div class="chat-avatar-wrap">
            <div class="chat-avatar">${chat.avatar}</div>
            ${chat.online ? '<span class="online"></span>' : ''}
          </div>

          <div>
            <strong>${chat.name}</strong>
            <small>${chat.online ? 'Online' : 'Terakhir dilihat baru-baru ini'}</small>
          </div>
        </div>

        <div class="call-buttons">
          <button id="voiceCall">☎</button>
          <button id="videoCall">▣</button>
        </div>

      </header>

      <main class="messages" id="messages">

        <div class="today">
          <span>Hari ini</span>
        </div>

        ${messages.map(message => `
          <div class="message-row ${message.mine ? 'mine' : 'theirs'}">

            <div class="message-bubble">
              <p>${message.text}</p>
              <span>
                ${message.time}
                ${message.mine ? ' ✓✓' : ''}
              </span>
            </div>

          </div>
        `).join('')}

      </main>

      <div class="chat-input-area">

        <button class="attachment-btn">＋</button>

        <div class="message-input">
          <button>☺</button>
          <input
            id="messageInput"
            type="text"
            placeholder="Tulis pesan..."
            autocomplete="off"
          />
          <button>📎</button>
        </div>

        <button class="send-btn" id="sendBtn">➤</button>

      </div>

    </div>
  `

  const input = document.querySelector('#messageInput')
  const messagesContainer = document.querySelector('#messages')

  document.querySelector('#backBtn').addEventListener('click', renderHome)

  document.querySelector('#voiceCall').addEventListener('click', () => {
    alert(`Memulai panggilan suara dengan ${chat.name}`)
  })

  document.querySelector('#videoCall').addEventListener('click', () => {
    alert(`Memulai video call dengan ${chat.name}`)
  })

  function sendMessage() {
    const text = input.value.trim()

    if (!text) return

    const now = new Date()

    const time = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    })

    const row = document.createElement('div')
    row.className = 'message-row mine'

    row.innerHTML = `
      <div class="message-bubble">
        <p></p>
        <span>${time} ✓✓</span>
      </div>
    `

    row.querySelector('p').textContent = text

    messagesContainer.appendChild(row)

    input.value = ''
    messagesContainer.scrollTop = messagesContainer.scrollHeight
  }

  document.querySelector('#sendBtn').addEventListener('click', sendMessage)

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      sendMessage()
    }
  })

  setTimeout(() => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight
  }, 50)
}

renderHome()
