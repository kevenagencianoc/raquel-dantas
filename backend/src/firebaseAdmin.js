import admin from "firebase-admin";
import fs from "fs";

let inicializado = false;

export function initFirebaseAdmin() {
  if (inicializado) return;

  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./serviceAccountKey.json";

  if (!fs.existsSync(path)) {
    console.error("❌ Service Account não encontrado:", path);
    console.error("➡️ Coloque o arquivo serviceAccountKey.json dentro de /backend e confira o .env");
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(path, "utf-8"));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  inicializado = true;
  console.log("✅ Firebase Admin inicializado");
}

export function getDb() {
  return admin.firestore();
}
