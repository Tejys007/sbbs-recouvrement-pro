// src/components/PaymentEntryView.tsx
import React, { useMemo, useState } from "react";
import type {
  Leader,
  Paiement,
  PaiementImputation,
  Promotion,
} from "../types";

type ModePaiement =
  | "WAVE"
  | "ORANGE_MONEY"
  | "MOOV_MONEY"
  | "MTN_MONEY"
  | "ESPECES"
  | "CHEQUE";

function todayYYYYMMDD() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function currentYYYYMM() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
}

function asNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(v: number): string {
  return `${asNumber(v).toLocaleString()} F`;
}

interface Props {
  promotions: Promotion[];
  leaders: Leader[];
  paiements: Paiement[];
  imputations?: PaiementImputation[];

  onCreatePaiement: (payload: {
    leader_id: string;
    promotion_id: string | null;
    montant: number;
    date_paiement?: string;
    date_valeur?: string;
    mode?: string;
    moyen_paiement?: string;
    reference?: string;
    reference_paiement?: string;
  }) => Promise<void> | void;

  onUpdatePaiement?: (
    paiementId: string,
    patch: Partial<Paiement>
  ) => Promise<void> | void;
}

export default function PaymentEntryView(props: Props) {
  const [promotionId, setPromotionId] = useState<string>("");
  const [leaderId, setLeaderId] = useState<string>("");
  const [montant, setMontant] = useState<number>(0);
  const [datePaiement, setDatePaiement] = useState<string>(todayYYYYMMDD());
  const [mode, setMode] = useState<ModePaiement>("WAVE");
  const [reference, setReference] = useState<string>("");

  const [filterMonth, setFilterMonth] = useState<string>(currentYYYYMM());

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [editingPaiementId, setEditingPaiementId] = useState<string | null>(null);
  const [editMontant, setEditMontant] = useState<number>(0);
  const [editDatePaiement, setEditDatePaiement] = useState<string>(todayYYYYMMDD());
  const [editMode, setEditMode] = useState<ModePaiement>("WAVE");
  const [editReference, setEditReference] = useState<string>("");

  const promotionsOptions = useMemo(() => {
    const base = props.promotions
      .slice()
      .sort((a, b) =>
        String((b as any).date_debut || "").localeCompare(
          String((a as any).date_debut || "")
        )
      );

    return [
      { id: "ATTENTE", label: "ATTENTE (liste d’attente)" },
      ...base.map((p) => ({
        id: p.id,
        label: p.nom_promotion || "Promotion",
      })),
    ];
  }, [props.promotions]);

  const leadersOptions = useMemo(() => {
    if (!promotionId) return [];

    if (promotionId === "ATTENTE") {
      return props.leaders
        .filter((l) => l.statut === "ATTENTE")
        .slice()
        .sort((a, b) =>
          String(a.nom_complet || "").localeCompare(String(b.nom_complet || ""))
        )
        .map((l) => ({
          id: l.id,
          label: `${l.nom_complet} (${l.matricule})`,
        }));
    }

    return props.leaders
      .filter(
        (l) =>
          l.promotion_id === promotionId &&
          (l.statut === "ACTIF" || l.statut === "ATTENTE")
      )
      .slice()
      .sort((a, b) =>
        String(a.nom_complet || "").localeCompare(String(b.nom_complet || ""))
      )
      .map((l) => ({
        id: l.id,
        label: `${l.nom_complet} (${l.matricule})`,
      }));
  }, [promotionId, props.leaders]);

  const selectedLeader = useMemo(() => {
    return props.leaders.find((l) => l.id === leaderId) || null;
  }, [leaderId, props.leaders]);

  const totalImputeLeader = useMemo(() => {
    if (!selectedLeader) return 0;

    return (props.imputations || [])
      .filter((imp) => String(imp.leader_id || "") === selectedLeader.id)
      .filter((imp) => String((imp as any).status || "ACTIF") !== "ANNULE")
      .reduce((sum, imp) => sum + asNumber(imp.montant_impute), 0);
  }, [selectedLeader, props.imputations]);

  const resteNetLeader = useMemo(() => {
    if (!selectedLeader) return 0;

    const scolariteBase = asNumber((selectedLeader as any).scolarite_base ?? 370000);
    const bourse = asNumber((selectedLeader as any).bourse_montant ?? 0);

    return Math.max(0, scolariteBase - bourse - totalImputeLeader);
  }, [selectedLeader, totalImputeLeader]);

  const paiementsForUI = useMemo(() => {
    return props.paiements
      .filter((p) => {
        const d = String((p as any).date_paiement || (p as any).date_valeur || "");
        return filterMonth ? d.startsWith(filterMonth) : true;
      })
      .slice()
      .sort((a, b) =>
        String((b as any).date_paiement || (b as any).date_valeur || "").localeCompare(
          String((a as any).date_paiement || (a as any).date_valeur || "")
        )
      );
  }, [props.paiements, filterMonth]);

  async function encaisser() {
    setErr(null);
    setOk(null);

    if (!promotionId) {
      setErr("Sélectionne une promotion (ou ATTENTE).");
      return;
    }

    if (!leaderId) {
      setErr("Sélectionne un leader.");
      return;
    }

    const montantSaisi = asNumber(montant);
    if (montantSaisi <= 0) {
      setErr("Montant invalide.");
      return;
    }

    if (!selectedLeader) {
      setErr("Leader introuvable.");
      return;
    }

    if (resteNetLeader <= 0) {
      setErr("Ce leader est déjà soldé. Aucun nouveau paiement n'est autorisé.");
      return;
    }

    if (montantSaisi > resteNetLeader) {
      setErr(
        `Surpaiement interdit. Reste net du leader : ${formatMoney(resteNetLeader)}.`
      );
      return;
    }

    setSaving(true);

    try {
      const promoToStore =
        promotionId === "ATTENTE"
          ? selectedLeader?.promotion_id || "ATTENTE"
          : promotionId;

      await props.onCreatePaiement({
        leader_id: leaderId,
        promotion_id: promoToStore,
        montant: montantSaisi,
        date_paiement: datePaiement,
        date_valeur: datePaiement,
        mode,
        moyen_paiement: mode,
        reference,
        reference_paiement: reference,
      });

      setOk("Paiement enregistré avec succès.");
      setMontant(0);
      setReference("");
    } catch (e: any) {
      setErr(e?.message || "Erreur encaissement.");
    } finally {
      setSaving(false);
    }
  }

  function startEditPayment(p: Paiement) {
    setEditingPaiementId(p.id);
    setEditMontant(asNumber((p as any).montant));
    setEditDatePaiement(
      String((p as any).date_paiement || (p as any).date_valeur || todayYYYYMMDD())
    );
    setEditMode(
      String((p as any).mode || (p as any).moyen_paiement || "WAVE") as ModePaiement
    );
    setEditReference(
      String((p as any).reference || (p as any).reference_paiement || "")
    );
    setErr(null);
    setOk(null);
  }

  async function saveEditPayment() {
    if (!editingPaiementId || !props.onUpdatePaiement) return;

    if (asNumber(editMontant) <= 0) {
      setErr("Montant invalide.");
      return;
    }

    setSaving(true);
    setErr(null);
    setOk(null);

    try {
      await props.onUpdatePaiement(editingPaiementId, {
        montant: asNumber(editMontant) as any,
        date_paiement: editDatePaiement as any,
        date_valeur: editDatePaiement as any,
        mode: editMode as any,
        moyen_paiement: editMode as any,
        reference: editReference as any,
        reference_paiement: editReference as any,
      });

      setOk("Paiement modifié avec succès.");
      setEditingPaiementId(null);
    } catch (e: any) {
      setErr(e?.message || "Erreur lors de la modification du paiement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="bg-sbbsNavy rounded-[2.5rem] p-8 shadow-2xl">
        <div className="text-white text-2xl font-black uppercase tracking-tight">
          CAISSE DE RECOUVREMENT
        </div>
        <div className="text-white/70 text-[10px] font-bold uppercase tracking-widest mt-1">
          Encaissement + imputation automatique
        </div>

        <div className="mt-8 space-y-4">
          <div>
            <div className="text-white/60 text-[10px] font-black uppercase tracking-widest mb-2">
              Promotion cible
            </div>
            <select
              value={promotionId}
              onChange={(e) => {
                setPromotionId(e.target.value);
                setLeaderId("");
                setErr(null);
                setOk(null);
              }}
              className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white border border-white/20 outline-none"
            >
              <option value="" className="text-black">
                Choisir une promotion...
              </option>
              {promotionsOptions.map((p) => (
                <option key={p.id} value={p.id} className="text-black">
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-white/60 text-[10px] font-black uppercase tracking-widest mb-2">
              Leader concerné
            </div>
            <select
              value={leaderId}
              onChange={(e) => {
                setLeaderId(e.target.value);
                setErr(null);
                setOk(null);
              }}
              className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white border border-white/20 outline-none"
              disabled={!promotionId}
            >
              <option value="" className="text-black">
                Sélectionner leader...
              </option>
              {leadersOptions.map((l) => (
                <option key={l.id} value={l.id} className="text-black">
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          {selectedLeader && (
            <div className="bg-white/10 border border-white/20 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between text-white text-sm font-black">
                <span>Base scolarité</span>
                <span>{formatMoney(asNumber((selectedLeader as any).scolarite_base ?? 370000))}</span>
              </div>

              <div className="flex items-center justify-between text-white text-sm font-black">
                <span>Bourse / remise</span>
                <span>-{formatMoney(asNumber((selectedLeader as any).bourse_montant ?? 0))}</span>
              </div>

              <div className="flex items-center justify-between text-white text-sm font-black">
                <span>Déjà imputé</span>
                <span>{formatMoney(totalImputeLeader)}</span>
              </div>

              <div className="border-t border-white/20 pt-2 flex items-center justify-between text-white text-base font-black">
                <span>Reste net</span>
                <span>{formatMoney(resteNetLeader)}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-white/60 text-[10px] font-black uppercase tracking-widest mb-2">
                Montant (F)
              </div>
              <input
                type="number"
                value={montant}
                onChange={(e) => setMontant(asNumber(e.target.value))}
                className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white border border-white/20 outline-none"
              />
            </div>

            <div>
              <div className="text-white/60 text-[10px] font-black uppercase tracking-widest mb-2">
                Date valeur
              </div>
              <input
                type="date"
                value={datePaiement}
                onChange={(e) => setDatePaiement(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white border border-white/20 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-white/60 text-[10px] font-black uppercase tracking-widest mb-2">
                Mode & réf.
              </div>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as ModePaiement)}
                className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white border border-white/20 outline-none"
              >
                <option value="WAVE" className="text-black">WAVE</option>
                <option value="ORANGE_MONEY" className="text-black">ORANGE MONEY</option>
                <option value="MOOV_MONEY" className="text-black">MOOV MONEY</option>
                <option value="MTN_MONEY" className="text-black">MTN MONEY</option>
                <option value="ESPECES" className="text-black">ESPÈCES</option>
                <option value="CHEQUE" className="text-black">CHÈQUE</option>
              </select>
            </div>

            <div>
              <div className="text-white/60 text-[10px] font-black uppercase tracking-widest mb-2">
                N° pièce
              </div>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="N° Pièce"
                className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white border border-white/20 outline-none"
              />
            </div>
          </div>

          <button
            onClick={encaisser}
            disabled={saving}
            className="w-full mt-4 bg-sbbsGreen text-white py-4 rounded-2xl font-black uppercase shadow-lg hover:opacity-95 disabled:opacity-50"
          >
            {saving ? "Encaissement..." : "ENCAISSER MAINTENANT"}
          </button>

          {err && (
            <div className="mt-4 p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-[12px] font-bold">
              {err}
            </div>
          )}

          {ok && (
            <div className="mt-4 p-3 rounded-2xl bg-green-50 border border-green-200 text-green-700 text-[12px] font-bold">
              {ok}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl border border-sbbsBorder">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sbbsNavy text-2xl font-black uppercase tracking-tight">
              GRAND LIVRE DE CAISSE
            </div>
            <div className="text-sbbsText/60 text-[10px] font-bold uppercase tracking-widest mt-1">
              Historique des encaissements
            </div>
          </div>

          <input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="px-4 py-3 rounded-2xl border-2 border-sbbsBorder outline-none font-black text-sbbsNavy"
          />
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-sbbsGray text-[10px] font-black uppercase text-sbbsText">
              <tr>
                <th className="px-4 py-3">Date / Leader</th>
                <th className="px-4 py-3">Moyen / Réf</th>
                <th className="px-4 py-3 text-right">Montant</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y-2 divide-sbbsGray">
              {paiementsForUI.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center opacity-50">
                    Aucun paiement sur ce mois.
                  </td>
                </tr>
              )}

              {paiementsForUI.map((p) => {
                const l = props.leaders.find((x) => x.id === p.leader_id);

                return (
                  <tr key={p.id} className="hover:bg-sbbsGray/20">
                    <td className="px-4 py-4">
                      <div className="text-[11px] font-black text-sbbsNavy">
                        {(p as any).date_paiement || (p as any).date_valeur || "—"}
                      </div>
                      <div className="text-[11px] font-bold text-sbbsText">
                        {l?.nom_complet || "—"}
                      </div>
                    </td>

                    <td className="px-4 py-4 text-[11px] font-bold text-sbbsText">
                      {(p as any).mode || (p as any).moyen_paiement || "—"}
                    </td>

                    <td className="px-4 py-4 text-right text-[13px] font-black text-sbbsNavy">
                      {asNumber((p as any).montant).toLocaleString()} F
                    </td>

                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={() => startEditPayment(p)}
                        className="text-sbbsNavy font-black text-sm hover:opacity-70"
                        title="Modifier ce paiement"
                      >
                        ✎
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-between text-[11px] font-black text-sbbsNavy">
          <span>Total mois</span>
          <span>
            {paiementsForUI
              .reduce((s, x) => s + asNumber((x as any).montant), 0)
              .toLocaleString()}{" "}
            F
          </span>
        </div>

        {editingPaiementId && (
          <div className="mt-8 border-t pt-6">
            <div className="text-sbbsNavy text-lg font-black uppercase mb-4">
              Modifier un paiement
            </div>

            <div className="grid grid-cols-2 gap-4">
              <input
                type="number"
                value={editMontant}
                onChange={(e) => setEditMontant(asNumber(e.target.value))}
                className="px-4 py-3 rounded-2xl border-2 border-sbbsBorder outline-none"
                placeholder="Montant"
              />

              <input
                type="date"
                value={editDatePaiement}
                onChange={(e) => setEditDatePaiement(e.target.value)}
                className="px-4 py-3 rounded-2xl border-2 border-sbbsBorder outline-none"
              />

              <select
                value={editMode}
                onChange={(e) => setEditMode(e.target.value as ModePaiement)}
                className="px-4 py-3 rounded-2xl border-2 border-sbbsBorder outline-none"
              >
                <option value="WAVE">WAVE</option>
                <option value="ORANGE_MONEY">ORANGE MONEY</option>
                <option value="MOOV_MONEY">MOOV MONEY</option>
                <option value="MTN_MONEY">MTN MONEY</option>
                <option value="ESPECES">ESPÈCES</option>
                <option value="CHEQUE">CHÈQUE</option>
              </select>

              <input
                value={editReference}
                onChange={(e) => setEditReference(e.target.value)}
                className="px-4 py-3 rounded-2xl border-2 border-sbbsBorder outline-none"
                placeholder="Référence"
              />
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={saveEditPayment}
                disabled={saving}
                className="bg-sbbsNavy text-white px-5 py-3 rounded-2xl font-black uppercase"
              >
                Enregistrer modification
              </button>

              <button
                onClick={() => setEditingPaiementId(null)}
                className="bg-sbbsGray text-sbbsNavy px-5 py-3 rounded-2xl font-black uppercase"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}