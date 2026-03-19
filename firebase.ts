// firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBvahHt17VlNNpXRQTppfCjMYyPBvxtTg8",
  authDomain: "sbbs-recouvrement-pro-475be.firebaseapp.com",
  projectId: "sbbs-recouvrement-pro-475be",
  storageBucket: "sbbs-recouvrement-pro-475be.firebasestorage.app",
  messagingSenderId: "205415132081",
  appId: "1:205415132081:web:976c68b55f9296720a6b90"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
