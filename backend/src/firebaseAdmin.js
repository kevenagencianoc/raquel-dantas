import admin from "firebase-admin";
import fs from "fs";

let inicializado = false;

export function initFirebaseAdmin() {
  if (inicializado) return;

  // 1) Preferir JSON via ENV (produção / Render)
  const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (jsonEnv) {
    const serviceAccount = JSON.parse(jsonEnv);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    inicializado = true;
    console.log("✅ Firebase Admin inicializado (ENV JSON)");
    return;
  }

  // 2) Fallback: arquivo local (desenvolvimento)
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./serviceAccountKey.json";

  if (!fs.existsSync(path)) {
    console.error("❌ Service Account não encontrado:", path);
    console.error("➡️ Em produção use FIREBASE_SERVICE_ACCOUNT_JSON no .env do Render");
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(path, "utf-8"));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  inicializado = true;
  console.log("✅ Firebase Admin inicializado (arquivo)");
}

export function getDb() {
  return admin.firestore();
}
