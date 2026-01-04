import { initializeApp } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import { getAuth } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { getFirestore } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAs1nLZNlUyesu4LKSiHpx7BzCguRKSvSo",
  authDomain: "sistema-notas-docente.firebaseapp.com",
  projectId: "sistema-notas-docente",
  storageBucket: "sistema-notas-docente.appspot.com",
  messagingSenderId: "906918983748",
  appId: "1:906918983748:web:99ed6bf8b65b7fafcb6411"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

