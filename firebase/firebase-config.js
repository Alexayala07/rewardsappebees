import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBBCd7EaFQo9D0UaFuIbIV2reyOK9JPXTU",
  authDomain: "proyectoaplewi.firebaseapp.com",
  projectId: "proyectoaplewi",
  storageBucket: "proyectoaplewi.firebasestorage.app",
  messagingSenderId: "188506737810",
  appId: "1:188506737810:web:1350d0bb9ed6f045fd6a4b",
  measurementId: "G-22519M9YP3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };