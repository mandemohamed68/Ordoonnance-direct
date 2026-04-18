import admin from "firebase-admin";
try {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
  const db = admin.firestore();
  console.log("Firebase Admin initialized successfully.");
  db.collection("settings").doc("test").get().then((doc) => {
    console.log("Successfully fetched from Firestore:", doc.exists);
    process.exit(0);
  }).catch((err) => {
    console.error("Firestore read error:", err.message);
    process.exit(1);
  });
} catch (error) {
  console.error("Failed to initialize:", error.message);
  process.exit(1);
}
