import './style.css'
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber
} from 'firebase/auth'
import { auth, db, storage } from './firebase'
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  setDoc,
  getDocs,
  updateDoc,
  where
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'

const app = document.querySelector('#app')

let activeCall = null
let activePeer = null
let localStream = null

function endCurrentCall() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop())
  }

  if (activePeer) {
    activePeer.close()
  }

  activeCall = null
  activePeer = null
  localStream = null

  const incoming = document.querySelector('#incomingCall')
  if (incoming) incoming.remove()
}

function listenForIncomingCalls() {
  const currentUser = auth.currentUser
  if (!currentUser) return

  const callsQuery = query(
    collection(db, 'calls'),
    where('calleeId', '==', currentUser.uid),
    where('status', '==', 'ringing')
  )

  onSnapshot(callsQuery, snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type !== 'added') return

      const call = change.doc.data()

      if (document.querySelector('#incomingCall')) return

      const box = document.createElement('div')
      box.id = 'incomingCall'
      box.innerHTML = `
        <div class="incoming-call-card">
          <div class="incoming-avatar">
            ${(call.callerEmail || 'P').charAt(0).toUpperCase()}
          </div>

          <strong>Panggilan masuk</strong>
          <span>${call.callerEmail || 'Pengguna SAPA'}</span>

          <div class="incoming-actions">
            <button id="rejectIncoming">✕</button>
            <button id="acceptIncoming">📞</button>
          </div>
        </div>
      `

      document.body.appendChild(box)

      document.querySelector('#rejectIncoming').onclick = async () => {
        await updateDoc(change.doc.ref, {
          status: 'rejected'
        })
        box.remove()
      }

      document.querySelector('#acceptIncoming').onclick = async () => {
        try {
          localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
          })

          activeCall = change.doc.ref
          activePeer = new RTCPeerConnection(rtcConfig)

          localStream.getTracks().forEach(track => {
            activePeer.addTrack(track, localStream)
          })

          activePeer.ontrack = event => {
            let audio = document.querySelector('#remoteCallAudio')

            if (!audio) {
              audio = document.createElement('audio')
              audio.id = 'remoteCallAudio'
              audio.autoplay = true
              audio.playsInline = true
              document.body.appendChild(audio)
            }

            audio.srcObject = event.streams[0]
          }

          activePeer.onicecandidate = async event => {
            if (!event.candidate) return

            await addDoc(
              collection(change.doc.ref, 'calleeCandidates'),
              event.candidate.toJSON()
            )
          }

          const data = change.doc.data()

          await activePeer.setRemoteDescription(
            new RTCSessionDescription(data.offer)
          )

          const answer = await activePeer.createAnswer()

          await activePeer.setLocalDescription(answer)

          await updateDoc(change.doc.ref, {
            status: 'accepted',
            answer: {
              type: answer.type,
              sdp: answer.sdp
            }
          })

          box.remove()

          onSnapshot(
            collection(change.doc.ref, 'callerCandidates'),
            snapshot => {
              snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                  activePeer.addIceCandidate(
                    new RTCIceCandidate(change.doc.data())
                  ).catch(() => {})
                }
              })
            }
          )

        } catch (e) {
          console.error(e)
          alert('Gagal menerima panggilan: ' + e.message)
          endCurrentCall()
        }
      }
    })
  })
}

