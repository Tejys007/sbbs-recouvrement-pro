// src/components/ActivityLogsView.tsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

type LogItem = {
  id: string;
  actor_email?: string | null;
  action?: string | null;
  entity?: string | null;
  entity_id?: string | null;
  created_at?: any;
  message?: string | null;
  metadata?: any;
};

function formatDate(value: any) {
  if (!value) return "-";
  const d = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function normalize(value: any) {
  return String(value || "").trim().toLowerCase();
}

function actionFamily(action?: string | null) {
  const a = normalize(action);

  if (
    a.includes("create") ||
    a.includes("creation") ||
    a.includes("import")
  ) {
    return "CREATE";
  }

  if (
    a.includes("delete") ||
    a.includes("suppression") ||
    a.includes("remove")
  ) {
    return "DELETE";
  }

  if (
    a.includes("update") ||
    a.includes("modification") ||
    a.includes("mise à jour") ||
    a.includes("mise a jour") ||
    a.includes("change") ||
    a.includes("restore")
  ) {
    return "UPDATE";
  }

  return "OTHER";
}

function toMillis(value: any) {
  if (!value) return 0;
  if (value?.toDate) {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export default function ActivityLogsView() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [userFilter, setUserFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "activity_logs"),
      (snap) => {
        const data: LogItem[] = snap.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as any),
        }));

        data.sort((a, b) => toMillis(b.created_at) - toMillis(a.created_at));

        setLogs(data);
        setLoadError(null);
        setLoading(false);
      },
      (err) => {
        console.error("Erreur chargement logs:", err);
        setLoadError(err?.message || "Erreur de lecture du journal d’activité.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const userOptions = useMemo(() => {
    const emails: string[] = Array.from(
      new Set(
        logs
          .map((x) => String(x.actor_email || "").trim())
          .filter((x) => Boolean(x))
      )
    ) as string[];

    return emails.sort((a: string, b: string) => a.localeCompare(b));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const emailOk =
        !userFilter || normalize(log.actor_email) === normalize(userFilter);

      const family = actionFamily(log.action);
      const actionOk = actionFilter === "ALL" ? true : family === actionFilter;

      return emailOk && actionOk;
    });
  }, [logs, userFilter, actionFilter]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <div className="text-3xl font-black text-sbbsNavy uppercase">
            Journal d’activité
          </div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-sbbsText opacity-50 mt-1">
            Historique des actions effectuées dans l’application
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full lg:w-auto">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-sbbsText opacity-60 mb-2">
              Filtrer par utilisateur
            </div>
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="w-full lg:w-[280px] px-4 py-3 rounded-2xl border-2 border-sbbsBorder outline-none font-black text-sbbsNavy"
            >
              <option value="">Tous les utilisateurs</option>
              {userOptions.map((email) => (
                <option key={email} value={email}>
                  {email}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-sbbsText opacity-60 mb-2">
              Filtrer par type d’action
            </div>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full lg:w-[220px] px-4 py-3 rounded-2xl border-2 border-sbbsBorder outline-none font-black text-sbbsNavy"
            >
              <option value="ALL">Toutes</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="OTHER">AUTRES</option>
            </select>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 font-bold text-[12px]">
          {loadError}
        </div>
      )}

      <div className="bg-white rounded-[2.5rem] shadow-2xl border-2 border-sbbsBorder overflow-hidden">
        <div className="p-6 border-b-2 border-sbbsGray">
          <div className="grid grid-cols-5 gap-4 text-[10px] font-black uppercase text-sbbsText opacity-70">
            <div>Utilisateur</div>
            <div>Action</div>
            <div>Type</div>
            <div>Module</div>
            <div>Date</div>
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center font-bold text-sbbsText opacity-60">
            Chargement...
          </div>
        ) : (
          <div className="divide-y-2 divide-sbbsGray">
            {filteredLogs.map((log) => {
              const family = actionFamily(log.action);

              return (
                <div key={log.id} className="p-6 grid grid-cols-5 gap-4 items-start">
                  <div className="font-black text-sbbsNavy text-[12px] break-all">
                    {log.actor_email || "-"}
                  </div>

                  <div className="font-bold text-sbbsText text-[12px]">
                    {log.action || "-"}
                  </div>

                  <div>
                    <span
                      className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase ${
                        family === "CREATE"
                          ? "bg-green-50 border border-green-200 text-green-700"
                          : family === "UPDATE"
                          ? "bg-blue-50 border border-blue-200 text-blue-700"
                          : family === "DELETE"
                          ? "bg-red-50 border border-red-200 text-red-700"
                          : "bg-gray-50 border border-gray-200 text-gray-700"
                      }`}
                    >
                      {family}
                    </span>
                  </div>

                  <div className="font-bold text-sbbsText text-[12px]">
                    {log.entity || "-"}
                  </div>

                  <div className="font-bold text-sbbsText text-[12px]">
                    {formatDate(log.created_at)}
                  </div>

                  {(log.message || log.entity_id) && (
                    <div className="col-span-5 mt-2 rounded-2xl bg-sbbsGray/40 border border-sbbsBorder p-4">
                      {log.message && (
                        <div className="text-[12px] font-bold text-sbbsNavy">
                          {log.message}
                        </div>
                      )}

                      {log.entity_id && (
                        <div className="mt-1 text-[11px] font-bold text-sbbsText opacity-60 break-all">
                          ID : {log.entity_id}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {!loading && filteredLogs.length === 0 && (
              <div className="p-10 text-center text-sbbsText opacity-50 font-bold">
                Aucun log correspondant aux filtres.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}