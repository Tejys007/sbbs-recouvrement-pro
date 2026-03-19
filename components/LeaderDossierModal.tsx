// src/components/LeaderDossierModal.tsx
import React, { useEffect, useMemo, useState } from "react";
import type {
  EcheancierLeader,
  Leader,
  Paiement,
  PaiementImputation,
  Promotion,
} from "../types";
import { recomputeLeaderEcheancier } from "../services/echeancierLeaders";
import {
  permanentlyDeleteLeader,
  restoreLeader,
  softDeleteLeader,
} from "../services/leaders";
import { computeRiskFromOverdueRows } from "../services/riskScoring";
import { db } from "../firebase";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

type StatusLeader = "ACTIF" | "ATTENTE" | "ABANDON";

interface Props {
  leaderId: string;
  leaders: Leader[];
  promotions: Promotion[];
  schedules: EcheancierLeader[];
  paiements: Paiement[];
  imputations: PaiementImputation[];
  onClose: () => void;
  onSaveEcheance: (
    echeanceId: string,
    patch: { montant_attendu?: number; date_limite?: string }
  ) => Promise<void> | void;
  onChangeStatus: (
    leaderId: string,
    statut: StatusLeader
  ) => Promise<void> | void;
  onDeleteLeader?: (leaderId: string) => Promise<void> | void;
  readOnly?: boolean;
  canPermanentDelete?: boolean;
}

function asNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(v: number) {
  return `${asNumber(v).toLocaleString()} F`;
}

function firstLetter(value?: string) {
  const s = String(value || "").trim();
  return s ? s[0].toUpperCase() : "L";
}