async function createVoiceCall(user) {
  if (activeCall) return

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    })

    const currentUser = auth.currentUser
    const callRef = doc(collection(db, 'calls'))

    activeCall = callRef
    activePeer = new RTCPeerConnection(rtcConfig)

    localStream.getTracks().forEach(track => {
      activePeer.addTrack(track, localStream)
    })

    activePeer.ontrack = event => {
      let audio = document.querySelector('#remoteCallAudio')

      if (!audio) {
        audio = document.createElement('audio')
        audio.id = 'remoteCallAudio'
        audio.autoplay = true
        audio.playsInline = true
        document.body.appendChild(audio)
      }

      audio.srcObject = event.streams[0]
      audio.play().catch(() => {})
    }

    activePeer.onicecandidate = async event => {
      if (!event.candidate) return

      await addDoc(
        collection(callRef, 'callerCandidates'),
        event.candidate.toJSON()
      )
    }

    const offer = await activePeer.createOffer()
    await activePeer.setLocalDescription(offer)

    await setDoc(callRef, {
      callerId: currentUser.uid,
      callerEmail: currentUser.email || '',
      calleeId: user.uid,
      calleeEmail: user.email || '',
      status: 'ringing',
      offer: {
        type: offer.type,
        sdp: offer.sdp
      },
      createdAt: serverTimestamp()
    })

    const callStatus = document.createElement('div')
    callStatus.id = 'callStatus'
    callStatus.textContent = '📞 Memanggil ' + (user.email || 'Pengguna') + '...'
    callStatus.style.cssText = `
      position:fixed;
      top:20px;
      left:50%;
      transform:translateX(-50%);
      z-index:9999;
      padding:12px 18px;
      border-radius:14px;
      background:#0ba28e;
      color:white;
      font-weight:600;
      box-shadow:0 6px 20px rgba(0,0,0,.2);
    `
    document.body.appendChild(callStatus)

    const endButton = document.createElement('button')
    endButton.id = 'endCallButton'
    endButton.textContent = '🔴 Akhiri Panggilan'
    endButton.style.cssText = `
      position:fixed;
      bottom:30px;
      left:50%;
      transform:translateX(-50%);
      z-index:10000;
      padding:14px 22px;
      border:0;
      border-radius:30px;
      background:#d93025;
      color:white;
      font-size:16px;
      font-weight:700;
    `
    document.body.appendChild(endButton)

    endButton.onclick = async () => {
      if (activeCall) {
        await updateDoc(activeCall, { status: 'ended' })
      }
      endButton.remove()
      callStatus.remove()
      endCurrentCall()
    }

    onSnapshot(callRef, async snapshot => {
      const data = snapshot.data()
      if (!data) return

      if (data.status === 'accepted') {
        callStatus.textContent = '📲 Panggilan diterima'
      }

      if (
        data.answer &&
        !activePeer.currentRemoteDescription
      ) {
        await activePeer.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        )
      }

      if (data.status === 'rejected') {
        callStatus.textContent = '❌ Panggilan ditolak'
        setTimeout(() => callStatus.remove(), 2000)
        endCurrentCall()
      }

      if (data.status === 'ended') {
        callStatus.textContent = '🔴 Panggilan selesai'
        setTimeout(() => callStatus.remove(), 2000)
        endCurrentCall()
      }
    })

    onSnapshot(
      collection(callRef, 'calleeCandidates'),
      snapshot => {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            activePeer.addIceCandidate(
              new RTCIceCandidate(change.doc.data())
            ).catch(() => {})
          }
        })
      }
    )

  } catch (e) {
    console.error(e)
    alert('Panggilan gagal: ' + e.message)
    endCurrentCall()
  }
}
async function requestMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    })

    stream.getTracks().forEach(track => track.stop())

    return true
  } catch (error) {
    console.error('Microphone error:', error)
    alert('Mikrofon tidak bisa digunakan: ' + error.message)
    return false
  }
}

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
}

let confirmationResult = null
let recaptchaVerifier = null

