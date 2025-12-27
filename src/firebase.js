import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyB9EFwnwnCIBjZwzKyYx0-AUaJLDg-EAyw",
  authDomain: "raquel-dantas.firebaseapp.com",
  projectId: "raquel-dantas",
  storageBucket: "raquel-dantas.appspot.com",
  messagingSenderId: "34321758574",
  appId: "1:34321758574:web:2cc041cfa0e2cfc4c2e97f",
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// 🔐 Auth (login)
export const auth = getAuth(app);

// 🗄️ Banco de dados
export const db = getFirestore(app);
