// src/components/PaymentsReadOnlyView.tsx
import React, { useMemo, useState } from "react";
import type { Leader, Paiement, PaiementImputation, Promotion } from "../types";

function currentYYYYMM() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
}

function asNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

interface Props {
  promotions: Promotion[];
  leaders: Leader[];
  paiements: Paiement[];
  imputations?: PaiementImputation[];
}

export default function PaymentsReadOnlyView(props: Props) {
  const [filterMonth, setFilterMonth] = useState<string>(currentYYYYMM());

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

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl border border-sbbsBorder">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sbbsNavy text-2xl font-black uppercase tracking-tight">
              Grand livre de caisse
            </div>
            <div className="text-sbbsText/60 text-[10px] font-bold uppercase tracking-widest mt-1">
              Consultation des encaissements — lecture seule
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="px-4 py-3 rounded-2xl border-2 border-sbbsBorder outline-none font-black text-sbbsNavy"
            />

            <div className="px-4 py-3 rounded-2xl bg-blue-50 border border-blue-200 text-blue-800 text-[10px] font-black uppercase">
              Lecture seule
            </div>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-sbbsGray text-[10px] font-black uppercase text-sbbsText">
              <tr>
                <th className="px-4 py-3">Date / Leader</th>
                <th className="px-4 py-3">Promotion</th>
                <th className="px-4 py-3">Moyen / Réf</th>
                <th className="px-4 py-3 text-right">Montant</th>
                <th className="px-4 py-3 text-right">Imputé</th>
              </tr>
            </thead>

            <tbody className="divide-y-2 divide-sbbsGray">
              {paiementsForUI.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center opacity-50">
                    Aucun paiement sur ce mois.
                  </td>
                </tr>
              )}

              {paiementsForUI.map((p) => {
                const l = props.leaders.find((x) => x.id === (p as any).leader_id);
                const promo = props.promotions.find(
                  (x) => x.id === ((p as any).promotion_id || l?.promotion_id)
                );

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

                    <td className="px-4 py-4 text-[11px] font-bold text-sbbsText uppercase">
                      {promo?.nom_promotion || "—"}
                    </td>

                    <td className="px-4 py-4 text-[11px] font-bold text-sbbsText">
                      {(p as any).mode || (p as any).moyen_paiement || "—"}
                      <div className="text-[10px] opacity-50">
                        {(p as any).reference || (p as any).reference_paiement || ""}
                      </div>
                    </td>

                    <td className="px-4 py-4 text-right text-[13px] font-black text-sbbsNavy">
                      {asNumber((p as any).montant).toLocaleString()} F
                    </td>

                    <td className="px-4 py-4 text-right text-[13px] font-black text-sbbsGreen">
                      {asNumber((p as any).montant_impute).toLocaleString()} F
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
      </div>
    </div>
  );
}