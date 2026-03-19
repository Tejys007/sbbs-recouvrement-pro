// src/components/AccessManagementView.tsx
import React, { useMemo, useState } from "react";

type AppUserRow = {
  id: string;
  email?: string | null;
  isActive?: boolean;
  role?: string | null;
};

interface Props {
  users: AppUserRow[];
  currentUserUid: string;
  onSaveAccess: (
    userId: string,
    patch: { isActive: boolean }
  ) => Promise<void> | void;
}

type AccessRowProps = {
  user: AppUserRow;
  isCurrentUser: boolean;
  isSaving: boolean;
  onSave: (userId: string, isActive: boolean) => Promise<void> | void;
};

export default function AccessManagementView({
  users,
  currentUserUid,
  onSaveAccess,
}: Props) {
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) =>
      String(a.email || "").localeCompare(String(b.email || ""))
    );
  }, [users]);

  async function handleSave(userId: string, isActive: boolean) {
    setErr(null);
    setMsg(null);
    setSavingUserId(userId);

    try {
      await onSaveAccess(userId, { isActive });
      setMsg("Accès mis à jour avec succès.");
    } catch (e: any) {
      setErr(e?.message || "Erreur lors de la mise à jour des accès.");
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-3xl font-black text-sbbsNavy uppercase">
            Gestion des comptes
          </div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-sbbsText opacity-50 mt-1">
            Seul l’administrateur principal gère les accès utilisateurs
          </div>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 font-bold text-[12px]">
        La création des comptes utilisateurs se fait dans Firebase Authentication
        puis dans la collection <span className="font-black">users</span>. Ici,
        tu actives ou désactives les comptes.
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

      <div className="bg-white rounded-[2.5rem] shadow-2xl border-2 border-sbbsBorder overflow-hidden">
        <div className="p-6 border-b-2 border-sbbsGray">
          <div className="grid grid-cols-4 gap-4 text-[10px] font-black uppercase text-sbbsText opacity-70">
            <div>Email</div>
            <div>Statut actuel</div>
            <div>Compte</div>
            <div className="text-right">Action</div>
          </div>
        </div>

        <div className="divide-y-2 divide-sbbsGray">
          {sortedUsers.map((user) => {
            const isCurrentUser = user.id === currentUserUid;

            return (
              <AccessRow
                key={user.id}
                user={user}
                isCurrentUser={isCurrentUser}
                isSaving={savingUserId === user.id}
                onSave={handleSave}
              />
            );
          })}

          {sortedUsers.length === 0 && (
            <div className="p-10 text-center opacity-50 font-bold">
              Aucun utilisateur trouvé.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AccessRow({
  user,
  isCurrentUser,
  isSaving,
  onSave,
}: AccessRowProps) {
  const [isActive, setIsActive] = useState<boolean>(Boolean(user.isActive));

  return (
    <div className="p-6 grid grid-cols-4 gap-4 items-center">
      <div>
        <div className="font-black text-sbbsNavy text-[12px] break-all">
          {user.email || "Sans email"}
        </div>
        {isCurrentUser && (
          <div className="text-[10px] font-bold text-sbbsGreen mt-1">
            Compte connecté
          </div>
        )}
      </div>

      <div>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={isCurrentUser}
          />
          <span className="font-black text-[11px] text-sbbsNavy uppercase">
            {isActive ? "ACTIF" : "INACTIF"}
          </span>
        </label>
      </div>

      <div>
        <span
          className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase ${
            user.isActive
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-orange-50 border border-orange-200 text-orange-700"
          }`}
        >
          {user.isActive ? "Accès ouvert" : "En attente"}
        </span>
      </div>

      <div className="text-right">
        <button
          onClick={() => onSave(user.id, isActive)}
          disabled={isSaving || isCurrentUser}
          className="bg-sbbsNavy text-white px-5 py-3 rounded-2xl font-black uppercase text-[10px] shadow hover:bg-sbbsRed disabled:opacity-50"
        >
          {isSaving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}