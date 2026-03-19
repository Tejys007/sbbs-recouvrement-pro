// src/components/AccountSecurityView.tsx
import React, { useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { auth } from "../firebase";

export default function AccountSecurityView() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleChangePassword() {
    setMsg(null);
    setErr(null);

    const user = auth.currentUser;

    if (!user || !user.email) {
      setErr("Utilisateur non connecté.");
      return;
    }

    if (!currentPassword.trim()) {
      setErr("Veuillez saisir le mot de passe actuel.");
      return;
    }

    if (!newPassword.trim()) {
      setErr("Veuillez saisir le nouveau mot de passe.");
      return;
    }

    if (newPassword.length < 6) {
      setErr("Le nouveau mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErr("La confirmation du nouveau mot de passe ne correspond pas.");
      return;
    }

    setSaving(true);

    try {
      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword
      );

      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      setMsg("Mot de passe modifié avec succès.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      const code = e?.code || "";

      if (
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential"
      ) {
        setErr("Le mot de passe actuel est incorrect.");
      } else if (code === "auth/too-many-requests") {
        setErr("Trop de tentatives. Réessaie dans quelques minutes.");
      } else if (code === "auth/requires-recent-login") {
        setErr("Reconnecte-toi puis recommence.");
      } else {
        setErr(e?.message || "Erreur lors de la modification du mot de passe.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="text-3xl font-black text-sbbsNavy uppercase">
          Sécurité du compte
        </div>
        <div className="text-[11px] font-bold uppercase tracking-widest text-sbbsText opacity-50 mt-1">
          Modification du mot de passe utilisateur
        </div>
      </div>

      {err && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 font-bold text-[12px]">
          {err}
        </div>
      )}

      {msg && (
        <div className="p-4 rounded-2xl bg-green-50 border border-green-200 text-green-700 font-bold text-[12px]">
          {msg}
        </div>
      )}

      <div className="bg-white rounded-[2.5rem] shadow-2xl border-2 border-sbbsBorder overflow-hidden max-w-3xl">
        <div className="p-8 border-b-2 border-sbbsGray">
          <div className="text-xl font-black text-sbbsNavy uppercase">
            Modifier le mot de passe
          </div>
          <div className="text-[11px] font-bold text-sbbsText opacity-60 mt-2">
            Utilisateur connecté : {auth.currentUser?.email || "-"}
          </div>
        </div>

        <div className="p-8 space-y-5">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-sbbsText opacity-60 mb-2">
              Mot de passe actuel
            </div>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-4 rounded-2xl border-2 border-sbbsBorder outline-none font-black text-sbbsNavy"
              placeholder="Mot de passe actuel"
            />
          </div>

          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-sbbsText opacity-60 mb-2">
              Nouveau mot de passe
            </div>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-4 rounded-2xl border-2 border-sbbsBorder outline-none font-black text-sbbsNavy"
              placeholder="Nouveau mot de passe"
            />
          </div>

          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-sbbsText opacity-60 mb-2">
              Confirmer le nouveau mot de passe
            </div>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-4 rounded-2xl border-2 border-sbbsBorder outline-none font-black text-sbbsNavy"
              placeholder="Confirmer le nouveau mot de passe"
            />
          </div>

          <div className="pt-4">
            <button
              onClick={handleChangePassword}
              disabled={saving}
              className="bg-sbbsNavy text-white px-8 py-4 rounded-2xl font-black uppercase text-xs shadow hover:bg-sbbsRed disabled:opacity-50"
            >
              {saving ? "Modification..." : "Enregistrer le nouveau mot de passe"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}