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
import { auth, db } from './firebase'
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, setDoc, getDocs } from 'firebase/firestore'

const app = document.querySelector('#app')

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
    <div style="max-width:520px;margin:auto;padding:20px">
      <button id="back" style="padding:10px 15px;border:0;border-radius:10px">
        ← Kembali
      </button>

      <h2 style="color:#0ba28e">
        ${user.email || 'Pengguna'}
      </h2>

      <div id="privateMessages"
        style="height:55vh;overflow:auto;background:#f3f8f7;padding:15px;border-radius:15px">
      </div>

      <div style="display:flex;gap:8px;margin-top:10px">
        <input id="privateInput"
          placeholder="Tulis pesan..."
          style="flex:1;padding:14px;border:1px solid #ddd;border-radius:12px">

        <button id="privateSend"
          style="padding:14px;background:#0ba28e;color:white;border:0;border-radius:12px">
          Kirim
        </button>
      </div>
    </div>
  `

  const messagesEl=document.querySelector('#privateMessages')
  const input=document.querySelector('#privateInput')

  const messagesRef=collection(db,'chats',chatId,'messages')
  const messagesQuery=query(messagesRef,orderBy('createdAt'))

  onSnapshot(messagesQuery,snapshot=>{
    messagesEl.innerHTML=''

    snapshot.forEach(d=>{
      const x=d.data()
      const el=document.createElement('div')

      el.style.cssText='padding:10px;margin-bottom:8px;background:white;border-radius:10px'

      el.textContent=(x.email||'Pengguna')+': '+(x.text||'')

      messagesEl.appendChild(el)
    })

    messagesEl.scrollTop=messagesEl.scrollHeight
  })

  document.querySelector('#privateSend').onclick=async()=>{
    const text=input.value.trim()

    if(!text) return

    await addDoc(messagesRef,{
      text:text,
      email:auth.currentUser.email,
      uid:currentUid,
      createdAt:serverTimestamp()
    })

    input.value=''
  }

  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      document.querySelector('#privateSend').click()
    }
  })

  document.querySelector('#back').onclick=()=>{
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
    <div style="max-width:520px;margin:auto;padding:20px">
      <h1 style="color:#0ba28e">SAPA 💬</h1>
      <h3>Pengguna</h3>
      <div id="users" style="margin-bottom:15px"></div>
      <div id="messages" style="height:55vh;overflow:auto;background:#f3f8f7;padding:15px;border-radius:15px"></div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <input id="messageInput" placeholder="Tulis pesan..." style="flex:1;padding:14px;border:1px solid #ddd;border-radius:12px">
        <button id="send" style="padding:14px;background:#0ba28e;color:white;border:0;border-radius:12px">Kirim</button>
      </div>
      <button id="logout" style="margin-top:15px;padding:12px">Keluar</button>
    </div>
  `

  const input=document.querySelector('#messageInput')
  const messages=document.querySelector('#messages')
  const usersEl=document.querySelector('#users')

  const usersSnapshot=await getDocs(collection(db,'users'))

  usersSnapshot.forEach(userDoc=>{
    const user=userDoc.data()

    if(user.uid===auth.currentUser.uid) return

    const button=document.createElement('button')
    button.textContent=user.email || 'Pengguna'
    button.style.cssText='display:block;width:100%;padding:12px;margin-bottom:8px;text-align:left;border:0;border-radius:10px;background:#e8f5f3;color:#17645b'
    button.onclick=()=>{
      openPrivateChat(user)
    }

    usersEl.appendChild(button)
  })

  onSnapshot(query(collection(db,'messages'),orderBy('createdAt')), snap=>{
    messages.innerHTML=''
    snap.forEach(d=>{
      const x=d.data()
      const el=document.createElement('div')
      el.style.cssText='padding:10px;margin-bottom:8px;background:white;border-radius:10px'
      el.textContent=(x.email||'Pengguna')+': '+(x.text||'')
      messages.appendChild(el)
    })
    messages.scrollTop=messages.scrollHeight
  })

  document.querySelector('#send').onclick=async()=>{
    const text=input.value.trim()
    if(!text)return

    await addDoc(collection(db,'messages'),{
      text:text,
      email:auth.currentUser.email,
      uid:auth.currentUser.uid,
      createdAt:serverTimestamp()
    })

    input.value=''
  }

  document.querySelector('#logout').onclick=()=>signOut(auth)
}

onAuthStateChanged(auth, user => {
  if (user) {
    saveUserProfile(user)
      .then(() => console.log('PROFIL TERSIMPAN'))
      .catch(e => console.error('GAGAL SIMPAN PROFIL:', e))
    renderHome()
  } else {
    renderLogin()
  }
})
