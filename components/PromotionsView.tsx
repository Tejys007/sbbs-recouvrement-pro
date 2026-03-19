// src/components/PromotionsView.tsx
import React, { useMemo, useState } from "react";
import type { Promotion, Leader, EcheancierPromotion } from "../types";
import { Icons } from "../constants";
import { permanentlyDeleteLeader, restoreLeader } from "../services/leaders";

type MonthRow = { id?: string; mois: string; date_limite: string };

interface Props {
  promotions: Promotion[];
  leaders: Leader[];
  echeancierTemplates: EcheancierPromotion[];

  onCreatePromotion: (
    payload: {
      nom_promotion: string;
      date_debut: string;
      date_fin_previsionnelle?: string;
      objectif_recouvrement: number;
      scolarite_promotion: number;
    },
    filledMonths: Array<{ mois: string; date_limite: string }>
  ) => Promise<void> | void;

  onUpdatePromotion: (
    promotionId: string,
    patch: Partial<Promotion>,
    filledMonths: Array<{ id?: string; mois: string; date_limite: string }>
  ) => Promise<void> | void;

  onDeletePromotion: (promotionId: string) => Promise<void> | void;

  onManualAddLeader: (
    promotionId: string,
    payload: { nom_complet: string; telephone: string }
  ) => Promise<void> | void;

  onLeaderClick: (leaderId: string) => void;

  onImportLeaders: (file: File, promoId: string) => Promise<void> | void;

  canPermanentDelete?: boolean;
}

