// src/components/RelancesView.tsx
import React, { useEffect, useMemo, useState } from "react";
import type {
  Promotion,
  Leader,
  EcheancierLeader,
  PaiementImputation,
  Paiement,
} from "../types";
import { DataService } from "../services/dataService";
import { db, auth } from "../firebase";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { logActivity } from "../services/activityLogs";

interface Props {
  promotions: Promotion[];
  leaders: Leader[];
  schedules: EcheancierLeader[];
  imputations: PaiementImputation[];
  paiements: Paiement[];
}

function asNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(v: number) {
  return `${asNumber(v).toLocaleString()} F`;
}

function monthLabel(yyyyMm: string) {
  const [year, month] = String(yyyyMm || "").split("-");
  const months = [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
  ];

  const m = Number(month || 0);
  if (!year || !m || m < 1 || m > 12) return yyyyMm || "";
  return `${months[m - 1]} ${year}`;
}

function buildRelanceMessage(item: any, targetMonth: string) {
  const lines = item.details.map(
    (d: any) => `* ${monthLabel(d.mois)} : ${formatMoney(d.reste)}`
  );

  return `Bonjour Leader ${String(item.nom || "").toUpperCase()},

Sauf erreur de notre part, vous avez un impayé de scolarité arrêté au mois de ${monthLabel(
    targetMonth
  )}.

Détail des échéances non soldées :
${lines.join("\n")}

Total à régulariser : ${formatMoney(item.reste)}

Merci d'effectuer un paiement pour la régularisation de votre situation.

SBBS - Service Recouvrement`;
}

