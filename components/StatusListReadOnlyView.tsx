// src/components/StatusListReadOnlyView.tsx
import React, { useMemo } from "react";
import type {
  EcheancierLeader,
  Leader,
  Paiement,
  PaiementImputation,
  Promotion,
} from "../types";

type Status = "ATTENTE" | "ABANDON";

type Props = {
  title: string;
  status: Status;
  promotions: Promotion[];
  leaders: Leader[];
  schedules: EcheancierLeader[];
  paiements: Paiement[];
  imputations: PaiementImputation[];
};

function asNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function StatusListReadOnlyView(props: Props) {
  const leadersList = useMemo(() => {
    return props.leaders
      .filter((l: any) => l.statut === props.status)
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
      .reduce((s, x: any) => s + asNumber(x.montant_impute), 0);
  }

  function resteNet(leader: any) {
    const base = asNumber(leader.scolarite_base || 370000);
    const bourse = asNumber(leader.bourse_montant || 0);
    const net = Math.max(0, base - bourse);
    return Math.max(0, net - totalVerse(leader.id));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-3xl font-black text-sbbsNavy uppercase">
            {props.title}
          </div>
        </div>

        <div className="px-6 py-3 rounded-2xl bg-blue-50 border border-blue-200 text-blue-800 text-xs font-black uppercase">
          Mode lecture seule
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-2xl border-2 border-sbbsBorder overflow-hidden">
        <div className="p-6 border-b-2 border-sbbsGray">
          <div className="grid grid-cols-5 text-[10px] font-black uppercase text-sbbsText opacity-70">
            <div>Leader</div>
            <div>Dernière promo</div>
            <div>Déjà versé</div>
            <div>Reste net</div>
            <div className="text-right">Observation</div>
          </div>
        </div>

        <div className="divide-y-2 divide-sbbsGray">
          {leadersList.map((l: any) => {
            const originId = l.promotion_origine_id || l.promotion_id || null;
            const origin = originId ? promoById.get(originId) : null;

            return (
              <div key={l.id} className="p-6 grid grid-cols-5 items-center">
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
                      Nouveau (sans promo)
                    </span>
                  )}
                </div>

                <div className="font-black text-green-700">
                  {totalVerse(l.id).toLocaleString()} F
                </div>

                <div className="font-black text-sbbsRed">
                  {resteNet(l).toLocaleString()} F
                </div>

                <div className="text-right">
                  <span className="opacity-50 text-[10px] font-bold uppercase">
                    Consultation
                  </span>
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
    </div>
  );
}