function renderLogin() {
  app.innerHTML = `
    <div style="max-width:420px;margin:auto;padding:40px 22px;font-family:Inter,system-ui,sans-serif">
      <div style="text-align:center;margin-bottom:30px">
        <div style="font-size:42px;font-weight:800;color:#0ba28e">S</div>
        <h1 style="margin:5px 0">SAPA</h1>
        <p style="color:#78908d">Tetap terhubung, kapan saja.</p>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:20px">
        <button id="emailTab" style="flex:1;padding:12px;border:0;border-radius:12px;background:#0ba28e;color:white">
          Email
        </button>
        <button id="phoneTab" style="flex:1;padding:12px;border:0;border-radius:12px;background:#e8f5f3;color:#17645b">
          Nomor HP
        </button>
      </div>

      <div id="emailForm">
        <input id="email" type="email" placeholder="Email"
          style="width:100%;padding:14px;margin-bottom:10px;border:1px solid #d8e7e4;border-radius:12px">

        <input id="password" type="password" placeholder="Password"
          style="width:100%;padding:14px;margin-bottom:10px;border:1px solid #d8e7e4;border-radius:12px">

        <button id="loginEmail"
          style="width:100%;padding:14px;border:0;border-radius:12px;background:#0ba28e;color:white">
          Masuk
        </button>

        <button id="registerEmail"
          style="width:100%;padding:14px;margin-top:8px;border:0;border-radius:12px;background:#e8f5f3;color:#17645b">
          Buat Akun
        </button>
      </div>

      <div id="phoneForm" style="display:none">
        <input id="phone" type="tel" placeholder="+628xxxxxxxxxx"
          style="width:100%;padding:14px;margin-bottom:10px;border:1px solid #d8e7e4;border-radius:12px">

        <div id="recaptcha-container"></div>

        <button id="sendOtp"
          style="width:100%;padding:14px;border:0;border-radius:12px;background:#0ba28e;color:white">
          Kirim Kode OTP
        </button>

        <div id="otpArea" style="display:none;margin-top:10px">
          <input id="otp" type="text" inputmode="numeric" placeholder="Kode OTP"
            style="width:100%;padding:14px;margin-bottom:10px;border:1px solid #d8e7e4;border-radius:12px">

          <button id="verifyOtp"
            style="width:100%;padding:14px;border:0;border-radius:12px;background:#0ba28e;color:white">
            Verifikasi
          </button>
        </div>
      </div>

      <p id="error" style="color:#d33;text-align:center;margin-top:15px"></p>
    </div>
  `

  const error = document.querySelector('#error')

  document.querySelector('#emailTab').onclick = () => {
    document.querySelector('#emailForm').style.display = 'block'
    document.querySelector('#phoneForm').style.display = 'none'
  }

  document.querySelector('#phoneTab').onclick = () => {
    document.querySelector('#emailForm').style.display = 'none'
    document.querySelector('#phoneForm').style.display = 'block'

    if (!recaptchaVerifier) {
      recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'normal'
      })
      recaptchaVerifier.render()
    }
  }

  document.querySelector('#loginEmail').onclick = async () => {
    try {
      error.textContent = ''
      await signInWithEmailAndPassword(
        auth,
        document.querySelector('#email').value.trim(),
        document.querySelector('#password').value
      )
    } catch (e) {
      error.textContent = e.message
    }
  }

  document.querySelector('#registerEmail').onclick = async () => {
    try {
      error.textContent = ''
      const credential = await createUserWithEmailAndPassword(
        auth,
        document.querySelector('#email').value.trim(),
        document.querySelector('#password').value
      )

      await sendEmailVerification(credential.user)

      renderVerifyEmail(credential.user)
    } catch (e) {
      error.textContent = e.message
    }
  }

  document.querySelector('#sendOtp').onclick = async () => {
    try {
      error.textContent = ''

      const phone = document.querySelector('#phone').value.trim()

      if (!phone.startsWith('+')) {
        error.textContent = 'Nomor harus diawali +62'
        return
      }

      confirmationResult = await signInWithPhoneNumber(
        auth,
        phone,
        recaptchaVerifier
      )

      document.querySelector('#otpArea').style.display = 'block'
      error.textContent = 'Kode OTP sudah dikirim.'
    } catch (e) {
      error.textContent = e.message
    }
  }

  document.querySelector('#verifyOtp').onclick = async () => {
    try {
      error.textContent = ''

      const code = document.querySelector('#otp').value.trim()

      if (!confirmationResult) {
        error.textContent = 'Kirim OTP terlebih dahulu.'
        return
      }

      await confirmationResult.confirm(code)
    } catch (e) {
      error.textContent = e.message
    }
  }
}

async function saveUserProfile(user) {
  await setDoc(doc(db, 'users', user.uid), {
    uid: user.uid,
    email: user.email || '',
    updatedAt: serverTimestamp()
  }, { merge: true })
}