export default function PromotionsView({
  promotions,
  leaders,
  echeancierTemplates,
  onCreatePromotion,
  onUpdatePromotion,
  onDeletePromotion,
  onManualAddLeader,
  onLeaderClick,
  onImportLeaders,
  canPermanentDelete,
}: Props) {
  const [selectedPromoId, setSelectedPromoId] = useState<string | null>(null);

  const [showAddPromo, setShowAddPromo] = useState(false);
  const [showEditPromo, setShowEditPromo] = useState(false);
  const [showAddLeaderModal, setShowAddLeaderModal] = useState(false);

  const [promoName, setPromoName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [objTaux, setObjTaux] = useState(90);
  const [promoScolarite, setPromoScolarite] = useState<number>(370000);
  const [months, setMonths] = useState<MonthRow[]>([]);

  const [newLeaderName, setNewLeaderName] = useState("");
  const [newLeaderPhone, setNewLeaderPhone] = useState("");

  const [addingLeader, setAddingLeader] = useState(false);
  const [leaderMsg, setLeaderMsg] = useState<string | null>(null);
  const [leaderErr, setLeaderErr] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);

  const [trashMsg, setTrashMsg] = useState<string | null>(null);
  const [trashErr, setTrashErr] = useState<string | null>(null);
  const [trashLoading, setTrashLoading] = useState(false);

  const selectedPromo = useMemo(
    () => promotions.find((p) => p.id === selectedPromoId) || null,
    [promotions, selectedPromoId]
  );

  const leadersInSelectedPromo = useMemo(() => {
    if (!selectedPromoId) return [];
    return leaders
      .filter((l: any) => l.promotion_id === selectedPromoId)
      .filter((l: any) => (l.statut || "ACTIF") === "ACTIF")
      .filter((l: any) => l.deleted !== true)
      .slice()
      .sort((a, b) => (a.nom_complet || "").localeCompare(b.nom_complet || ""));
  }, [leaders, selectedPromoId]);

  const deletedLeadersInSelectedPromo = useMemo(() => {
    if (!selectedPromoId) return [];
    return leaders
      .filter((l: any) => l.promotion_id === selectedPromoId)
      .filter((l: any) => l.deleted === true)
      .slice()
      .sort((a, b) => (a.nom_complet || "").localeCompare(b.nom_complet || ""));
  }, [leaders, selectedPromoId]);

  function getPromoStatus(promo: Promotion) {
    const today = new Date().toISOString().slice(0, 10);
    const start = promo.date_debut || "";
    const end = (promo.date_fin_reelle || promo.date_fin_previsionnelle || "") as string;

    if (!start) {
      return {
        label: "À VENIR",
        color: "bg-yellow-100 text-yellow-800 border-yellow-200 shadow-sm",
      };
    }
    if (start && today < start) {
      return {
        label: "EN ATTENTE",
        color: "bg-orange-100 text-orange-700 border-orange-200",
      };
    }
    if (end && today > end) {
      return {
        label: "ACHEVÉE",
        color: "bg-sbbsNavy text-white border-sbbsNavy shadow-sm",
      };
    }
    return {
      label: "EN COURS",
      color: "bg-blue-100 text-blue-700 border-blue-200 animate-pulse-slow",
    };
  }

  function handleAddMonth() {
    if (months.length >= 12) return;
    setMonths((prev) => [...prev, { mois: "", date_limite: "" }]);
  }

  function handleRemoveMonth(index: number) {
    setMonths((prev) => prev.filter((_, i) => i !== index));
  }

  function openAddPromo() {
    setSelectedPromoId(null);
    setPromoName("");
    setStartDate("");
    setEndDate("");
    setObjTaux(90);
    setPromoScolarite(370000);
    setMonths([]);
    setShowAddPromo(true);
    setShowEditPromo(false);
  }

  function openEditPromo(promo: Promotion) {
    setSelectedPromoId(promo.id);
    setPromoName(promo.nom_promotion || "");
    setStartDate(promo.date_debut || "");
    setEndDate(promo.date_fin_previsionnelle || "");
    setObjTaux((promo.objectif_recouvrement as any) ?? 90);
    setPromoScolarite(Number((promo as any).scolarite_promotion ?? 370000));

    const currentTemplates = echeancierTemplates
      .filter((t) => t.promotion_id === promo.id)
      .map((t) => ({ id: t.id, mois: t.mois, date_limite: t.date_limite }));

    setMonths(currentTemplates);
    setShowEditPromo(true);
    setShowAddPromo(false);
  }

  async function submitPromo() {
    const nom = (promoName || "").trim();
    if (!nom) return;

    const filledMonths = (months || [])
      .filter((m) => m.mois && m.date_limite)
      .map((m) => ({
        id: m.id,
        mois: m.mois,
        date_limite: m.date_limite,
      }));

    const payload = {
      nom_promotion: nom,
      date_debut: startDate,
      date_fin_previsionnelle: endDate,
      objectif_recouvrement: Number(objTaux) || 0,
      scolarite_promotion: Number(promoScolarite) || 0,
    };

    if (showEditPromo && selectedPromoId) {
      await onUpdatePromotion(selectedPromoId, payload as any, filledMonths);
    } else {
      await onCreatePromotion(
        payload as any,
        filledMonths.map(({ mois, date_limite }) => ({ mois, date_limite }))
      );
    }

    setShowAddPromo(false);
    setShowEditPromo(false);
  }

  async function handleAddLeader() {
    if (!selectedPromoId) return;

    const n = (newLeaderName || "").trim();
    const tRaw = (newLeaderPhone || "").trim();
    const t = tRaw.replace(/\s/g, "");
    if (!n || !t) return;

    setLeaderErr(null);
    setLeaderMsg(null);

    const exists = leaders.some(
      (l: any) =>
        l.promotion_id === selectedPromoId &&
        l.deleted !== true &&
        String(l.telephone || "").replace(/\s/g, "") === t
    );

    if (exists) {
      setLeaderErr("Un leader avec ce numéro existe déjà dans cette promotion.");
      return;
    }

    try {
      setAddingLeader(true);
      await onManualAddLeader(selectedPromoId, {
        nom_complet: n.toUpperCase(),
        telephone: t,
      });
      setLeaderMsg("Leader enregistré avec succès.");
      setNewLeaderName("");
      setNewLeaderPhone("");
      setTimeout(() => setShowAddLeaderModal(false), 600);
    } catch (e: any) {
      setLeaderErr(e?.message || "Erreur lors de l'inscription du leader.");
    } finally {
      setAddingLeader(false);
    }
  }

  async function handleDeletePromo(id: string) {
    if (!id) return;

    const confirmText = window.prompt(
      "Pour supprimer cette promotion, tapez SUPPRIMER"
    );
    if (confirmText !== "SUPPRIMER") return;

    await onDeletePromotion(id);
    if (selectedPromoId === id) setSelectedPromoId(null);
  }

  async function doImport(file: File, promoId: string) {
    setImportErr(null);
    setImportMsg(null);
    try {
      setImporting(true);
      await onImportLeaders(file, promoId);
      setImportMsg("Import effectué avec succès.");
    } catch (e: any) {
      setImportErr(e?.message || "Erreur import Excel.");
    } finally {
      setImporting(false);
    }
  }

  async function handleRestoreLeader(leaderId: string, leaderName: string) {
    setTrashErr(null);
    setTrashMsg(null);
    setTrashLoading(true);

    try {
      await restoreLeader(leaderId);
      setTrashMsg(`Leader restauré : ${leaderName}.`);
    } catch (e: any) {
      setTrashErr(e?.message || "Erreur restauration.");
    } finally {
      setTrashLoading(false);
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

    setTrashErr(null);
    setTrashMsg(null);
    setTrashLoading(true);

    try {
      await permanentlyDeleteLeader(leaderId);
      setTrashMsg("Leader supprimé définitivement.");
    } catch (e: any) {
      setTrashErr(e?.message || "Erreur suppression définitive.");
    } finally {
      setTrashLoading(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in font-inter">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <h2 className="text-3xl font-black text-sbbsNavy uppercase tracking-tighter">
          Gestion des Promotions
        </h2>
        <button
          onClick={openAddPromo}
          className="bg-sbbsNavy text-white px-10 py-5 rounded-2xl font-black shadow-xl text-xs uppercase hover:bg-sbbsRed transition-all flex items-center gap-3"
        >
          <Icons.Promo />
          Nouvelle Promotion
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {promotions.map((promo) => {
          const status = getPromoStatus(promo);
          return (
            <div
              key={promo.id}
              onClick={() => setSelectedPromoId(promo.id)}
              className={`cursor-pointer bg-white p-8 rounded-[2.5rem] border-4 transition-all relative ${
                selectedPromoId === promo.id
                  ? "border-sbbsNavy shadow-2xl"
                  : "border-white hover:border-sbbsNavy/20 shadow-xl"
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-black text-xl text-sbbsNavy uppercase tracking-tighter leading-tight max-w-[70%]">
                  {promo.nom_promotion || "(Sans nom)"}
                </h3>
                <span
                  className={`px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest border-2 ${status.color}`}
                >
                  {status.label}
                </span>
              </div>

              <div className="flex flex-col gap-1 mb-4 opacity-40">
                <span className="text-[8px] font-bold uppercase tracking-widest">
                  Période : {promo.date_debut || "À DÉFINIR"} au{" "}
                  {promo.date_fin_previsionnelle || "N/A"}
                </span>
                <span className="text-[8px] font-bold uppercase tracking-widest">
                  Scolarité :{" "}
                  {Number((promo as any).scolarite_promotion ?? 0).toLocaleString()}{" "}
                  FCFA
                </span>
              </div>

              <div className="flex justify-between items-center mt-6">
                <span className="text-[10px] font-black text-sbbsText uppercase bg-sbbsGray px-3 py-1 rounded-full">
                  Obj: {promo.objectif_recouvrement ?? 0}%
                </span>

                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditPromo(promo);
                    }}
                    className="text-sbbsNavy font-black text-[10px] uppercase hover:underline"
                  >
                    Paramètres
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePromo(promo.id);
                    }}
                    className="text-sbbsRed font-black text-[10px] uppercase hover:underline"
                    title="Supprimer la promotion"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {promotions.length === 0 && (
          <div className="col-span-full bg-white rounded-[2.5rem] p-10 border-4 border-white shadow-xl opacity-60">
            <div className="text-sbbsNavy font-black uppercase text-sm">
              Aucune promotion
            </div>
            <div className="text-[10px] text-sbbsText font-bold uppercase opacity-60 mt-2">
              Crée ta première promotion.
            </div>
          </div>
        )}
      </div>

      {(showAddPromo || showEditPromo) && (
        <div className="fixed inset-0 bg-sbbsNavy/95 flex items-center justify-center z-[150] p-4 backdrop-blur-3xl">
          <div className="bg-white rounded-[3rem] w-full max-w-6xl h-[90vh] overflow-hidden flex flex-col shadow-2xl border-4 border-white animate-scale-up">
            <div className="px-10 py-8 border-b-4 border-sbbsGray flex justify-between items-center">
              <h3 className="text-2xl font-black text-sbbsNavy uppercase tracking-tighter">
                {showEditPromo ? "Configuration Promotion" : "Ouverture Promotion"}
              </h3>
              <button
                onClick={() => {
                  setShowAddPromo(false);
                  setShowEditPromo(false);
                }}
                className="p-3 bg-white border-2 border-sbbsGray rounded-2xl hover:text-sbbsRed"
                title="Fermer"
              >
                <Icons.Abandon />
              </button>
            </div>

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              <div className="w-full md:w-1/2 p-10 space-y-6 overflow-y-auto border-r-4 border-sbbsGray">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-sbbsNavy block ml-2">
                    Dénomination de la promotion
                  </label>
                  <input
                    value={promoName}
                    onChange={(e) => setPromoName(e.target.value.toUpperCase())}
                    className="w-full border-4 border-sbbsGray rounded-2xl px-6 py-4 font-black text-sbbsNavy outline-none focus:border-sbbsNavy text-lg"
                    placeholder="EX: LICENCE 1 2024-2025"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-sbbsNavy block ml-2">
                      Date de Début
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full border-4 border-sbbsGray rounded-2xl px-6 py-4 font-black text-sbbsNavy outline-none focus:border-sbbsNavy"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-sbbsNavy block ml-2">
                      Fin Prévisionnelle
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full border-4 border-sbbsGray rounded-2xl px-6 py-4 font-black text-sbbsNavy outline-none focus:border-sbbsNavy"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-sbbsNavy block ml-2">
                    Scolarité de la promotion (FCFA)
                  </label>
                  <input
                    type="number"
                    value={promoScolarite}
                    onChange={(e) => setPromoScolarite(Number(e.target.value))}
                    className="w-full border-4 border-sbbsGray rounded-2xl px-6 py-4 font-black text-sbbsNavy outline-none focus:border-sbbsNavy"
                    placeholder="370000"
                  />
                </div>

                <div className="space-y-4 pt-4">
                  <label className="text-[10px] font-black uppercase text-sbbsNavy block ml-2">
                    Objectif de Recouvrement (%)
                  </label>
                  <div className="bg-sbbsGray p-6 rounded-3xl border-2 border-sbbsBorder shadow-inner">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={objTaux}
                      onChange={(e) => setObjTaux(parseInt(e.target.value))}
                      className="w-full h-2 bg-sbbsNavy/10 rounded-lg appearance-none cursor-pointer accent-sbbsNavy"
                    />
                    <div className="text-center font-black text-3xl text-sbbsNavy mt-4">
                      {objTaux}%
                    </div>
                    <p className="text-[8px] text-center font-bold text-sbbsText uppercase opacity-40 mt-2 tracking-widest">
                      Seuil de performance attendu
                    </p>
                  </div>
                </div>

                <button
                  onClick={submitPromo}
                  className="w-full bg-sbbsNavy text-white py-6 rounded-[2rem] font-black uppercase text-sm shadow-xl hover:bg-sbbsRed transition-all flex items-center justify-center gap-3"
                >
                  <Icons.Dashboard />
                  Valider la Configuration
                </button>
              </div>

              <div className="flex-1 bg-sbbsGray/20 p-10 flex flex-col overflow-hidden">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h4 className="text-xl font-black text-sbbsNavy uppercase tracking-tighter italic">
                      Grille des Échéances
                    </h4>
                    <p className="text-[9px] font-bold text-sbbsText opacity-40 uppercase tracking-widest">
                      Définissez les mois de facturation
                    </p>
                  </div>
                  <button
                    onClick={handleAddMonth}
                    className="bg-white border-4 border-sbbsNavy text-sbbsNavy px-6 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-sbbsNavy hover:text-white transition-all"
                  >
                    + Ajouter Mois
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                  {months.map((m, idx) => (
                    <div
                      key={m.id || idx}
                      className="bg-white p-4 rounded-3xl border-4 border-white shadow-sm flex items-center gap-4 transition-all hover:border-sbbsNavy/10"
                    >
                      <div className="flex-1 space-y-1">
                        <span className="text-[8px] font-black text-sbbsNavy uppercase ml-2 opacity-40">
                          Mois Concerné
                        </span>
                        <input
                          type="month"
                          value={m.mois}
                          onChange={(e) => {
                            const nm = [...months];
                            nm[idx].mois = e.target.value;
                            setMonths(nm);
                          }}
                          className="w-full bg-sbbsGray border-none rounded-xl px-4 py-2 text-xs font-black text-sbbsNavy"
                        />
                      </div>

                      <div className="flex-1 space-y-1">
                        <span className="text-[8px] font-black text-sbbsNavy uppercase ml-2 opacity-40">
                          Date Limite
                        </span>
                        <input
                          type="date"
                          value={m.date_limite}
                          onChange={(e) => {
                            const nm = [...months];
                            nm[idx].date_limite = e.target.value;
                            setMonths(nm);
                          }}
                          className="w-full bg-sbbsGray border-none rounded-xl px-4 py-2 text-xs font-black text-sbbsNavy"
                        />
                      </div>

                      <button
                        onClick={() => handleRemoveMonth(idx)}
                        className="text-sbbsRed p-2 hover:bg-sbbsRed/10 rounded-xl transition-colors mt-4"
                        title="Supprimer ce mois"
                      >
                        <Icons.Abandon />
                      </button>
                    </div>
                  ))}

                  {months.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full opacity-20 py-20 border-4 border-dashed border-sbbsNavy rounded-[3rem]">
                      <Icons.Payment />
                      <span className="text-[10px] font-black uppercase tracking-widest mt-4">
                        Aucune échéance paramétrée
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddLeaderModal && selectedPromoId && (
        <div className="fixed inset-0 bg-sbbsNavy/95 flex items-center justify-center z-[200] p-4 backdrop-blur-xl">
          <div className="bg-white rounded-[2.5rem] p-10 w-full max-w-md shadow-2xl border-4 border-white animate-scale-up">
            <h3 className="text-xl font-black text-sbbsNavy uppercase mb-8 text-center italic">
              Inscription Manuelle
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-sbbsNavy opacity-40 ml-2">
                  Nom Complet du Leader
                </label>
                <input
                  value={newLeaderName}
                  onChange={(e) => setNewLeaderName(e.target.value.toUpperCase())}
                  className="w-full border-4 border-sbbsGray rounded-2xl px-6 py-4 font-black text-sbbsNavy outline-none focus:border-sbbsNavy"
                  placeholder="NOM PRENOM"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-sbbsNavy opacity-40 ml-2">
                  Téléphone
                </label>
                <input
                  value={newLeaderPhone}
                  onChange={(e) => setNewLeaderPhone(e.target.value)}
                  className="w-full border-4 border-sbbsGray rounded-2xl px-6 py-4 font-black text-sbbsNavy outline-none focus:border-sbbsNavy"
                  placeholder="XX XX XX XX XX"
                />
              </div>

              <div className="pt-6 flex flex-col gap-2">
                <button
                  onClick={handleAddLeader}
                  disabled={addingLeader}
                  className="w-full bg-sbbsNavy text-white py-5 rounded-2xl font-black uppercase text-xs shadow-xl disabled:opacity-50"
                >
                  {addingLeader ? "Enregistrement..." : "Confirmer l'inscription"}
                </button>

                <button
                  onClick={() => setShowAddLeaderModal(false)}
                  className="w-full py-2 text-sbbsText font-bold text-[10px] uppercase hover:underline"
                >
                  Annuler
                </button>

                {leaderErr && (
                  <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
                    {leaderErr}
                  </div>
                )}
                {leaderMsg && (
                  <div className="mt-3 p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-xs font-bold">
                    {leaderMsg}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedPromo && (
        <>
          <div className="bg-white rounded-[3rem] border-4 border-white shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-8 border-b-4 border-sbbsGray flex flex-col md:flex-row justify-between items-center bg-sbbsGray/20 gap-4">
              <div>
                <h3 className="text-xl font-black text-sbbsNavy uppercase tracking-tighter italic">
                  Registre des Leaders
                </h3>
                <p className="text-[10px] font-bold text-sbbsText opacity-40 uppercase tracking-widest">
                  Liste des étudiants inscrits dans cette promotion (STATUT: ACTIF)
                </p>

                {(importErr || importMsg) && (
                  <div className="mt-3">
                    {importErr && (
                      <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[11px] font-bold">
                        {importErr}
                      </div>
                    )}
                    {importMsg && (
                      <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-[11px] font-bold">
                        {importMsg}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setShowAddLeaderModal(true)}
                  className="bg-sbbsGreen text-white px-8 py-4 rounded-2xl text-xs font-black uppercase shadow-lg hover:scale-105 transition-transform flex items-center gap-2"
                >
                  <Icons.Profile />
                  Ajout Manuel
                </button>

                <label
                  className={`cursor-pointer bg-white border-4 border-sbbsNavy text-sbbsNavy px-8 py-4 rounded-2xl text-xs font-black uppercase hover:bg-sbbsNavy hover:text-white transition-all flex items-center gap-2 ${
                    importing ? "opacity-60 pointer-events-none" : ""
                  }`}
                >
                  <Icons.Promo />
                  {importing ? "Import..." : "Import Excel"}
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && selectedPromoId) doImport(f, selectedPromoId);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-sbbsGray text-[10px] font-black uppercase text-sbbsText border-b-4 border-sbbsGray">
                  <tr>
                    <th className="px-8 py-4">Leader</th>
                    <th className="px-8 py-4">Matricule</th>
                    <th className="px-8 py-4">Contact</th>
                    <th className="px-8 py-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y-4 divide-sbbsGray">
                  {leadersInSelectedPromo.map((l) => (
                    <tr key={l.id} className="hover:bg-sbbsGray/30 transition-colors group">
                      <td className="px-8 py-5 font-black text-sbbsNavy uppercase text-xs">
                        {l.nom_complet}
                      </td>
                      <td className="px-8 py-5 font-mono text-xs text-sbbsRed font-black italic">
                        {l.matricule}
                      </td>
                      <td className="px-8 py-5 text-[10px] font-bold text-sbbsText">
                        {l.telephone}
                      </td>
                      <td className="px-8 py-5 text-center">
                        <button
                          onClick={() => onLeaderClick(l.id)}
                          className="bg-sbbsNavy text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase shadow-md hover:bg-sbbsRed transition-all"
                        >
                          Dossier
                        </button>
                      </td>
                    </tr>
                  ))}

                  {leadersInSelectedPromo.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-8 py-20 text-center opacity-20">
                        <span className="text-xs font-black uppercase tracking-widest italic">
                          Aucun leader ACTIF dans cette promotion
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-[3rem] border-4 border-white shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-8 border-b-4 border-sbbsGray bg-red-50/30">
              <h3 className="text-xl font-black text-sbbsNavy uppercase tracking-tighter italic">
                Corbeille de la promotion
              </h3>
              <p className="text-[10px] font-bold text-sbbsText opacity-40 uppercase tracking-widest">
                Leaders supprimés logiquement dans cette promotion
              </p>

              {(trashErr || trashMsg) && (
                <div className="mt-4">
                  {trashErr && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[11px] font-bold">
                      {trashErr}
                    </div>
                  )}
                  {trashMsg && (
                    <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-[11px] font-bold">
                      {trashMsg}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-sbbsGray text-[10px] font-black uppercase text-sbbsText border-b-4 border-sbbsGray">
                  <tr>
                    <th className="px-8 py-4">Leader</th>
                    <th className="px-8 py-4">Matricule</th>
                    <th className="px-8 py-4">Contact</th>
                    <th className="px-8 py-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y-4 divide-sbbsGray">
                  {deletedLeadersInSelectedPromo.map((l: any) => (
                    <tr key={l.id} className="hover:bg-red-50/20 transition-colors">
                      <td className="px-8 py-5 font-black text-sbbsNavy uppercase text-xs">
                        {l.nom_complet}
                      </td>
                      <td className="px-8 py-5 font-mono text-xs text-sbbsRed font-black italic">
                        {l.matricule}
                      </td>
                      <td className="px-8 py-5 text-[10px] font-bold text-sbbsText">
                        {l.telephone}
                      </td>
                      <td className="px-8 py-5 text-center">
                        <div className="flex justify-center gap-3 flex-wrap">
                          <button
                            onClick={() => handleRestoreLeader(l.id, l.nom_complet)}
                            disabled={trashLoading}
                            className="bg-sbbsGreen text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase shadow-md"
                          >
                            Restaurer
                          </button>

                          {canPermanentDelete && (
                            <button
                              onClick={() =>
                                handlePermanentDeleteLeader(l.id, l.nom_complet)
                              }
                              disabled={trashLoading}
                              className="bg-red-600 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase shadow-md"
                            >
                              Supprimer définitivement
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {deletedLeadersInSelectedPromo.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-8 py-16 text-center opacity-30">
                        <span className="text-xs font-black uppercase tracking-widest italic">
                          Aucun leader supprimé dans cette promotion
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}