function formatDateTime(value: any) {
  if (!value) return "-";
  const d = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function formatDateOnly(value: any) {
  if (!value) return "-";
  if (typeof value === "string" && value.length >= 10) return value;
  const d = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toISOString().slice(0, 10);
}

function monthLabel(yyyyMm?: string) {
  const value = String(yyyyMm || "");
  const [year, month] = value.split("-");
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
  if (!year || !m || m < 1 || m > 12) return value || "-";
  return `${months[m - 1]} ${year}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function LeaderDossierModal(props: Props) {
  const readOnly = props.readOnly === true;
  const canPermanentDelete = props.canPermanentDelete === true;
  const [relanceNotes, setRelanceNotes] = useState<any[]>([]);

  const leader = useMemo(
    () => props.leaders.find((l) => l.id === props.leaderId) || null,
    [props.leaders, props.leaderId]
  );

  const promo = useMemo(() => {
    if (!leader?.promotion_id) return null;
    return props.promotions.find((p) => p.id === leader.promotion_id) || null;
  }, [leader, props.promotions]);

  useEffect(() => {
    const q = query(
      collection(db, "relance_notes"),
      orderBy("created_at", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const notes = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }))
        .filter((n) => String(n.leader_id || "") === String(props.leaderId || ""));

      setRelanceNotes(notes);
    });

    return () => unsub();
  }, [props.leaderId]);

  const leaderSchedules = useMemo(() => {
    if (!leader) return [];

    return props.schedules
      .filter((s) => s.leader_id === leader.id)
      .slice()
      .sort((a, b) => {
        const byMonth = String(a.mois || "").localeCompare(String(b.mois || ""));
        if (byMonth !== 0) return byMonth;
        return String(a.date_limite || "").localeCompare(
          String(b.date_limite || "")
        );
      });
  }, [props.schedules, leader]);

  const paidByScheduleId = useMemo(() => {
    const map = new Map<string, number>();

    for (const imp of props.imputations) {
      if (!leader) continue;
      if (String(imp.leader_id || "") !== leader.id) continue;
      if (String((imp as any).status || "ACTIF") === "ANNULE") continue;

      const schedId = String(
        (imp as any).echeance_leader_id || (imp as any).echeance_id || ""
      );

      const prev = asNumber(map.get(schedId) || 0);
      map.set(schedId, prev + asNumber(imp.montant_impute));
    }

    return map;
  }, [props.imputations, leader]);

  const today = todayIso();

  const rows = useMemo(() => {
    return leaderSchedules.map((s) => {
      const expected = asNumber((s as any).montant_attendu);
      const paid = asNumber(paidByScheduleId.get(s.id) || 0);
      const remain = Math.max(0, expected - paid);

      let statut: "PAYE" | "PARTIEL" | "NON PAYE" = "NON PAYE";
      if (paid >= expected && expected > 0) {
        statut = "PAYE";
      } else if (paid > 0 && paid < expected) {
        statut = "PARTIEL";
      }

      const dueDate = String((s as any).date_limite || "");
      const isOverdue = Boolean(dueDate) && dueDate <= today;

      return {
        ...s,
        expected,
        paid,
        remain,
        statut,
        isOverdue,
      };
    });
  }, [leaderSchedules, paidByScheduleId, today]);

  const leaderPaiements = useMemo(() => {
    if (!leader) return [];

    return props.paiements
      .filter((p) => String((p as any).leader_id || "") === leader.id)
      .slice()
      .sort((a, b) => {
        const byDate = String(
          (b as any).date_paiement || (b as any).date_valeur || ""
        ).localeCompare(
          String((a as any).date_paiement || (a as any).date_valeur || "")
        );

        if (byDate !== 0) return byDate;

        return String((b as any).created_at?.seconds || "").localeCompare(
          String((a as any).created_at?.seconds || "")
        );
      });
  }, [props.paiements, leader]);

  const scolariteBase = asNumber((leader as any)?.scolarite_base ?? 370000);
  const currentBourse = asNumber((leader as any)?.bourse_montant ?? 0);

  const totalAttendu = rows.reduce((sum, r) => sum + asNumber(r.expected), 0);
  const totalVerse = rows.reduce((sum, r) => sum + asNumber(r.paid), 0);
  const totalRestantEcheancier = rows.reduce(
    (sum, r) => sum + asNumber(r.remain),
    0
  );

  const netAPayer = Math.max(0, scolariteBase - currentBourse);
  const resteNet = Math.max(0, netAPayer - totalVerse);

  const nbRelances = relanceNotes.length;

  const dernierPaiement = leaderPaiements.length > 0 ? leaderPaiements[0] : null;
  const derniereRelance = relanceNotes.length > 0 ? relanceNotes[0] : null;

  const overdueRows = useMemo(() => {
    return rows.filter((r) => r.isOverdue && r.remain > 0);
  }, [rows]);

  const overdueAmount = overdueRows.reduce(
    (sum, r) => sum + asNumber(r.remain),
    0
  );

  const riskMeta = useMemo(() => {
    return computeRiskFromOverdueRows(
      overdueRows.map((r) => ({
        expected: r.expected,
        paid: r.paid,
        remain: r.remain,
      }))
    );
  }, [overdueRows]);

  const niveauRisque = riskMeta.level;
  const isDeleted = (leader as any)?.deleted === true;

  const [editMode, setEditMode] = useState(false);
  const [bourseInput, setBourseInput] = useState<number>(currentBourse);
  const [scolariteInput, setScolariteInput] = useState<number>(scolariteBase);
  const [nameInput, setNameInput] = useState<string>(
    String((leader as any)?.nom_complet || "")
  );
  const [phoneInput, setPhoneInput] = useState<string>(
    String((leader as any)?.telephone || "")
  );
  const [amountsDraft, setAmountsDraft] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    setBourseInput(currentBourse);
    setScolariteInput(scolariteBase);
    setNameInput(String((leader as any)?.nom_complet || ""));
    setPhoneInput(String((leader as any)?.telephone || ""));

    const nextDraft: Record<string, number> = {};
    for (const r of rows) {
      nextDraft[r.id] = asNumber(r.expected);
    }
    setAmountsDraft(nextDraft);
  }, [currentBourse, scolariteBase, rows, leader]);

  if (!leader) return null;

  async function activateEditMode() {
    if (readOnly || isDeleted) return;
    setErr(null);
    setOk(null);
    setEditMode(true);
  }

  async function saveProfile() {
    if (readOnly || isDeleted) return;

    if (!leader?.promotion_id) {
      setErr("Le leader n’est rattaché à aucune promotion.");
      return;
    }

    setSaving(true);
    setErr(null);
    setOk(null);

    try {
      await updateDoc(doc(db, "leaders", leader.id), {
        nom_complet: String(nameInput || "").trim().toUpperCase(),
        telephone: String(phoneInput || "").trim(),
        scolarite_base: asNumber(scolariteInput),
        bourse_montant: asNumber(bourseInput),
        updated_at: serverTimestamp(),
        updated_by_uid: null,
        updated_by_email: null,
      } as any);

      await recomputeLeaderEcheancier({
        leaderId: leader.id,
        promotionId: leader.promotion_id,
        scolarite_base: asNumber(scolariteInput),
        bourse_montant: asNumber(bourseInput),
        preserveFirstAmount: true,
        defaultFirstAmount: 70000,
      } as any);

      for (const r of rows) {
        const draftAmount = asNumber(amountsDraft[r.id]);
        if (draftAmount !== asNumber(r.expected)) {
          await props.onSaveEcheance(r.id, {
            montant_attendu: draftAmount,
            date_limite: (r as any).date_limite,
          });
        }
      }

      setEditMode(false);
      setOk("Profil et échéancier enregistrés.");
    } catch (e: any) {
      setErr(e?.message || "Erreur lors de l’enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(statut: StatusLeader) {
    if (readOnly || isDeleted) return;

    setSaving(true);
    setErr(null);
    setOk(null);

    try {
      await props.onChangeStatus(leader.id, statut);
      setOk(`Statut mis à jour : ${statut}`);
    } catch (e: any) {
      setErr(e?.message || "Erreur changement statut.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSoftDelete() {
    if (readOnly || isDeleted) return;

    const confirmText = window.prompt(
      "Pour envoyer ce leader dans la corbeille, tapez SUPPRIMER"
    );
    if (confirmText !== "SUPPRIMER") return;

    setSaving(true);
    setErr(null);
    setOk(null);

    try {
      await softDeleteLeader(leader.id);
      props.onClose();
    } catch (e: any) {
      setErr(e?.message || "Erreur suppression logique leader.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRestore() {
    if (readOnly || !isDeleted) return;

    setSaving(true);
    setErr(null);
    setOk(null);

    try {
      await restoreLeader(leader.id);
      setOk("Leader restauré avec succès.");
    } catch (e: any) {
      setErr(e?.message || "Erreur restauration leader.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePermanentDelete() {
    if (readOnly || !canPermanentDelete) return;

    const confirmText = window.prompt(
      "Pour supprimer définitivement ce leader, tapez SUPPRIMER DEFINITIVEMENT"
    );
    if (confirmText !== "SUPPRIMER DEFINITIVEMENT") return;

    setSaving(true);
    setErr(null);
    setOk(null);

    try {
      await permanentlyDeleteLeader(leader.id);
      props.onClose();
    } catch (e: any) {
      setErr(e?.message || "Erreur suppression définitive leader.");
    } finally {
      setSaving(false);
    }
  }

  const previewResteNet = Math.max(
    0,
    asNumber(scolariteInput) - asNumber(bourseInput) - totalVerse
  );

  return (
    <div className="fixed inset-0 z-[300] bg-sbbsNavy/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-[1560px] h-[94vh] bg-[#F5F6F8] rounded-[2rem] border-4 border-white shadow-2xl overflow-hidden flex flex-col">
        <div className="bg-sbbsNavy px-10 py-8 flex items-start justify-between">
          <div className="flex items-start gap-6">
            <div className="w-28 h-28 rounded-[1.5rem] bg-white/10 border border-white/20 flex items-center justify-center text-white text-5xl font-black">
              {firstLetter(leader.nom_complet)}
            </div>

            <div className="pt-1">
              <div className="text-white text-3xl font-black uppercase tracking-tight">
                {leader.nom_complet}
              </div>

              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <span className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-black uppercase leading-none">
                  {leader.matricule}
                </span>

                <span className="text-white/85 text-xl font-bold">
                  {leader.telephone || ""}
                </span>

                <span
                  className={`px-4 py-2 rounded-lg text-sm font-black uppercase leading-none ${
                    leader.statut === "ACTIF"
                      ? "bg-sbbsGreen text-white"
                      : leader.statut === "ATTENTE"
                      ? "bg-sbbsNavy border border-white/30 text-white"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {leader.statut}
                </span>

                <span className="px-4 py-2 rounded-lg text-sm font-black uppercase leading-none bg-white/10 text-white border border-white/20">
                  {promo?.nom_promotion || "Sans promotion"}
                </span>

                <span
                  className={`px-4 py-2 rounded-lg text-sm font-black uppercase leading-none ${
                    riskMeta.level === "CRITIQUE"
                      ? "bg-red-100 text-red-700"
                      : riskMeta.level === "ÉLEVÉ"
                      ? "bg-orange-100 text-orange-700"
                      : riskMeta.level === "SURVEILLANCE"
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  Risque {niveauRisque}
                </span>

                {isDeleted && (
                  <span className="px-4 py-2 rounded-lg text-sm font-black uppercase leading-none bg-red-100 text-red-700">
                    SUPPRIMÉ
                  </span>
                )}

                {readOnly && (
                  <span className="px-4 py-2 rounded-lg text-sm font-black uppercase leading-none bg-blue-100 text-blue-800">
                    Lecture seule
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={props.onClose}
            className="text-white/70 hover:text-white text-5xl leading-none"
            title="Fermer"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-auto px-10 py-8 space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-5">
            <div className="bg-white rounded-[1.7rem] shadow-xl border border-sbbsBorder p-6">
              <div className="text-[10px] font-black uppercase text-sbbsText opacity-50">
                Base scolarité
              </div>
              <div className="mt-3 text-2xl font-black text-sbbsNavy">
                {formatMoney(scolariteBase)}
              </div>
            </div>

            <div className="bg-white rounded-[1.7rem] shadow-xl border border-sbbsBorder p-6">
              <div className="text-[10px] font-black uppercase text-sbbsText opacity-50">
                Bourse / Remise
              </div>
              <div className="mt-3 text-2xl font-black text-red-600">
                -{asNumber(currentBourse).toLocaleString()} F
              </div>
            </div>

            <div className="bg-white rounded-[1.7rem] shadow-xl border border-sbbsBorder p-6">
              <div className="text-[10px] font-black uppercase text-sbbsText opacity-50">
                Net à payer
              </div>
              <div className="mt-3 text-2xl font-black text-sbbsNavy">
                {formatMoney(netAPayer)}
              </div>
            </div>

            <div className="bg-white rounded-[1.7rem] shadow-xl border border-sbbsBorder p-6">
              <div className="text-[10px] font-black uppercase text-sbbsText opacity-50">
                Total versé
              </div>
              <div className="mt-3 text-2xl font-black text-sbbsGreen">
                {formatMoney(totalVerse)}
              </div>
            </div>

            <div className="bg-white rounded-[1.7rem] shadow-xl border border-sbbsBorder p-6">
              <div className="text-[10px] font-black uppercase text-sbbsText opacity-50">
                Reste à payer
              </div>
              <div className="mt-3 text-2xl font-black text-sbbsRed">
                {formatMoney(resteNet)}
              </div>
            </div>

            <div className="bg-white rounded-[1.7rem] shadow-xl border border-sbbsBorder p-6">
              <div className="text-[10px] font-black uppercase text-sbbsText opacity-50">
                Nombre de relances
              </div>
              <div className="mt-3 text-2xl font-black text-sbbsNavy">
                {nbRelances}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[430px_1fr] gap-10 items-start">
            <div className="space-y-6">
              <div className="bg-white rounded-[2rem] shadow-xl border border-sbbsBorder p-8">
                <div className="text-sbbsNavy text-xl font-black uppercase tracking-[0.15em] flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-sbbsNavy inline-block" />
                  PROFIL & AJUSTEMENTS
                </div>

                <div className="border-t mt-4 pt-8 space-y-6">
                  <div>
                    <div className="text-sbbsText/50 text-sm font-black uppercase">
                      Nom complet
                    </div>
                    {!editMode ? (
                      <div className="mt-2 text-sbbsNavy text-xl font-black uppercase">
                        {leader.nom_complet}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value.toUpperCase())}
                        className="mt-3 w-full px-5 py-4 rounded-2xl border-4 border-sbbsNavy text-sbbsNavy text-lg font-black outline-none bg-white"
                      />
                    )}
                  </div>

                  <div>
                    <div className="text-sbbsText/50 text-sm font-black uppercase">
                      Téléphone
                    </div>
                    {!editMode ? (
                      <div className="mt-2 text-sbbsNavy text-xl font-black">
                        {leader.telephone}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        className="mt-3 w-full px-5 py-4 rounded-2xl border-4 border-sbbsNavy text-sbbsNavy text-lg font-black outline-none bg-white"
                      />
                    )}
                  </div>

                  <div>
                    <div className="text-sbbsText/50 text-sm font-black uppercase">
                      Promotion
                    </div>
                    <div className="mt-2 text-sbbsNavy text-xl font-black uppercase">
                      {promo?.nom_promotion || "Sans promotion"}
                    </div>
                  </div>

                  <div>
                    <div className="text-sbbsText/50 text-sm font-black uppercase">
                      Base scolarité
                    </div>
                    {!editMode ? (
                      <div className="mt-2 text-sbbsNavy text-2xl font-black">
                        {formatMoney(scolariteBase)}
                      </div>
                    ) : (
                      <input
                        type="number"
                        value={scolariteInput}
                        onChange={(e) => setScolariteInput(asNumber(e.target.value))}
                        className="mt-3 w-full px-5 py-4 rounded-2xl border-4 border-sbbsNavy text-sbbsNavy text-xl font-black outline-none bg-white"
                      />
                    )}
                  </div>
                </div>

                <div className="mt-8 bg-sbbsGray rounded-[1.5rem] border border-sbbsBorder p-6">
                  <div className="text-sbbsNavy text-sm font-black uppercase">
                    Bourse / Remise (F)
                  </div>

                  {!editMode ? (
                    <div className="mt-6 text-red-600 text-2xl font-black">
                      -{asNumber(currentBourse).toLocaleString()} F
                    </div>
                  ) : (
                    <input
                      type="number"
                      value={bourseInput}
                      onChange={(e) => setBourseInput(asNumber(e.target.value))}
                      className="mt-5 w-full px-5 py-4 rounded-2xl border-4 border-sbbsNavy text-sbbsNavy text-xl font-black outline-none bg-white"
                    />
                  )}
                </div>

                <div className="mt-8 bg-sbbsNavy text-white rounded-[1.5rem] px-6 py-6 flex items-center justify-between">
                  <div className="text-sm font-black uppercase leading-tight">
                    RESTE NET
                  </div>
                  <div className="text-3xl font-black">
                    {formatMoney(editMode ? previewResteNet : resteNet)}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[2rem] shadow-xl border border-sbbsBorder p-8">
                <div className="text-sbbsNavy text-xl font-black uppercase tracking-[0.15em] flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-sbbsGreen inline-block" />
                  SYNTHÈSE RECOUVREMENT
                </div>

                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-black uppercase text-sbbsText/60">
                      Total attendu
                    </div>
                    <div className="text-lg font-black text-sbbsNavy">
                      {formatMoney(totalAttendu)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-sm font-black uppercase text-sbbsText/60">
                      Total encaissé
                    </div>
                    <div className="text-lg font-black text-sbbsGreen">
                      {formatMoney(totalVerse)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-sm font-black uppercase text-sbbsText/60">
                      Reliquat échéancier
                    </div>
                    <div className="text-lg font-black text-sbbsRed">
                      {formatMoney(totalRestantEcheancier)}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-sbbsBorder flex items-center justify-between">
                    <div className="text-sm font-black uppercase text-sbbsText/60">
                      Reste échu en retard
                    </div>
                    <div className="text-lg font-black text-sbbsRed">
                      {formatMoney(overdueAmount)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-sm font-black uppercase text-sbbsText/60">
                      Mensualités échues en retard
                    </div>
                    <div className="text-lg font-black text-sbbsRed">
                      {riskMeta.overdueCount}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-sm font-black uppercase text-sbbsText/60">
                      Non payées
                    </div>
                    <div className="text-lg font-black text-sbbsRed">
                      {riskMeta.unpaidCount}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-sm font-black uppercase text-sbbsText/60">
                      Partielles
                    </div>
                    <div className="text-lg font-black text-orange-600">
                      {riskMeta.partialCount}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-sm font-black uppercase text-sbbsText/60">
                      Taux moyen de couverture
                    </div>
                    <div className="text-lg font-black text-sbbsNavy">
                      {riskMeta.averageCoverageRate.toFixed(1)}%
                    </div>
                  </div>

                  <div className="pt-3 border-t border-sbbsBorder flex items-center justify-between">
                    <div className="text-sm font-black uppercase text-sbbsText/60">
                      Dernier paiement
                    </div>
                    <div className="text-sm font-black text-sbbsNavy">
                      {dernierPaiement
                        ? formatDateOnly(
                            (dernierPaiement as any).date_paiement ||
                              (dernierPaiement as any).date_valeur
                          )
                        : "-"}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-sm font-black uppercase text-sbbsText/60">
                      Dernière relance
                    </div>
                    <div className="text-sm font-black text-sbbsNavy">
                      {derniereRelance
                        ? formatDateTime(derniereRelance.created_at)
                        : "-"}
                    </div>
                  </div>
                </div>
              </div>

              {!editMode ? (
                <>
                  {!readOnly ? (
                    <>
                      {!isDeleted && (
                        <>
                          <button
                            onClick={activateEditMode}
                            className="w-full bg-sbbsNavy text-white py-7 rounded-[1.5rem] font-black uppercase text-xl shadow-lg"
                          >
                            AJUSTER PROFIL & ÉCHÉANCIER
                          </button>

                          <div className="grid grid-cols-2 gap-4">
                            <button
                              onClick={() => changeStatus("ABANDON")}
                              disabled={saving}
                              className="w-full border-4 border-red-500 text-red-500 bg-white py-5 rounded-[1.5rem] font-black uppercase text-lg"
                            >
                              ABANDON
                            </button>

                            <button
                              onClick={() => changeStatus("ATTENTE")}
                              disabled={saving}
                              className="w-full border-4 border-sbbsNavy text-sbbsNavy bg-white py-5 rounded-[1.5rem] font-black uppercase text-lg"
                            >
                              METTRE EN ATTENTE
                            </button>
                          </div>

                          <button
                            onClick={handleSoftDelete}
                            disabled={saving}
                            className="w-full bg-orange-500 text-white py-5 rounded-[1.5rem] font-black uppercase text-lg shadow-lg"
                          >
                            ENVOYER À LA CORBEILLE
                          </button>
                        </>
                      )}

                      {isDeleted && (
                        <div className="grid grid-cols-1 gap-4">
                          <button
                            onClick={handleRestore}
                            disabled={saving}
                            className="w-full bg-sbbsGreen text-white py-5 rounded-[1.5rem] font-black uppercase text-lg shadow-lg"
                          >
                            RESTAURER
                          </button>

                          {canPermanentDelete && (
                            <button
                              onClick={handlePermanentDelete}
                              disabled={saving}
                              className="w-full bg-red-600 text-white py-5 rounded-[1.5rem] font-black uppercase text-lg shadow-lg"
                            >
                              SUPPRIMER DÉFINITIVEMENT
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-full bg-blue-50 text-blue-800 py-6 rounded-[1.5rem] font-black uppercase text-center text-sm border border-blue-200">
                      Mode lecture seule
                    </div>
                  )}
                </>
              ) : (
                !readOnly &&
                !isDeleted && (
                  <button
                    onClick={saveProfile}
                    disabled={saving}
                    className="w-full bg-sbbsGreen text-white py-7 rounded-[1.5rem] font-black uppercase text-xl shadow-lg"
                  >
                    {saving ? "ENREGISTREMENT..." : "ENREGISTRER LE PROFIL"}
                  </button>
                )
              )}

              {err && (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
                  {err}
                </div>
              )}

              {ok && (
                <div className="p-4 rounded-2xl bg-green-50 border border-green-200 text-green-700 text-sm font-bold">
                  {ok}
                </div>
              )}
            </div>

            <div className="space-y-8">
              <div className="bg-white rounded-[2rem] shadow-xl border border-sbbsBorder overflow-hidden">
                <div className="px-8 py-8 flex justify-between items-center">
                  <div className="text-sbbsNavy text-2xl font-black italic uppercase tracking-wide">
                    CALENDRIER DE RÈGLEMENT
                  </div>

                  {editMode && !readOnly && !isDeleted && (
                    <div className="text-red-400 text-sm font-black uppercase">
                      Mode édition activé
                    </div>
                  )}

                  {readOnly && (
                    <div className="text-blue-700 text-sm font-black uppercase">
                      Lecture seule
                    </div>
                  )}
                </div>

                <table className="w-full">
                  <thead className="bg-sbbsGray text-sbbsText">
                    <tr className="text-left">
                      <th className="px-8 py-5 text-sm font-black uppercase">
                        Mois / Période
                      </th>
                      <th className="px-8 py-5 text-sm font-black uppercase">
                        Montant attendu
                      </th>
                      <th className="px-8 py-5 text-sm font-black uppercase">
                        Déjà versé
                      </th>
                      <th className="px-8 py-5 text-sm font-black uppercase">
                        Reste
                      </th>
                      <th className="px-8 py-5 text-sm font-black uppercase">
                        Statut
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-sbbsBorder">
                        <td className="px-8 py-6 text-lg font-black text-sbbsNavy">
                          {monthLabel(r.mois)}
                        </td>

                        <td className="px-8 py-6">
                          {!editMode || readOnly || isDeleted ? (
                            <div className="text-lg font-black text-sbbsNavy">
                              {formatMoney(r.expected)}
                            </div>
                          ) : (
                            <input
                              type="number"
                              value={asNumber(amountsDraft[r.id])}
                              onChange={(e) =>
                                setAmountsDraft((prev) => ({
                                  ...prev,
                                  [r.id]: asNumber(e.target.value),
                                }))
                              }
                              className="w-44 px-4 py-3 rounded-2xl border-4 border-sbbsBorder text-sbbsNavy text-lg font-black outline-none"
                            />
                          )}
                        </td>

                        <td className="px-8 py-6 text-lg font-black text-sbbsGreen">
                          {formatMoney(r.paid)}
                        </td>

                        <td className="px-8 py-6 text-lg font-black text-sbbsRed">
                          {formatMoney(r.remain)}
                        </td>

                        <td className="px-8 py-6">
                          {r.statut === "PAYE" && (
                            <span className="inline-flex px-5 py-3 rounded-full bg-sbbsGreen text-white text-sm font-black uppercase">
                              PAYE
                            </span>
                          )}

                          {r.statut === "PARTIEL" && (
                            <span className="inline-flex px-5 py-3 rounded-full bg-sbbsNavy text-white text-sm font-black uppercase">
                              PARTIEL
                            </span>
                          )}

                          {r.statut === "NON PAYE" && (
                            <span className="inline-flex px-5 py-3 rounded-full bg-sbbsGray text-sbbsText text-sm font-black uppercase">
                              NON PAYE
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}

                    {rows.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-10 py-20 text-center text-sbbsText/50 text-base font-bold"
                        >
                          Aucune échéance trouvée pour ce leader.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="bg-white rounded-[2rem] shadow-xl border border-sbbsBorder overflow-hidden">
                <div className="px-8 py-8 flex justify-between items-center">
                  <div className="text-sbbsNavy text-2xl font-black italic uppercase tracking-wide">
                    HISTORIQUE DES VERSEMENTS
                  </div>
                  <div className="text-sbbsText/50 text-sm font-black uppercase">
                    {leaderPaiements.length} paiement(s)
                  </div>
                </div>

                <table className="w-full">
                  <thead className="bg-sbbsGray text-sbbsText">
                    <tr className="text-left">
                      <th className="px-8 py-5 text-sm font-black uppercase">
                        Date
                      </th>
                      <th className="px-8 py-5 text-sm font-black uppercase">
                        Montant
                      </th>
                      <th className="px-8 py-5 text-sm font-black uppercase">
                        Imputé
                      </th>
                      <th className="px-8 py-5 text-sm font-black uppercase">
                        Mode
                      </th>
                      <th className="px-8 py-5 text-sm font-black uppercase">
                        Référence
                      </th>
                      <th className="px-8 py-5 text-sm font-black uppercase">
                        Statut
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {leaderPaiements.map((p) => (
                      <tr key={p.id} className="border-t border-sbbsBorder">
                        <td className="px-8 py-6 text-sm font-black text-sbbsNavy">
                          {formatDateOnly(
                            (p as any).date_paiement || (p as any).date_valeur
                          )}
                        </td>

                        <td className="px-8 py-6 text-lg font-black text-sbbsNavy">
                          {formatMoney(asNumber((p as any).montant))}
                        </td>

                        <td className="px-8 py-6 text-lg font-black text-sbbsGreen">
                          {formatMoney(asNumber((p as any).montant_impute))}
                        </td>

                        <td className="px-8 py-6 text-sm font-black text-sbbsText uppercase">
                          {String(
                            (p as any).mode || (p as any).moyen_paiement || "-"
                          )}
                        </td>

                        <td className="px-8 py-6 text-sm font-black text-sbbsText">
                          {String(
                            (p as any).reference ||
                              (p as any).reference_paiement ||
                              "-"
                          )}
                        </td>

                        <td className="px-8 py-6">
                          <span
                            className={`inline-flex px-4 py-2 rounded-full text-xs font-black uppercase ${
                              String((p as any).status || "ACTIF") === "ANNULE"
                                ? "bg-red-50 text-red-700 border border-red-200"
                                : "bg-green-50 text-green-700 border border-green-200"
                            }`}
                          >
                            {String((p as any).status || "ACTIF")}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {leaderPaiements.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-10 py-20 text-center text-sbbsText/50 text-base font-bold"
                        >
                          Aucun paiement enregistré pour ce leader.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="bg-white rounded-[2rem] shadow-xl border border-sbbsBorder overflow-hidden">
                <div className="px-8 py-8 flex justify-between items-center">
                  <div className="text-sbbsNavy text-2xl font-black italic uppercase tracking-wide">
                    HISTORIQUE DES RELANCES
                  </div>
                  <div className="text-sbbsText/50 text-sm font-black uppercase">
                    {relanceNotes.length} observation(s)
                  </div>
                </div>

                <div className="p-8 space-y-4">
                  {relanceNotes.map((note) => (
                    <div
                      key={note.id}
                      className="rounded-[1.5rem] border border-sbbsBorder bg-sbbsGray/30 p-5"
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="text-xs font-black uppercase text-sbbsText/60">
                          {note.actor_email || "Utilisateur inconnu"}
                        </div>
                        <div className="text-xs font-black text-sbbsText/50">
                          {formatDateTime(note.created_at)}
                        </div>
                      </div>

                      {note.target_month && (
                        <div className="mt-3 text-xs font-black uppercase text-sbbsNavy">
                          Mois concerné : {monthLabel(note.target_month)}
                        </div>
                      )}

                      <div className="mt-4 text-sm font-bold text-sbbsNavy whitespace-pre-wrap">
                        {String(note.note || "")}
                      </div>
                    </div>
                  ))}

                  {relanceNotes.length === 0 && (
                    <div className="p-8 rounded-2xl bg-sbbsGray text-center text-sbbsText font-bold opacity-60">
                      Aucune relance enregistrée pour ce leader.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}