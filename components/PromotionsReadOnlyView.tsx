// src/components/PromotionsReadOnlyView.tsx
import React, { useMemo, useState } from "react";
import type { Promotion, Leader } from "../types";

interface Props {
  promotions: Promotion[];
  leaders: Leader[];
  onLeaderClick: (leaderId: string) => void;
}

export default function PromotionsReadOnlyView({
  promotions,
  leaders,
  onLeaderClick,
}: Props) {
  const [selectedPromoId, setSelectedPromoId] = useState<string | null>(null);

  const selectedPromo = useMemo(
    () => promotions.find((p) => p.id === selectedPromoId) || null,
    [promotions, selectedPromoId]
  );

  const leadersInSelectedPromo = useMemo(() => {
    if (!selectedPromoId) return [];
    return leaders
      .filter((l) => l.promotion_id === selectedPromoId)
      .filter((l) => (l.statut || "ACTIF") === "ACTIF")
      .slice()
      .sort((a, b) =>
        String(a.nom_complet || "").localeCompare(String(b.nom_complet || ""))
      );
  }, [leaders, selectedPromoId]);

  function getPromoStatus(promo: Promotion) {
    const today = new Date().toISOString().slice(0, 10);
    const start = (promo as any).date_debut || "";
    const end = String(
      (promo as any).date_fin_reelle ||
        (promo as any).date_fin_previsionnelle ||
        ""
    );

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
      color: "bg-blue-100 text-blue-700 border-blue-200",
    };
  }

  return (
    <div className="space-y-6 animate-fade-in font-inter">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-sbbsNavy uppercase tracking-tighter">
            Gestion des Promotions
          </h2>
          <div className="text-[11px] font-bold uppercase tracking-widest text-sbbsText opacity-50 mt-1">
            Mode lecture seule
          </div>
        </div>

        <div className="px-6 py-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-800 text-xs font-black uppercase">
          Consultation uniquement
        </div>
      </div>

      {/* LISTE PROMOS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {promotions.map((promo) => {
          const status = getPromoStatus(promo);
          const montant = Number(
            (promo as any).montant_scolarite ??
              (promo as any).scolarite_promotion ??
              (promo as any).scolarite_montant ??
              0
          );

          const leadersCount = leaders.filter(
            (l) =>
              l.promotion_id === promo.id &&
              String(l.statut || "ACTIF") === "ACTIF"
          ).length;

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
              <div className="flex justify-between items-start mb-4 gap-4">
                <h3 className="font-black text-xl text-sbbsNavy uppercase tracking-tighter leading-tight">
                  {promo.nom_promotion || "(Sans nom)"}
                </h3>

                <span
                  className={`px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest border-2 ${status.color}`}
                >
                  {status.label}
                </span>
              </div>

              <div className="flex flex-col gap-2 mb-5 opacity-70">
                <span className="text-[10px] font-bold uppercase tracking-widest text-sbbsText">
                  Période : {(promo as any).date_debut || "À définir"} au{" "}
                  {(promo as any).date_fin_previsionnelle || "N/A"}
                </span>

                <span className="text-[10px] font-bold uppercase tracking-widest text-sbbsText">
                  Scolarité : {montant.toLocaleString()} FCFA
                </span>

                <span className="text-[10px] font-bold uppercase tracking-widest text-sbbsText">
                  Leaders actifs : {leadersCount}
                </span>
              </div>

              <div className="flex justify-between items-center mt-6">
                <span className="text-[10px] font-black text-sbbsText uppercase bg-sbbsGray px-3 py-1 rounded-full">
                  Obj: {(promo as any).objectif_recouvrement ?? 0}%
                </span>

                <span className="text-[10px] font-black text-blue-700 uppercase">
                  Lecture seule
                </span>
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
              Aucune donnée disponible.
            </div>
          </div>
        )}
      </div>

      {/* SECTION LEADERS */}
      {selectedPromo && (
        <div className="bg-white rounded-[3rem] border-4 border-white shadow-2xl overflow-hidden animate-slide-up">
          <div className="p-8 border-b-4 border-sbbsGray flex flex-col md:flex-row justify-between items-center bg-sbbsGray/20 gap-4">
            <div>
              <h3 className="text-xl font-black text-sbbsNavy uppercase tracking-tighter italic">
                Registre des Leaders
              </h3>
              <p className="text-[10px] font-bold text-sbbsText opacity-40 uppercase tracking-widest">
                Liste des leaders actifs de cette promotion
              </p>
            </div>

            <div className="px-5 py-3 rounded-2xl bg-blue-50 border border-blue-200 text-blue-800 text-[10px] font-black uppercase">
              Mode lecture seule
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sbbsGray text-[10px] font-black uppercase text-sbbsText border-b-4 border-sbbsGray">
                <tr>
                  <th className="px-8 py-4">Leader</th>
                  <th className="px-8 py-4">Matricule</th>
                  <th className="px-8 py-4">Contact</th>
                  <th className="px-8 py-4 text-center">Dossier</th>
                </tr>
              </thead>

              <tbody className="divide-y-4 divide-sbbsGray">
                {leadersInSelectedPromo.map((l) => (
                  <tr key={l.id} className="hover:bg-sbbsGray/30 transition-colors">
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
                        Aucun leader actif dans cette promotion
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}