export default function RelancesView({
  promotions,
  leaders,
  schedules,
  imputations,
  paiements,
}: Props) {
  const [selectedPromoId, setSelectedPromoId] = useState("");
  const [targetMonth, setTargetMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );

  const [relanceNotes, setRelanceNotes] = useState<any[]>([]);
  const [selectedLeader, setSelectedLeader] = useState<any | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteErr, setNoteErr] = useState<string | null>(null);
  const [noteMsg, setNoteMsg] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "relance_notes"), orderBy("created_at", "desc")),
      (snap) => {
        setRelanceNotes(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          }))
        );
      }
    );

    return () => unsub();
  }, []);

  const overdueList = useMemo(() => {
    const list: any[] = [];

    const activeLeaders = leaders.filter(
      (l) =>
        l.statut === "ACTIF" &&
        (selectedPromoId ? l.promotion_id === selectedPromoId : true)
    );

    activeLeaders.forEach((leader) => {
      const leaderEcheances = schedules
        .filter((s) => s.leader_id === leader.id && s.mois <= targetMonth)
        .sort((a, b) => String(a.mois).localeCompare(String(b.mois)));

      let totalDu = 0;
      let totalPaye = 0;
      const details: Array<{
        mois: string;
        attendu: number;
        paye: number;
        reste: number;
      }> = [];

      leaderEcheances.forEach((sch) => {
        const paid = imputations
          .filter(
            (imp) =>
              String(
                (imp as any).echeance_leader_id || (imp as any).echeance_id || ""
              ) === sch.id
          )
          .reduce((sum, imp) => sum + asNumber(imp.montant_impute), 0);

        const attendu = asNumber(sch.montant_attendu);
        const reste = Math.max(0, attendu - paid);

        totalDu += attendu;
        totalPaye += paid;

        if (reste > 0) {
          details.push({
            mois: sch.mois,
            attendu,
            paye: paid,
            reste,
          });
        }
      });

      const resteGlobal = Math.max(0, totalDu - totalPaye);

      if (resteGlobal > 0) {
        const promoName =
          promotions.find((p) => p.id === leader.promotion_id)?.nom_promotion ||
          "???";

        const item = {
          leaderId: leader.id,
          matricule: leader.matricule,
          nom: leader.nom_complet,
          telephone: leader.telephone,
          reste: resteGlobal,
          promo: promoName,
          details,
        };

        list.push({
          ...item,
          message: buildRelanceMessage(item, targetMonth),
        });
      }
    });

    return list.sort((a, b) => b.reste - a.reste);
  }, [leaders, schedules, imputations, targetMonth, selectedPromoId, promotions]);

  const notesForSelectedLeader = useMemo(() => {
    if (!selectedLeader) return [];
    return relanceNotes.filter((n) => n.leader_id === selectedLeader.leaderId);
  }, [relanceNotes, selectedLeader]);

  const handleExport = () => {
    DataService.exportRelancesExcel(overdueList, targetMonth);
  };

  async function handleCopyMessage(message: string) {
    try {
      await navigator.clipboard.writeText(message);
      setCopyMsg("Message copié.");
      setTimeout(() => setCopyMsg(null), 2000);
    } catch {
      setCopyMsg("Impossible de copier le message.");
      setTimeout(() => setCopyMsg(null), 2000);
    }
  }

  function openSms(phone: string, message: string) {
    const safePhone = String(phone || "").replace(/\s/g, "");
    const encoded = encodeURIComponent(message);
    window.open(`sms:${safePhone}?body=${encoded}`, "_blank");
  }

  function openWhatsApp(phone: string, message: string) {
    const safePhone = String(phone || "").replace(/\s/g, "");
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${safePhone}?text=${encoded}`, "_blank");
  }

  async function saveNote() {
    const currentLeader = selectedLeader;
    if (!currentLeader) return;

    const safeText = String(noteText || "").trim();
    if (!safeText) {
      setNoteErr("Veuillez saisir une observation.");
      return;
    }

    setSavingNote(true);
    setNoteErr(null);
    setNoteMsg(null);

    try {
      const user = auth.currentUser;

      await addDoc(collection(db, "relance_notes"), {
        leader_id: currentLeader.leaderId,
        leader_nom: currentLeader.nom,
        leader_telephone: currentLeader.telephone,
        promotion_nom: currentLeader.promo,
        target_month: targetMonth,
        note: safeText,
        actor_uid: user?.uid || null,
        actor_email: user?.email || null,
        created_at: serverTimestamp(),
      });

      await logActivity({
        action: "CREATE_RELANCE_NOTE",
        entity: "relance_notes",
        entity_id: currentLeader.leaderId,
        message: `Ajout d'une observation de relance pour ${currentLeader.nom}`,
        metadata: {
          leader_id: currentLeader.leaderId,
          target_month: targetMonth,
          note: safeText,
        },
      });

      setNoteText("");
      setNoteMsg("Observation enregistrée avec succès.");
    } catch (e: any) {
      setNoteErr(
        e?.message || "Erreur lors de l'enregistrement de l'observation."
      );
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-6">
        <div>
          <h2 className="text-3xl font-black text-sbbsNavy uppercase tracking-tighter">
            Gestion des Impayés
          </h2>
          <p className="text-xs text-sbbsText font-bold uppercase opacity-40">
            Mois de référence : {targetMonth}
          </p>
        </div>

        <button
          onClick={handleExport}
          disabled={overdueList.length === 0}
          className="bg-sbbsGreen text-white px-10 py-5 rounded-2xl font-black shadow-xl text-xs uppercase hover:scale-105 transition-all flex items-center gap-3 disabled:opacity-30"
        >
          Exporter vers Excel
        </button>
      </div>

      <div className="bg-white p-8 rounded-[3rem] border-4 border-white shadow-xl flex flex-col sm:flex-row gap-6">
        <div className="flex-1">
          <label className="text-[10px] font-black uppercase text-sbbsNavy opacity-40 ml-2">
            Période cible
          </label>
          <input
            type="month"
            value={targetMonth}
            onChange={(e) => setTargetMonth(e.target.value)}
            className="w-full bg-sbbsGray border-4 border-sbbsGray rounded-2xl px-6 py-4 font-black text-sbbsNavy outline-none focus:border-sbbsNavy"
          />
        </div>

        <div className="flex-1">
          <label className="text-[10px] font-black uppercase text-sbbsNavy opacity-40 ml-2">
            Filtrer par Promo
          </label>
          <select
            value={selectedPromoId}
            onChange={(e) => setSelectedPromoId(e.target.value)}
            className="w-full bg-sbbsGray border-4 border-sbbsGray rounded-2xl px-6 py-4 font-black text-sbbsNavy outline-none focus:border-sbbsNavy"
          >
            <option value="">Toutes les promotions...</option>
            {promotions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom_promotion}
              </option>
            ))}
          </select>
        </div>
      </div>

      {copyMsg && (
        <div className="p-4 rounded-2xl bg-green-50 border border-green-200 text-green-700 text-[12px] font-bold">
          {copyMsg}
        </div>
      )}

      <div className="bg-white rounded-[3rem] border-4 border-white shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[1200px]">
            <thead className="bg-sbbsGray text-[10px] font-black uppercase text-sbbsText border-b-4 border-sbbsGray">
              <tr>
                <th className="px-8 py-4">Leader</th>
                <th className="px-8 py-4">Promotion</th>
                <th className="px-8 py-4">Détail impayés</th>
                <th className="px-8 py-4 text-right">Reste dû</th>
                <th className="px-8 py-4 text-center">Messages</th>
                <th className="px-8 py-4 text-center">Historique</th>
              </tr>
            </thead>

            <tbody className="divide-y-4 divide-sbbsGray">
              {overdueList.map((item, i) => (
                <tr key={i} className="hover:bg-sbbsGray/30 transition-colors">
                  <td className="px-8 py-5">
                    <div className="font-black text-sbbsNavy uppercase text-xs">
                      {item.nom}
                    </div>
                    <div className="text-[10px] font-black text-sbbsRed">
                      {item.telephone}
                    </div>
                  </td>

                  <td className="px-8 py-5 text-[10px] font-black uppercase text-sbbsText italic">
                    {item.promo}
                  </td>

                  <td className="px-8 py-5">
                    <div className="space-y-1">
                      {item.details.map((d: any, idx: number) => (
                        <div key={idx} className="text-[11px] font-bold text-sbbsText">
                          {monthLabel(d.mois)} : {formatMoney(d.reste)}
                        </div>
                      ))}
                    </div>
                  </td>

                  <td className="px-8 py-5 text-right font-black text-sbbsRed text-base">
                    {formatMoney(item.reste)}
                  </td>

                  <td className="px-8 py-5">
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleCopyMessage(item.message)}
                        className="bg-sbbsNavy text-white px-4 py-3 rounded-2xl text-[10px] font-black uppercase shadow hover:bg-sbbsRed"
                      >
                        Copier message
                      </button>

                      <button
                        onClick={() => openSms(item.telephone, item.message)}
                        className="bg-sbbsGreen text-white px-4 py-3 rounded-2xl text-[10px] font-black uppercase shadow hover:opacity-90"
                      >
                        Ouvrir SMS
                      </button>

                      <button
                        onClick={() => openWhatsApp(item.telephone, item.message)}
                        className="bg-green-600 text-white px-4 py-3 rounded-2xl text-[10px] font-black uppercase shadow hover:opacity-90"
                      >
                        WhatsApp
                      </button>
                    </div>
                  </td>

                  <td className="px-8 py-5 text-center">
                    <button
                      onClick={() => {
                        setSelectedLeader(item);
                        setNoteErr(null);
                        setNoteMsg(null);
                        setNoteText("");
                      }}
                      className="bg-white border-2 border-sbbsNavy text-sbbsNavy px-5 py-3 rounded-2xl text-[10px] font-black uppercase shadow hover:bg-sbbsNavy hover:text-white"
                    >
                      Appel / Historique
                    </button>
                  </td>
                </tr>
              ))}

              {overdueList.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-8 py-20 text-center opacity-30 font-black uppercase"
                  >
                    Aucun impayé sur cette période.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedLeader && (
        <div className="fixed inset-0 z-[400] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-5xl rounded-[2rem] p-8 border-2 border-sbbsBorder shadow-2xl max-h-[90vh] overflow-auto">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-2xl font-black text-sbbsNavy uppercase">
                  Historique de relance
                </div>
                <div className="text-[11px] font-bold text-sbbsText opacity-60 mt-2 uppercase">
                  {selectedLeader.nom} — {selectedLeader.telephone}
                </div>
              </div>

              <button
                onClick={() => setSelectedLeader(null)}
                className="text-sbbsNavy text-3xl font-black"
              >
                ×
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="bg-sbbsGray rounded-2xl p-5">
                  <div className="text-[10px] font-black uppercase text-sbbsText opacity-60 mb-2">
                    Détail des échéances non soldées
                  </div>
                  <div className="space-y-2">
                    {selectedLeader.details.map((d: any, idx: number) => (
                      <div key={idx} className="text-[12px] font-bold text-sbbsNavy">
                        {monthLabel(d.mois)} : {formatMoney(d.reste)}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 text-sm font-black text-sbbsRed uppercase">
                    Total à relancer : {formatMoney(selectedLeader.reste)}
                  </div>
                </div>

                <div className="bg-white border-2 border-sbbsBorder rounded-2xl p-5">
                  <div className="text-lg font-black text-sbbsNavy uppercase">
                    Message automatique
                  </div>

                  <textarea
                    readOnly
                    value={selectedLeader.message}
                    rows={12}
                    className="mt-4 w-full rounded-2xl border-2 border-sbbsGray px-5 py-4 font-bold text-sbbsNavy outline-none bg-sbbsGray/20"
                  />

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={() => handleCopyMessage(selectedLeader.message)}
                      className="bg-sbbsNavy text-white px-5 py-3 rounded-2xl font-black uppercase text-xs hover:bg-sbbsRed"
                    >
                      Copier le message
                    </button>

                    <button
                      onClick={() =>
                        openSms(selectedLeader.telephone, selectedLeader.message)
                      }
                      className="bg-sbbsGreen text-white px-5 py-3 rounded-2xl font-black uppercase text-xs hover:opacity-90"
                    >
                      Ouvrir SMS
                    </button>

                    <button
                      onClick={() =>
                        openWhatsApp(
                          selectedLeader.telephone,
                          selectedLeader.message
                        )
                      }
                      className="bg-green-600 text-white px-5 py-3 rounded-2xl font-black uppercase text-xs hover:opacity-90"
                    >
                      WhatsApp
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-lg font-black text-sbbsNavy uppercase">
                    Nouvelle observation
                  </div>

                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows={5}
                    placeholder="Saisir ici l'observation de l'appel..."
                    className="mt-4 w-full rounded-2xl border-2 border-sbbsGray px-5 py-4 font-bold text-sbbsNavy outline-none focus:border-sbbsNavy"
                  />

                  {noteErr && (
                    <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
                      {noteErr}
                    </div>
                  )}

                  {noteMsg && (
                    <div className="mt-4 p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-xs font-bold">
                      {noteMsg}
                    </div>
                  )}

                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={saveNote}
                      disabled={savingNote}
                      className="bg-sbbsNavy text-white px-5 py-3 rounded-2xl font-black uppercase text-xs hover:bg-sbbsRed disabled:opacity-50"
                    >
                      {savingNote
                        ? "Enregistrement..."
                        : "Enregistrer l'observation"}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-lg font-black text-sbbsNavy uppercase mb-4">
                  Historique des conversations
                </div>

                <div className="space-y-4">
                  {notesForSelectedLeader.map((note) => (
                    <div
                      key={note.id}
                      className="rounded-2xl border border-sbbsBorder bg-sbbsGray/30 p-4"
                    >
                      <div className="text-[10px] font-black uppercase text-sbbsText opacity-60">
                        {note.actor_email || "Utilisateur inconnu"}
                      </div>
                      <div className="text-[10px] font-bold text-sbbsText opacity-50 mt-1">
                        {note.created_at?.seconds
                          ? new Date(
                              note.created_at.seconds * 1000
                            ).toLocaleString()
                          : "Date en attente..."}
                      </div>
                      <div className="mt-3 text-[12px] font-bold text-sbbsNavy whitespace-pre-wrap">
                        {note.note}
                      </div>
                    </div>
                  ))}

                  {notesForSelectedLeader.length === 0 && (
                    <div className="p-6 rounded-2xl bg-sbbsGray text-center text-sbbsText font-bold opacity-60">
                      Aucune observation enregistrée pour ce leader.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}