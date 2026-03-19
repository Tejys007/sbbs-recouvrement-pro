// src/components/StatusListView.tsx
import React, { useMemo, useState } from "react";
import type {
  EcheancierLeader,
  Leader,
  Paiement,
  PaiementImputation,
  Promotion,
} from "../types";
import {
  createLeaderWithMatricule,
  permanentlyDeleteLeader,
  restoreLeader,
  setLeaderStatusAndDetach,
  softDeleteLeader,
} from "../services/leaders";
import { computeRiskFromOverdueRows } from "../services/riskScoring";

type Status = "ATTENTE" | "ABANDON";

type Props = {
  title: string;
  status: Status;
  promotions: Promotion[];
  leaders: Leader[];
  schedules: EcheancierLeader[];
  paiements: Paiement[];
  imputations: PaiementImputation[];
  onChangeStatus: (
    leaderId: string,
    statut: "ACTIF" | "ATTENTE" | "ABANDON"
  ) => Promise<void> | void;
  onDeleteLeader: (leaderId: string) => Promise<void> | void;
  canPermanentDelete?: boolean;
};

function asNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function StatusListView(props: Props) {
  const [showPre, setShowPre] = useState(false);
  const [preNom, setPreNom] = useState("");
  const [preTel, setPreTel] = useState("");

  const [affectLeaderId, setAffectLeaderId] = useState<string | null>(null);
  const [affectPromoId, setAffectPromoId] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showTrash, setShowTrash] = useState(false);

  const today = todayIso();

  const leadersList = useMemo(() => {
    return props.leaders
      .filter((l: any) => l.statut === props.status)
      .filter((l: any) => l.deleted !== true)
      .slice()
      .sort((a: any, b: any) =>
        String(a.nom_complet).localeCompare(String(b.nom_complet))
      );
  }, [props.leaders, props.status]);

  const deletedLeadersList = useMemo(() => {
    return props.leaders
      .filter((l: any) => l.statut === props.status)
      .filter((l: any) => l.deleted === true)
      .slice()
      .sort((a: any, b: any) =>
        String(a.nom_complet).localeCompare(String(b.nom_complet))
      );
  }, [props.leaders, props.status]);

  const promoById = useMemo(() => {
    const m = new Map<string, Promotion>();
    props.promotions.forEach((p) => m.set(p.id, p));
    return m;
  }, [props.promotions]);

  function totalVerse(leaderId: string) {
    return props.imputations
      .filter((i: any) => i.leader_id === leaderId)
      .filter((i: any) => String(i.status || "ACTIF") !== "ANNULE")
      .reduce((s, x: any) => s + asNumber(x.montant_impute), 0);
  }

  function overdueRows(leaderId: string) {
    return props.schedules
      .filter((s) => s.leader_id === leaderId)
      .filter((s: any) => {
        const dateLimite = String(s.date_limite || "");
        return Boolean(dateLimite) && dateLimite <= today;
      })
      .map((s) => {
        const attendu = asNumber((s as any).montant_attendu);
        const paye = props.imputations
          .filter(
            (i: any) =>
              i.leader_id === leaderId &&
              String(i.status || "ACTIF") !== "ANNULE" &&
              String((i as any).echeance_leader_id || (i as any).echeance_id || "") ===
                s.id
          )
          .reduce((sum, x: any) => sum + asNumber(x.montant_impute), 0);

        const reste = Math.max(0, attendu - paye);

        return {
          expected: attendu,
          paid: paye,
          remain: reste,
        };
      })
      .filter((x) => x.remain > 0);
  }

  function resteNet(leader: any) {
    const base = asNumber(leader.scolarite_base || 370000);
    const bourse = asNumber(leader.bourse_montant || 0);
    const net = Math.max(0, base - bourse);
    return Math.max(0, net - totalVerse(leader.id));
  }

  async function doPreInscription() {
    setErr(null);
    setMsg(null);

    if (!preNom.trim()) return setErr("Nom complet requis.");
    if (!preTel.trim()) return setErr("Téléphone requis.");

    setSaving(true);
    try {
      await createLeaderWithMatricule({
        promotion_id: null,
        nom_complet: preNom,
        telephone: preTel,
        scolarite_base: 370000,
        bourse_montant: 0,
        statut: "ATTENTE",
      });

      setMsg("Pré-inscription enregistrée (leader en attente).");
      setPreNom("");
      setPreTel("");
      setShowPre(false);
    } catch (e: any) {
      setErr(e?.message || "Erreur pré-inscription.");
    } finally {
      setSaving(false);
    }
  }

  async function openAffect(leaderId: string) {
    setErr(null);
    setMsg(null);
    setAffectLeaderId(leaderId);
    setAffectPromoId("");
  }

  async function doAffect() {
    if (!affectLeaderId) return;
    setErr(null);
    setMsg(null);
    if (!affectPromoId) return setErr("Choisis la promotion cible.");

    setSaving(true);
    try {
      await setLeaderStatusAndDetach(affectLeaderId, "ACTIF", {
        promotionIdForActif: affectPromoId,
      });

      setMsg(
        props.status === "ABANDON"
          ? "Leader réintégré dans la promotion."
          : "Leader affecté à la promotion."
      );
      setAffectLeaderId(null);
      setAffectPromoId("");
    } catch (e: any) {
      setErr(e?.message || "Erreur affectation.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSoftDeleteLeader(leaderId: string, leaderName: string) {
    const confirmText = window.prompt(
      `Pour supprimer ${leaderName} vers la corbeille, tapez SUPPRIMER`
    );
    if (confirmText !== "SUPPRIMER") return;

    setErr(null);
    setMsg(null);
    setSaving(true);

    try {
      await softDeleteLeader(leaderId);
      setMsg("Leader déplacé dans la corbeille.");
    } catch (e: any) {
      setErr(e?.message || "Erreur lors de la suppression logique du leader.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRestoreLeader(leaderId: string, leaderName: string) {
    setErr(null);
    setMsg(null);
    setSaving(true);

    try {
      await restoreLeader(leaderId);
      setMsg(`Leader restauré : ${leaderName}.`);
    } catch (e: any) {
      setErr(e?.message || "Erreur lors de la restauration.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePermanentDeleteLeader(
    leaderId: string,
    leaderName: string
  ) {
    const confirmText = window.prompt(
      `Suppression définitive de ${leaderName}. Tapez SUPPRIMER DEFINITIVEMENT`
    );
    if (confirmText !== "SUPPRIMER DEFINITIVEMENT") return;

    setErr(null);
    setMsg(null);
    setSaving(true);

    try {
      await permanentlyDeleteLeader(leaderId);
      setMsg("Leader supprimé définitivement.");
    } catch (e: any) {
      setErr(e?.message || "Erreur lors de la suppression définitive.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="text-3xl font-black text-sbbsNavy uppercase">
            {props.title}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowTrash((v) => !v)}
            className="bg-white border-2 border-sbbsNavy text-sbbsNavy px-6 py-3 rounded-2xl font-black uppercase text-xs shadow-lg hover:bg-sbbsNavy hover:text-white"
          >
            {showTrash ? "Masquer la corbeille" : "Voir la corbeille"}
          </button>

          {props.status === "ATTENTE" && (
            <button
              onClick={() => {
                setErr(null);
                setMsg(null);
                setShowPre(true);
              }}
              className="bg-sbbsNavy text-white px-6 py-3 rounded-2xl font-black uppercase text-xs shadow-lg hover:bg-sbbsRed"
            >
              PRÉ-INSCRIPTION
            </button>
          )}
        </div>
      </div>

      {err && (
        <div className="mb-4 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 font-bold text-[12px]">
          {err}
        </div>
      )}
      {msg && (
        <div className="mb-4 p-4 rounded-2xl bg-green-50 border border-green-200 text-green-700 font-bold text-[12px]">
          {msg}
        </div>
      )}

      <div className="bg-white rounded-[2.5rem] shadow-2xl border-2 border-sbbsBorder overflow-hidden">
        <div className="p-6 border-b-2 border-sbbsGray">
          <div className="grid grid-cols-6 text-[10px] font-black uppercase text-sbbsText opacity-70">
            <div>Leader</div>
            <div>Dernière promo</div>
            <div>Déjà versé</div>
            <div>Reste net</div>
            <div>Risque</div>
            <div className="text-right">Actions</div>
          </div>
        </div>

        <div className="divide-y-2 divide-sbbsGray">
          {leadersList.map((l: any) => {
            const originId = l.promotion_origine_id || l.promotion_id || null;
            const origin = originId ? promoById.get(originId) : null;
            const risk = computeRiskFromOverdueRows(overdueRows(l.id));

            return (
              <div key={l.id} className="p-6 grid grid-cols-6 items-center gap-4">
                <div>
                  <div className="font-black text-sbbsNavy uppercase text-[12px]">
                    {l.nom_complet}
                  </div>
                  <div className="text-[10px] font-bold text-sbbsRed">
                    {l.matricule}
                  </div>
                </div>

                <div>
                  {origin ? (
                    <span className="px-4 py-2 rounded-2xl bg-blue-50 border border-blue-200 text-blue-800 font-black text-[10px] uppercase">
                      {(origin as any).nom_promotion || "PROMO"}
                    </span>
                  ) : (
                    <span className="px-4 py-2 rounded-2xl bg-orange-50 border border-orange-200 text-orange-800 font-black text-[10px] uppercase">
                      NOUVEAU (SANS PROMO)
                    </span>
                  )}
                </div>

                <div className="font-black text-green-700">
                  {totalVerse(l.id).toLocaleString()} F
                </div>

                <div className="font-black text-sbbsRed">
                  {resteNet(l).toLocaleString()} F
                </div>

                <div>
                  <span
                    className={`px-4 py-2 rounded-2xl border font-black text-[10px] uppercase ${risk.color}`}
                  >
                    {risk.level}
                  </span>
                </div>

                <div className="text-right">
                  <div className="flex justify-end gap-2 flex-wrap">
                    <button
                      onClick={() => openAffect(l.id)}
                      className="bg-sbbsNavy text-white px-4 py-2 rounded-2xl font-black uppercase text-[10px] shadow hover:bg-sbbsRed"
                    >
                      {props.status === "ABANDON" ? "RÉINTÉGRER" : "AFFECTER"}
                    </button>

                    <button
                      onClick={() => handleSoftDeleteLeader(l.id, l.nom_complet)}
                      disabled={saving}
                      className="bg-white border-2 border-red-500 text-red-500 px-4 py-2 rounded-2xl font-black uppercase text-[10px] hover:bg-red-500 hover:text-white"
                    >
                      CORBEILLE
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {leadersList.length === 0 && (
            <div className="p-10 text-center opacity-50 font-bold">
              Aucun leader dans cette liste.
            </div>
          )}
        </div>
      </div>

      {showTrash && (
        <div className="mt-8 bg-white rounded-[2.5rem] shadow-2xl border-2 border-sbbsBorder overflow-hidden">
          <div className="p-6 border-b-2 border-sbbsGray">
            <div className="text-xl font-black text-sbbsNavy uppercase">
              Corbeille
            </div>
            <div className="text-[10px] font-black uppercase text-sbbsText opacity-60 mt-1">
              Leaders supprimés logiquement — restauration ou suppression définitive
            </div>
          </div>

          <div className="divide-y-2 divide-sbbsGray">
            {deletedLeadersList.map((l: any) => {
              const originId = l.promotion_origine_id || l.promotion_id || null;
              const origin = originId ? promoById.get(originId) : null;

              return (
                <div key={l.id} className="p-6 grid grid-cols-6 items-center gap-4 bg-red-50/20">
                  <div>
                    <div className="font-black text-sbbsNavy uppercase text-[12px]">
                      {l.nom_complet}
                    </div>
                    <div className="text-[10px] font-bold text-sbbsRed">
                      {l.matricule}
                    </div>
                  </div>

                  <div>
                    {origin ? (
                      <span className="px-4 py-2 rounded-2xl bg-blue-50 border border-blue-200 text-blue-800 font-black text-[10px] uppercase">
                        {(origin as any).nom_promotion || "PROMO"}
                      </span>
                    ) : (
                      <span className="px-4 py-2 rounded-2xl bg-slate-50 border border-slate-200 text-slate-800 font-black text-[10px] uppercase">
                        Sans promo
                      </span>
                    )}
                  </div>

                  <div className="font-black text-sbbsText">
                    {totalVerse(l.id).toLocaleString()} F
                  </div>

                  <div className="font-black text-sbbsText">
                    {resteNet(l).toLocaleString()} F
                  </div>

                  <div>
                    <span className="px-4 py-2 rounded-2xl border font-black text-[10px] uppercase bg-red-100 text-red-800 border-red-200">
                      SUPPRIMÉ
                    </span>
                  </div>

                  <div className="text-right">
                    <div className="flex justify-end gap-2 flex-wrap">
                      <button
                        onClick={() => handleRestoreLeader(l.id, l.nom_complet)}
                        disabled={saving}
                        className="bg-sbbsGreen text-white px-4 py-2 rounded-2xl font-black uppercase text-[10px] shadow"
                      >
                        RESTAURER
                      </button>

                      {props.canPermanentDelete && (
                        <button
                          onClick={() =>
                            handlePermanentDeleteLeader(l.id, l.nom_complet)
                          }
                          disabled={saving}
                          className="bg-red-600 text-white px-4 py-2 rounded-2xl font-black uppercase text-[10px] shadow"
                        >
                          SUPPRIMER DÉFINITIVEMENT
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {deletedLeadersList.length === 0 && (
              <div className="p-10 text-center opacity-50 font-bold">
                Aucun leader dans la corbeille.
              </div>
            )}
          </div>
        </div>
      )}

      {showPre && (
        <div className="fixed inset-0 z-[400] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-[2rem] p-8 border-2 border-sbbsBorder shadow-2xl">
            <div className="text-xl font-black text-sbbsNavy uppercase">
              Pré-inscription
            </div>
            <div className="text-[11px] font-bold text-sbbsText opacity-60 mt-1">
              Le leader est créé directement en statut ATTENTE.
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">
                  Nom complet
                </div>
                <input
                  value={preNom}
                  onChange={(e) => setPreNom(e.target.value)}
                  className="w-full px-4 py-4 rounded-2xl border-2 border-sbbsGray font-black text-sbbsNavy outline-none"
                  placeholder="NOM PRÉNOM"
                />
              </div>

              <div>
                <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">
                  Téléphone
                </div>
                <input
                  value={preTel}
                  onChange={(e) => setPreTel(e.target.value)}
                  className="w-full px-4 py-4 rounded-2xl border-2 border-sbbsGray font-black text-sbbsNavy outline-none"
                  placeholder="0700000000"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowPre(false)}
                  className="flex-1 py-4 rounded-2xl border-2 border-sbbsGray font-black uppercase text-xs"
                >
                  Annuler
                </button>
                <button
                  onClick={doPreInscription}
                  disabled={saving}
                  className="flex-1 py-4 rounded-2xl bg-sbbsNavy text-white font-black uppercase text-xs hover:bg-sbbsRed disabled:opacity-50"
                >
                  {saving ? "..." : "Enregistrer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {affectLeaderId && (
        <div className="fixed inset-0 z-[400] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-[2rem] p-8 border-2 border-sbbsBorder shadow-2xl">
            <div className="text-xl font-black text-sbbsNavy uppercase">
              {props.status === "ABANDON"
                ? "Réintégrer dans une promotion"
                : "Affecter à une promotion"}
            </div>
            <div className="text-[11px] font-bold text-sbbsText opacity-60 mt-1">
              {props.status === "ABANDON"
                ? "Le leader repasse en ACTIF et reprend sa formation."
                : "Le leader passe en ACTIF et sort de la liste d’attente."}
            </div>

            <div className="mt-6">
              <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">
                Promotion cible
              </div>
              <select
                value={affectPromoId}
                onChange={(e) => setAffectPromoId(e.target.value)}
                className="w-full px-4 py-4 rounded-2xl border-2 border-sbbsGray font-black text-sbbsNavy outline-none"
              >
                <option value="">— Sélectionner —</option>
                {props.promotions.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.nom_promotion || "Promotion"}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-6">
              <button
                onClick={() => setAffectLeaderId(null)}
                className="flex-1 py-4 rounded-2xl border-2 border-sbbsGray font-black uppercase text-xs"
              >
                Annuler
              </button>
              <button
                onClick={doAffect}
                disabled={saving}
                className="flex-1 py-4 rounded-2xl bg-sbbsNavy text-white font-black uppercase text-xs hover:bg-sbbsRed disabled:opacity-50"
              >
                {saving ? "..." : props.status === "ABANDON" ? "Réintégrer" : "Affecter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}