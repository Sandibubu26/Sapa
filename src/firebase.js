import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: 'AIzaSyDqtTwnxHFz7OCCSnF3FEZL8gP8ZxqlUaE',
  authDomain: 'sapa-55b51.firebaseapp.com',
  projectId: 'sapa-55b51',
  storageBucket: 'sapa-55b51.firebasestorage.app',
  messagingSenderId: '729615649520',
  appId: '1:729615649520:web:ec9e1e82ca1b0597c6d035'
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
