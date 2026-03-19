// src/components/LoginView.tsx
import React, { useState } from "react";
import { loginWithEmail, sendResetPasswordForEmail } from "../services/auth";

export default function LoginView() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetErr, setResetErr] = useState<string | null>(null);

  async function handleLogin() {
    setErr(null);
    setResetMsg(null);
    setResetErr(null);

    const safeEmail = String(email || "").trim().toLowerCase();
    const safePassword = String(password || "");

    if (!safeEmail) {
      setErr("Veuillez saisir votre adresse email.");
      return;
    }

    if (!safePassword) {
      setErr("Veuillez saisir votre mot de passe.");
      return;
    }

    setLoading(true);

    try {
      await loginWithEmail(safeEmail, safePassword);
    } catch (e: any) {
      const code = String(e?.code || "");
      if (
        code === "auth/invalid-credential" ||
        code === "auth/wrong-password" ||
        code === "auth/user-not-found"
      ) {
        setErr("Email ou mot de passe incorrect.");
      } else {
        setErr(e?.message || "Connexion impossible.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setResetMsg(null);
    setResetErr(null);
    setErr(null);

    const safeEmail = String(email || "").trim().toLowerCase();
    if (!safeEmail) {
      setResetErr("Saisissez d’abord votre adresse email.");
      return;
    }

    setResetLoading(true);

    try {
      await sendResetPasswordForEmail(safeEmail);
      setResetMsg(`Email de réinitialisation envoyé à ${safeEmail}.`);
    } catch (e: any) {
      setResetErr(
        e?.message || "Impossible d'envoyer l'email de réinitialisation."
      );
    } finally {
      setResetLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      handleLogin();
    }
  }

  return (
    <div className="min-h-screen bg-sbbsGray flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl border-2 border-sbbsBorder overflow-hidden">
        <div className="bg-sbbsNavy px-8 py-8 text-white">
          <div className="text-3xl font-black uppercase tracking-tight">
            SBBS
          </div>
          <div className="text-[11px] font-bold uppercase tracking-[0.3em] opacity-70 mt-2">
            Recouvrement Pro
          </div>
        </div>

        <div className="p-8">
          <div className="text-2xl font-black text-sbbsNavy uppercase">
            Connexion
          </div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-sbbsText opacity-50 mt-2">
            Accès à l’application de recouvrement
          </div>

          <div className="mt-8 space-y-5">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-sbbsText opacity-60 mb-2">
                Adresse email
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="exemple@sbbs.ci"
                className="w-full px-5 py-4 rounded-2xl border-2 border-sbbsGray font-black text-sbbsNavy outline-none focus:border-sbbsNavy"
              />
            </div>

            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-sbbsText opacity-60 mb-2">
                Mot de passe
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Votre mot de passe"
                className="w-full px-5 py-4 rounded-2xl border-2 border-sbbsGray font-black text-sbbsNavy outline-none focus:border-sbbsNavy"
              />
            </div>

            {err && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-[12px] font-bold">
                {err}
              </div>
            )}

            {resetErr && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-[12px] font-bold">
                {resetErr}
              </div>
            )}

            {resetMsg && (
              <div className="p-4 rounded-2xl bg-green-50 border border-green-200 text-green-700 text-[12px] font-bold">
                {resetMsg}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-sbbsNavy text-white py-4 rounded-2xl font-black uppercase text-sm shadow-lg hover:bg-sbbsRed transition-all disabled:opacity-50"
            >
              {loading ? "Connexion..." : "Se connecter"}
            </button>

            <button
              onClick={handleForgotPassword}
              disabled={resetLoading}
              className="w-full bg-sbbsGray text-sbbsNavy py-4 rounded-2xl font-black uppercase text-sm shadow-lg hover:opacity-90 transition-all disabled:opacity-50"
            >
              {resetLoading
                ? "Envoi en cours..."
                : "Mot de passe oublié ?"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}