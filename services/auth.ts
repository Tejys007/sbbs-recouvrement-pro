// src/services/auth.ts
import { auth, db } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

/**
 * Inscription
 * - crée l'utilisateur dans Firebase Auth
 * - crée le profil minimal dans Firestore : /users/{uid}
 */
export const registerWithEmail = async (email: string, password: string) => {
  const userCredential = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );

  const uid = userCredential.user.uid;

  await setDoc(
    doc(db, "users", uid),
    {
      email: userCredential.user.email,
      createdAt: serverTimestamp(),
      role: "user",
      isActive: true,
    },
    { merge: true }
  );

  return userCredential;
};

/**
 * Connexion
 */
export const loginWithEmail = (email: string, password: string) => {
  return signInWithEmailAndPassword(auth, email, password);
};

/**
 * Déconnexion
 */
export const logout = () => {
  return signOut(auth);
};

/**
 * Lire le profil Firestore : /users/{uid}
 */
export const getUserProfile = async (uid: string) => {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
};

/**
 * Changer le mot de passe de l'utilisateur connecté
 * - réauthentifie avec le mot de passe actuel
 * - puis met à jour le mot de passe
 */
export const changeMyPassword = async (
  currentPassword: string,
  newPassword: string
) => {
  const user = auth.currentUser;

  if (!user || !user.email) {
    throw new Error("Utilisateur non connecté.");
  }

  const credential = EmailAuthProvider.credential(
    user.email,
    currentPassword
  );

  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
};

/**
 * Envoyer un email de réinitialisation de mot de passe
 */
export const sendResetPasswordForEmail = async (email: string) => {
  const safeEmail = String(email || "").trim().toLowerCase();
  if (!safeEmail) {
    throw new Error("Adresse email requise.");
  }

  await sendPasswordResetEmail(auth, safeEmail);
};