async function openPrivateChat(user) {
  const currentUid = auth.currentUser.uid
  const otherUid = user.uid
  const chatId = [currentUid, otherUid].sort().join('_')

  app.innerHTML = `
    <div class="chat-page">

      <header class="chat-header">
        <button id="back" class="back-btn">‹</button>

        <div class="chat-avatar-wrap">
          <div class="avatar chat-avatar">
            ${(user.email || 'P').charAt(0).toUpperCase()}
          </div>
          <span class="online"></span>
        </div>

        <div class="chat-header-info">
          <strong>${user.email || 'Pengguna'}</strong>
          <small>Aktif sekarang</small>
        </div>

        <div class="chat-header-actions">
          <button id="voiceCall" class="call-button" title="Panggilan suara">📞</button>
          <button id="videoCall" class="call-button" title="Video call">📹</button>
        </div>
      </header>

      <div id="privateMessages" class="messages"></div>

      <div class="chat-input-area">
        <div class="chat-input">
          <button class="input-action">＋</button>

          <input
            id="privateInput"
            type="text"
            placeholder="Tulis pesan..."
            autocomplete="off"
          >

          <button id="privateSend" class="send-btn">➤</button>
        </div>
      </div>

    </div>
  `

  const messagesEl = document.querySelector('#privateMessages')
  const input = document.querySelector('#privateInput')
  document.querySelector('#voiceCall').onclick = async () => {
    await createVoiceCall(user)
  }

  document.querySelector('#videoCall').onclick = () => {
    alert('📹 Tombol video bekerja!')
  }

  const sendButton = document.querySelector('#privateSend')

  const messagesRef = collection(db, 'chats', chatId, 'messages')
  const messagesQuery = query(messagesRef, orderBy('createdAt'))

  onSnapshot(messagesQuery, snapshot => {
    messagesEl.innerHTML = ''

    snapshot.forEach(d => {
      const x = d.data()

      const el = document.createElement('div')
      el.className =
        x.uid === currentUid
          ? 'message me'
          : 'message other'

      el.textContent = x.text || ''
      messagesEl.appendChild(el)
    })

    messagesEl.scrollTop = messagesEl.scrollHeight
  })

  const sendMessage = async () => {
    const text = input.value.trim()

    if (!text) return

    try {
      sendButton.disabled = true

      await addDoc(messagesRef, {
        text,
        email: auth.currentUser.email || '',
        uid: currentUid,
        createdAt: serverTimestamp()
      })

      input.value = ''
      input.focus()
    } catch (e) {
      alert(e.message)
    } finally {
      sendButton.disabled = false
    }
  }

  sendButton.onclick = sendMessage

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault()
      sendMessage()
    }
  })

  document.querySelector('#back').onclick = () => {
    renderHome()
  }
}

async function renderVerifyEmail(user) {
  app.innerHTML = `
    <div style="max-width:520px;margin:auto;padding:25px;text-align:center">
      <h1 style="color:#0ba28e">📧 Cek Email Kamu</h1>
      <p>Link verifikasi sudah dikirim ke:</p>
      <strong>${user.email}</strong>
      <p style="color:#666">Cek Inbox, Spam, atau Promosi email kamu.</p>

      <button id="checkVerification" style="display:block;width:100%;padding:14px;margin-top:20px">
        Saya Sudah Verifikasi
      </button>

      <button id="resendVerification" style="display:block;width:100%;padding:14px;margin-top:10px">
        Kirim Ulang Email
      </button>

      <button id="logoutVerification" style="margin-top:15px;padding:10px">
        Kembali ke Login
      </button>

      <p id="verifyMessage"></p>
    </div>
  `

  const message=document.querySelector('#verifyMessage')

  document.querySelector('#checkVerification').onclick=async()=>{
    await user.reload()

    if(user.emailVerified){
      message.textContent='Email sudah terverifikasi! Memuat SAPA...'
      renderHome()
    } else {
      message.textContent='Email belum terverifikasi. Klik link di email terlebih dahulu.'
    }
  }

  document.querySelector('#resendVerification').onclick=async()=>{
    try {
      await sendEmailVerification(user)
      message.textContent='Email verifikasi sudah dikirim ulang. Cek Inbox atau Spam.'
    } catch(e) {
      message.textContent=e.message
    }
  }

  document.querySelector('#logoutVerification').onclick=async()=>{
    await signOut(auth)
  }
}

async function renderHome() {
  app.innerHTML = `
    <div class="app-shell">
      <header class="home-header">
        <div class="home-brand">
          <div class="home-logo">S</div>
          <div>
            <strong>SAPA</strong>
            <small>Pesan & terhubung</small>
          </div>
        </div>

        <div class="home-actions">
          <button id="homeSearch" class="header-icon">⌕</button>
        </div>
      </header>

      <div class="search-box">
        <span>⌕</span>
        <input id="userSearch" placeholder="Cari percakapan">
      </div>

      <main class="chat-section">
        <div class="section-heading">
          <strong>Pesan</strong>
        </div>

        <div id="users" class="chat-list">
          <div class="loading-state">Memuat percakapan...</div>
        </div>
      </main>

      <button id="newChat" class="new-chat">＋</button>

      <nav class="bottom-nav">
        <button class="nav-item active" data-page="chat">
          <span class="nav-icon">◉</span>
          <span>Chat</span>
        </button>

        <button class="nav-item" data-page="story">
          <span class="nav-icon">◌</span>
          <span>Story</span>
        </button>

        <button class="nav-item" data-page="calls">
          <span class="nav-icon">◈</span>
          <span>Panggilan</span>
        </button>

        <button class="nav-item" data-page="profile">
          <span class="nav-icon">●</span>
          <span>Profil</span>
        </button>
      </nav>
    </div>
  `

  const usersEl = document.querySelector('#users')
  const searchInput = document.querySelector('#userSearch')
  const users = []

  const renderUsers = () => {
    const keyword = searchInput.value.trim().toLowerCase()

    const filtered = users.filter(user =>
      (user.email || '').toLowerCase().includes(keyword)
    )

    if (!filtered.length) {
      usersEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💬</div>
          <strong>Belum ada percakapan</strong>
          <p>Cari pengguna untuk mulai mengobrol.</p>
        </div>
      `
      return
    }

    usersEl.innerHTML = filtered.map(user => `
      <button class="chat-item" data-uid="${user.uid}">
        <div class="avatar-wrap">
          <div class="avatar">
            ${(user.email || 'P').charAt(0).toUpperCase()}
          </div>
          <span class="online"></span>
        </div>

        <div class="chat-info">
          <div class="chat-top">
            <strong>${user.email || 'Pengguna'}</strong>
            <time>Baru</time>
          </div>

          <div class="chat-bottom">
            <span>Mulai percakapan baru</span>
          </div>
        </div>

        <span class="chat-arrow">›</span>
      </button>
    `).join('')

    usersEl.querySelectorAll('.chat-item').forEach(button => {
      button.onclick = () => {
        const user = users.find(x => x.uid === button.dataset.uid)
        if (user) openPrivateChat(user)
      }
    })
  }

  try {
    const usersSnapshot = await getDocs(collection(db, 'users'))

    usersSnapshot.forEach(userDoc => {
      const user = userDoc.data()

      if (user.uid !== auth.currentUser.uid) {
        users.push(user)
      }
    })

    renderUsers()
  } catch (e) {
    usersEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <strong>Gagal memuat pengguna</strong>
        <p>${e.message}</p>
      </div>
    `
  }

  searchInput.addEventListener('input', renderUsers)

  document.querySelector('#newChat').onclick = () => {
    searchInput.focus()
  }

  document.querySelector('#homeSearch').onclick = () => {
    searchInput.focus()
    searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  document.querySelectorAll('.nav-item').forEach(item => {
    item.onclick = () => {
      const page = item.dataset.page

      const searchBox = document.querySelector('.search-box')
      if (searchBox) {
        searchBox.style.display = page === 'chat' ? '' : 'none'
      }

      const homeHeader = document.querySelector('.home-header')
      if (homeHeader) {
        homeHeader.style.display = page === 'chat' ? '' : 'none'
      }

      if (page === 'chat') {
        renderHome()
        return
      }

      document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'))
      item.classList.add('active')

      const titles = {
        story: ['Story', 'Bagikan momen kamu'],
        calls: ['Panggilan', 'Riwayat panggilan kamu'],
        profile: ['Profil', 'Akun SAPA kamu']
      }

      const [title, subtitle] = titles[page]

      if (page === 'story') {
        renderStoryPage(usersEl)
        return
      }

      if (page === 'calls') {
        usersEl.innerHTML = `
          <div class="feature-page modern-feature calls-feature">
            <div class="feature-hero">
              <div class="feature-big-icon">📞</div>
            </div>

            <h2>Panggilan</h2>
            <p>Riwayat panggilan suara dan video kamu akan muncul di sini.</p>

            <div class="feature-card">
              <strong>Belum ada panggilan</strong>
              <span>Panggilan terbaru akan muncul di sini.</span>
            </div>
          </div>
        `
      }

      if (page === 'profile') {
        const currentUser = auth.currentUser
        const email = currentUser?.email || 'Pengguna SAPA'
        const initial = email.charAt(0).toUpperCase()

        usersEl.innerHTML = `
          <div class="feature-page modern-feature profile-feature">

            <div class="profile-avatar">${initial}</div>

            <h2>${email}</h2>
            <p class="profile-status">Akun SAPA aktif</p>

            <div class="profile-menu">

              <button class="profile-option">
                <span class="option-icon">✎</span>
                <div>
                  <strong>Edit Profil</strong>
                  <small>Ubah nama dan foto profil</small>
                </div>
                <b>›</b>
              </button>

              <button class="profile-option">
                <span class="option-icon">🔔</span>
                <div>
                  <strong>Notifikasi</strong>
                  <small>Atur pemberitahuan</small>
                </div>
                <b>›</b>
              </button>

              <button class="profile-option">
                <span class="option-icon">⚙</span>
                <div>
                  <strong>Pengaturan</strong>
                  <small>Privasi dan keamanan</small>
                </div>
                <b>›</b>
              </button>

              <button class="profile-option logout-option" id="profileLogout">
                <span class="option-icon">↪</span>
                <div>
                  <strong>Keluar</strong>
                  <small>Keluar dari akun SAPA</small>
                </div>
                <b>›</b>
              </button>

            </div>
          </div>
        `

        document.querySelector('#profileLogout').onclick = () =>
          signOut(auth)
      }
    }
  })

}


async function renderStoryPage(container) {
  container.innerHTML = `
    <div class="story-page">
      <div class="story-page-top">
        <div>
          <span class="story-kicker">MOMEN</span>
          <h2>Story</h2>
          <p>Bagikan momen kamu</p>
        </div>

        <label class="story-add">
          <span>＋</span>
          <input id="storyFile" type="file" accept="image/*" hidden>
        </label>
      </div>

      <section class="story-section">
        <div class="story-section-title">
          <strong>Story terbaru</strong>
          <span id="storyCount">0 Story</span>
        </div>

        <div id="storyList" class="story-horizontal">
          <div class="story-loading">Memuat Story...</div>
        </div>
      </section>

      <section class="story-contacts">
        <div class="story-section-title">
          <strong>Kontak yang bisa melihat Story kamu</strong>
          <span>Kontak</span>
        </div>

        <div id="storyContacts" class="story-contact-list">
          <div class="story-loading">Memuat kontak...</div>
        </div>
      </section>
    </div>
  `

  const fileInput = document.querySelector('#storyFile')
  const storyList = document.querySelector('#storyList')
  const storyContacts = document.querySelector('#storyContacts')
  const storyCount = document.querySelector('#storyCount')

  fileInput.onchange = async () => {
    const file = fileInput.files[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('Pilih foto.')
      return
    }

    if (file.size > 8 * 1024 * 1024) {
      alert('Ukuran foto maksimal 8 MB.')
      return
    }

    try {
      storyList.innerHTML = '<div class="story-loading">Mengunggah...</div>'

      const uid = auth.currentUser.uid
      const filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const storageRef = ref(storage, `stories/${uid}/${filename}`)

      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)

      await addDoc(collection(db, 'stories'), {
        uid,
        email: auth.currentUser.email || '',
        imageUrl: url,
        createdAt: serverTimestamp()
      })

      fileInput.value = ''
      await loadStories()
    } catch (e) {
      console.error(e)
      alert('Gagal upload Story: ' + e.message)
      await loadStories()
    }
  }

  async function loadContacts() {
    try {
      const snapshot = await getDocs(collection(db, 'users'))
      const contacts = []

      snapshot.forEach(d => {
        const x = d.data()
        if (x.email && x.email !== auth.currentUser?.email) {
          contacts.push(x)
        }
      })

      storyContacts.innerHTML = ''

      if (!contacts.length) {
        storyContacts.innerHTML = `
          <div class="story-no-contacts">
            <span>👥</span>
            <div>
              <strong>Belum ada kontak</strong>
              <small>Pengguna SAPA akan muncul di sini.</small>
            </div>
          </div>
        `
        return
      }

      contacts.slice(0, 12).forEach(contact => {
        const name = (contact.email || 'Pengguna').split('@')[0]
        const item = document.createElement('div')
        item.className = 'story-contact'

        item.innerHTML = `
          <div class="story-contact-avatar">
            ${name.charAt(0).toUpperCase()}
          </div>
          <div class="story-contact-info">
            <strong>${name}</strong>
            <small>✓ Bisa melihat Story</small>
          </div>
          <span class="story-contact-check">✓</span>
        `

        storyContacts.appendChild(item)
      })
    } catch (e) {
      console.error(e)
      storyContacts.innerHTML = `
        <div class="story-no-contacts">
          <span>⚠️</span>
          <div>
            <strong>Kontak belum tersedia</strong>
            <small>${e.message}</small>
          </div>
        </div>
      `
    }
  }

  async function loadStories() {
    try {
      const snapshot = await getDocs(collection(db, 'stories'))
      storyList.innerHTML = ''

      const stories = []

      snapshot.forEach(d => {
        const x = d.data()
        if (x.imageUrl) stories.push(x)
      })

      stories.reverse()
      storyCount.textContent = `${stories.length} Story`

      if (!stories.length) {
        storyList.innerHTML = `
          <label class="story-empty-inline">
            <div class="story-empty-icon">＋</div>
            <strong>Buat Story</strong>
            <span>Bagikan foto pertama kamu</span>
            <input id="storyEmptyFile" type="file" accept="image/*" hidden>
          </label>
        `

        const emptyInput = document.querySelector('#storyEmptyFile')
        emptyInput.onchange = () => {
          if (emptyInput.files[0]) {
            const dataTransfer = new DataTransfer()
            dataTransfer.items.add(emptyInput.files[0])
            fileInput.files = dataTransfer.files
            fileInput.dispatchEvent(new Event('change'))
          }
        }

        return
      }

      stories.forEach(story => {
        const item = document.createElement('button')
        item.className = 'story-card'

        const name = (story.email || 'Pengguna').split('@')[0]

        item.innerHTML = `
          <img src="${story.imageUrl}" alt="Story">
          <div class="story-card-gradient"></div>
          <div class="story-card-name">${name}</div>
        `

        item.onclick = () => {
          const viewer = document.createElement('div')
          viewer.className = 'story-viewer'

          viewer.innerHTML = `
            <button class="story-close">×</button>
            <img src="${story.imageUrl}" alt="Story">
          `

          document.body.appendChild(viewer)

          viewer.querySelector('.story-close').onclick = () => viewer.remove()

          viewer.onclick = e => {
            if (e.target === viewer) viewer.remove()
          }
        }

        storyList.appendChild(item)
      })
    } catch (e) {
      console.error(e)

      storyList.innerHTML = `
        <div class="story-no-contacts">
          <span>⚠️</span>
          <div>
            <strong>Story belum bisa dimuat</strong>
            <small>${e.message}</small>
          </div>
        </div>
      `
    }
  }

  await Promise.all([
    loadStories(),
    loadContacts()
  ])
}


onAuthStateChanged(auth, user => {
  if (user) {
    saveUserProfile(user)
      .then(() => console.log('PROFIL TERSIMPAN'))
      .catch(e => console.error('GAGAL SIMPAN PROFIL:', e))

    listenForIncomingCalls()
    renderHome()
  } else {
    renderLogin()
  }
})
