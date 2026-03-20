// src/components/DashboardView.tsx
import React, { useMemo, useState } from "react";
import type {
  Promotion,
  Leader,
  Paiement,
  PaiementImputation,
  EcheancierLeader,
} from "../types";

import {
  DataService,
  type PromotionHealthRow,
} from "../services/dataService";
import { computeRiskFromOverdueRows } from "../services/riskScoring";
import { Icons } from "../constants";

interface Props {
  promotions: Promotion[];
  leaders: Leader[];
  paiements: Paiement[];
  imputations: PaiementImputation[];
  schedules: EcheancierLeader[];
}

function asNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(v: number): string {
  return `${asNumber(v).toLocaleString()} F`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function buildLastMonths(endMonth: string, count: number): string[] {
  const [yearStr, monthStr] = String(endMonth || "").split("-");
  let year = Number(yearStr);
  let month = Number(monthStr);

  if (!year || !month) return [];

  const result: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    let y = year;
    let m = month - i;

    while (m <= 0) {
      y -= 1;
      m += 12;
    }

    result.push(`${y}-${pad2(m)}`);
  }

  return result;
}

function buildYearMonths(year: number): string[] {
  if (!year) return [];
  return Array.from({ length: 12 }, (_, i) => `${year}-${pad2(i + 1)}`);
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = String(yyyyMm || "").split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  if (Number.isNaN(date.getTime())) return yyyyMm;

  return date.toLocaleDateString("fr-FR", {
    month: "short",
    year: "2-digit",
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function extractPaiementMonth(p: any): string {
  const raw =
    p.date_paiement ||
    p.date_valeur ||
    p.created_at?.toDate?.()?.toISOString?.() ||
    "";

  if (!raw) return "";

  if (typeof raw === "string" && raw.length >= 7) {
    return raw.slice(0, 7);
  }

  const d = raw?.toDate ? raw.toDate() : new Date(raw);
  if (Number.isNaN(d.getTime())) return "";

  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function getPaiementAmount(p: any): number {
  return asNumber(
    p.montant ?? p.montant_total ?? p.montant_paye ?? p.amount ?? 0
  );
}

const DashboardView: React.FC<Props> = ({
  promotions,
  leaders,
  paiements,
  imputations,
  schedules,
}) => {
  const [viewMode, setViewMode] = useState<"monthly" | "annual">("monthly");
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [promoFilter, setPromoFilter] = useState<string>("all");

  const targetDate =
    viewMode === "monthly" ? selectedMonth : `${selectedYear}-12`;

  const today = todayIso();

  const promotionsStats = useMemo(() => {
    const total = promotions.length;

    const enCours = promotions.filter((p: any) => {
      const endDate = String(
        p.date_fin_reelle || p.date_fin_previsionnelle || "9999-12-31"
      );
      return endDate >= today;
    }).length;

    const achevees = promotions.filter((p: any) => {
      const endDate = String(
        p.date_fin_reelle || p.date_fin_previsionnelle || "9999-12-31"
      );
      return endDate < today;
    }).length;

    return {
      total,
      enCours,
      achevees,
    };
  }, [promotions, today]);

  const leadersStats = useMemo(() => {
    const promoById = new Map<string, any>();
    for (const p of promotions) {
      promoById.set(String(p.id), p);
    }

    const isPromotionAchevee = (promotion: any) => {
      const endDate = String(
        promotion?.date_fin_reelle ||
          promotion?.date_fin_previsionnelle ||
          "9999-12-31"
      );
      return endDate < today;
    };

    const isPromotionEnCours = (promotion: any) => {
      const endDate = String(
        promotion?.date_fin_reelle ||
          promotion?.date_fin_previsionnelle ||
          "9999-12-31"
      );
      return endDate >= today;
    };

    const total = leaders.length;

    const actifs = leaders.filter((l: any) => {
      if (String(l.statut || "").toUpperCase() !== "ACTIF") return false;
      const promo = promoById.get(String(l.promotion_id || ""));
      if (!promo) return false;
      return isPromotionEnCours(promo);
    }).length;

    const acheves = leaders.filter((l: any) => {
      const promo = promoById.get(String(l.promotion_id || ""));
      if (!promo) return false;
      return isPromotionAchevee(promo);
    }).length;

    const attente = leaders.filter(
      (l: any) => String(l.statut || "").toUpperCase() === "ATTENTE"
    ).length;

    const abandons = leaders.filter(
      (l: any) => String(l.statut || "").toUpperCase() === "ABANDON"
    ).length;

    return {
      total,
      actifs,
      acheves,
      attente,
      abandons,
    };
  }, [leaders, promotions, today]);

  const analytics = useMemo(() => {
    const filter = promoFilter === "all" ? null : promoFilter;

    return DataService.computeAnalytics(
      targetDate,
      filter,
      promotions,
      leaders,
      schedules,
      paiements,
      imputations
    );
  }, [
    targetDate,
    promoFilter,
    promotions,
    leaders,
    schedules,
    paiements,
    imputations,
  ]);

  const recoveryForecast = useMemo(() => {
    const filter = promoFilter === "all" ? null : promoFilter;

    return DataService.computeRecoveryForecast(
      targetDate,
      filter,
      promotions,
      leaders,
      schedules,
      imputations
    );
  }, [targetDate, promoFilter, promotions, leaders, schedules, imputations]);

  const promotionHealthRows = useMemo(() => {
    let rows = DataService.computePromotionHealth(
      targetDate,
      promotions,
      leaders,
      schedules,
      paiements,
      imputations
    );

    if (promoFilter !== "all") {
      rows = rows.filter((x) => x.promotionId === promoFilter);
    }

    return rows;
  }, [
    targetDate,
    promotions,
    leaders,
    schedules,
    paiements,
    imputations,
    promoFilter,
  ]);

  const chartData = useMemo(() => {
    const scopePromoIds =
      promoFilter === "all"
        ? new Set(promotions.map((p) => p.id))
        : new Set([promoFilter]);

    const leadersById = new Map<string, any>();
    for (const l of leaders) {
      leadersById.set(String(l.id), l);
    }

    const months =
      viewMode === "monthly"
        ? buildLastMonths(selectedMonth, 6)
        : buildYearMonths(selectedYear);

    const totals = new Map<string, number>();
    for (const m of months) totals.set(m, 0);

    for (const p of paiements as any[]) {
      if (String(p.status || "ACTIF") === "ANNULE") continue;

      const leaderId = String(p.leader_id || "");
      const leader = leadersById.get(leaderId);

      const paymentPromoId = String(
        p.promotion_id || leader?.promotion_id || ""
      );

      if (!scopePromoIds.has(paymentPromoId)) continue;

      const month = extractPaiementMonth(p);
      if (!month || !totals.has(month)) continue;

      totals.set(month, asNumber(totals.get(month)) + getPaiementAmount(p));
    }

    return months.map((m) => ({
      mois: m,
      label: monthLabel(m),
      value: asNumber(totals.get(m) || 0),
    }));
  }, [
    promoFilter,
    promotions,
    leaders,
    paiements,
    viewMode,
    selectedMonth,
    selectedYear,
  ]);

  const maxChartValue = useMemo(() => {
    const max = Math.max(...chartData.map((x) => x.value), 0);
    return max > 0 ? max : 1;
  }, [chartData]);

  const riskDashboardList = useMemo(() => {
    const scopePromoIds =
      promoFilter === "all"
        ? new Set(promotions.map((p) => p.id))
        : new Set([promoFilter]);

    const paidByScheduleId = new Map<string, number>();

    for (const imp of imputations) {
      if (String((imp as any).status || "ACTIF") === "ANNULE") continue;

      const scheduleId = String(
        (imp as any).echeance_leader_id || (imp as any).echeance_id || ""
      );
      if (!scheduleId) continue;

      paidByScheduleId.set(
        scheduleId,
        asNumber(paidByScheduleId.get(scheduleId) || 0) +
          asNumber(imp.montant_impute)
      );
    }

    return leaders
      .filter(
        (l) =>
          l.statut === "ACTIF" &&
          scopePromoIds.has(String(l.promotion_id || ""))
      )
      .map((leader) => {
        const overdueRows = schedules
          .filter((s) => String(s.leader_id || "") === leader.id)
          .filter((s) => String((s as any).date_limite || "") <= today)
          .map((s) => {
            const expected = asNumber((s as any).montant_attendu);
            const paid = asNumber(paidByScheduleId.get(s.id) || 0);
            const remain = Math.max(0, expected - paid);

            return {
              expected,
              paid,
              remain,
              mois: String(s.mois || ""),
            };
          })
          .filter((r) => r.remain > 0)
          .sort((a, b) => String(a.mois).localeCompare(String(b.mois)));

        const risk = computeRiskFromOverdueRows(overdueRows);
        const totalDue = overdueRows.reduce(
          (sum, r) => sum + asNumber(r.remain),
          0
        );

        return {
          id: leader.id,
          nom: leader.nom_complet,
          promo:
            promotions.find((p) => p.id === leader.promotion_id)?.nom_promotion ||
            "PROMOTION",
          totalDue,
          overdueCount: risk.overdueCount,
          unpaidCount: risk.unpaidCount,
          partialCount: risk.partialCount,
          averageCoverageRate: risk.averageCoverageRate,
          riskLevel: risk.level,
          riskColor: risk.color,
          riskRank:
            risk.level === "CRITIQUE"
              ? 4
              : risk.level === "ÉLEVÉ"
              ? 3
              : risk.level === "SURVEILLANCE"
              ? 2
              : 1,
        };
      })
      .filter((x) => x.overdueCount > 0 || x.totalDue > 0)
      .sort((a, b) => {
        if (b.riskRank !== a.riskRank) return b.riskRank - a.riskRank;
        return b.totalDue - a.totalDue;
      });
  }, [promoFilter, promotions, leaders, schedules, imputations, today]);

  const riskSummary = useMemo(() => {
    const init = {
      MODÉRÉ: { count: 0, amount: 0 },
      SURVEILLANCE: { count: 0, amount: 0 },
      ÉLEVÉ: { count: 0, amount: 0 },
      CRITIQUE: { count: 0, amount: 0 },
    };

    for (const item of riskDashboardList) {
      init[item.riskLevel as keyof typeof init].count += 1;
      init[item.riskLevel as keyof typeof init].amount += asNumber(
        item.totalDue
      );
    }

    return init;
  }, [riskDashboardList]);

  const promoPerformance = useMemo(() => {
    return promotions
      .map((p: any) => {
        const stats = DataService.computeAnalytics(
          targetDate,
          p.id,
          promotions,
          leaders,
          schedules,
          paiements,
          imputations
        );

        const objectif = asNumber(p.objectif_recouvrement || 0);
        const montantObjectifCible = (stats.caEchuTotal * objectif) / 100;
        const ecartMontant = stats.encaisseEchuTotal - montantObjectifCible;

        const ratioToGoal =
          objectif > 0 ? (stats.tauxRecouvrement / objectif) * 100 : 0;

        let classification: "ELITE" | "CONFORME" | "SURVEILLANCE" | "CRITIQUE";
        let color: string;

        if (ratioToGoal >= 100) {
          classification = "ELITE";
          color = "bg-sbbsGreen";
        } else if (ratioToGoal >= 90) {
          classification = "CONFORME";
          color = "bg-blue-500";
        } else if (ratioToGoal >= 75) {
          classification = "SURVEILLANCE";
          color = "bg-orange-500";
        } else {
          classification = "CRITIQUE";
          color = "bg-sbbsRed";
        }

        const endDate = String(
          p.date_fin_reelle || p.date_fin_previsionnelle || "9999-12-31"
        );
        const isAchevee = endDate < today;

        return {
          ...p,
          stats,
          objectif,
          montantObjectifCible,
          ecartMontant,
          ratioToGoal,
          classification,
          color,
          isAchevee,
        };
      })
      .sort(
        (a, b) =>
          asNumber(b.stats?.tauxRecouvrement) -
          asNumber(a.stats?.tauxRecouvrement)
      );
  }, [targetDate, promotions, leaders, schedules, paiements, imputations, today]);

  const KPIBox = ({
    title,
    value,
    subValue,
    colorClass,
    icon,
    isNegative = false,
    suffix = "F",
  }: {
    title: string;
    value: number | string;
    subValue?: string;
    colorClass: string;
    icon?: React.ReactNode;
    isNegative?: boolean;
    suffix?: string;
  }) => (
    <div
      className={`bg-white p-6 rounded-3xl border-l-8 ${colorClass} shadow-xl transition-all hover:-translate-y-1`}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="text-[10px] font-black text-sbbsText uppercase tracking-widest opacity-50">
          {title}
        </div>
        <div className="text-sbbsNavy opacity-10">{icon}</div>
      </div>

      <div
        className={`text-2xl font-black ${
          isNegative ? "text-sbbsRed" : "text-sbbsNavy"
        }`}
      >
        {typeof value === "number" ? value.toLocaleString() : value}{" "}
        <span className="text-[10px] opacity-40 uppercase ml-1">
          {suffix}
        </span>
      </div>

      {subValue && (
        <div className="mt-2 text-[9px] font-black text-sbbsNavy bg-sbbsGray px-3 py-1 rounded-lg inline-block uppercase italic">
          {subValue}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-10 animate-fade-in pb-20">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 bg-white p-8 rounded-[3rem] border-4 border-white shadow-2xl">
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-sbbsNavy uppercase tracking-tighter">
            Command Center
          </h2>
          <p className="text-[10px] font-black text-sbbsText uppercase tracking-[0.3em] opacity-40 italic">
            Pilotage financier du recouvrement SBBS
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <select
            value={promoFilter}
            onChange={(e) => setPromoFilter(e.target.value)}
            className="bg-sbbsGray border-none rounded-2xl px-6 py-4 text-[11px] font-black text-sbbsNavy outline-none shadow-inner"
          >
            <option value="all">GLOBAL - TOUTES PROMOS</option>
            {promotions.map((p: any) => (
              <option key={p.id} value={p.id}>
                {String(p.nom_promotion || "PROMOTION").toUpperCase()}
              </option>
            ))}
          </select>

          <div className="flex bg-sbbsGray p-1.5 rounded-2xl shadow-inner">
            <button
              onClick={() => setViewMode("monthly")}
              className={`px-6 py-3 rounded-xl text-[10px] font-black transition-all ${
                viewMode === "monthly"
                  ? "bg-sbbsNavy text-white shadow-lg scale-105"
                  : "text-sbbsText hover:bg-white/50"
              }`}
            >
              MENSUEL
            </button>
            <button
              onClick={() => setViewMode("annual")}
              className={`px-6 py-3 rounded-xl text-[10px] font-black transition-all ${
                viewMode === "annual"
                  ? "bg-sbbsNavy text-white shadow-lg scale-105"
                  : "text-sbbsText hover:bg-white/50"
              }`}
            >
              ANNUEL
            </button>
          </div>

          <input
            type={viewMode === "monthly" ? "month" : "number"}
            value={viewMode === "monthly" ? selectedMonth : selectedYear}
            onChange={(e) =>
              viewMode === "monthly"
                ? setSelectedMonth(e.target.value)
                : setSelectedYear(
                    parseInt(e.target.value || `${new Date().getFullYear()}`, 10)
                  )
            }
            className="bg-sbbsGray border-none rounded-2xl px-6 py-3.5 text-[11px] font-black text-sbbsNavy shadow-inner outline-none w-auto"
          />
        </div>
      </div>

      {/* KPI STRUCTURELS PROMOTIONS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <KPIBox
          title="Total promotions"
          value={promotionsStats.total}
          subValue="Toutes promotions confondues"
          colorClass="border-sbbsNavy"
          icon={<Icons.Promo />}
          suffix=""
        />

        <KPIBox
          title="Promotions en cours"
          value={promotionsStats.enCours}
          subValue="Cycles actuellement actifs"
          colorClass="border-sbbsGreen"
          icon={<Icons.Dashboard />}
          suffix=""
        />

        <KPIBox
          title="Promotions achevées"
          value={promotionsStats.achevees}
          subValue="Cycles terminés"
          colorClass="border-sbbsGray"
          icon={<Icons.Abandon />}
          suffix=""
        />
      </div>

      {/* KPI STRUCTURELS LEADERS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        <KPIBox
          title="Total leaders"
          value={leadersStats.total}
          subValue="Tous inscrits"
          colorClass="border-sbbsNavy"
          icon={<Icons.Profile />}
          suffix=""
        />

        <KPIBox
          title="Leaders actifs"
          value={leadersStats.actifs}
          subValue="Dans les promotions en cours"
          colorClass="border-sbbsGreen"
          icon={<Icons.Dashboard />}
          suffix=""
        />

        <KPIBox
          title="Leaders achevés"
          value={leadersStats.acheves}
          subValue="Dans les promotions achevées"
          colorClass="border-sbbsGray"
          icon={<Icons.Promo />}
          suffix=""
        />

        <KPIBox
          title="En attente"
          value={leadersStats.attente}
          subValue="Leaders non affectés"
          colorClass="border-yellow-400"
          icon={<Icons.Profile />}
          suffix=""
        />

        <KPIBox
          title="Abandons"
          value={leadersStats.abandons}
          subValue="Sortis du cycle"
          colorClass="border-sbbsRed"
          icon={<Icons.Abandon />}
          suffix=""
          isNegative={leadersStats.abandons > 0}
        />
      </div>

      {/* KPI BRUT / BOURSES / NET */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <KPIBox
          title="CA brut total"
          value={analytics.caBrutTotal}
          subValue="Avant déduction des bourses"
          colorClass="border-sbbsNavy"
          icon={<Icons.Dashboard />}
        />

        <KPIBox
          title="Total remises / bourses"
          value={analytics.totalBourses}
          subValue="Déductions accordées"
          colorClass="border-orange-400"
          icon={<Icons.Profile />}
          isNegative={analytics.totalBourses > 0}
        />

        <KPIBox
          title="CA net total"
          value={analytics.caNetTotal}
          subValue="Après déduction des bourses"
          colorClass="border-sbbsGreen"
          icon={<Icons.Payment />}
        />
      </div>

      {/* KPI FINANCIERS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPIBox
          title="CA Échu (Attendu)"
          value={analytics.caEchuTotal}
          subValue="Base exigible à date"
          colorClass="border-sbbsNavy"
          icon={<Icons.Dashboard />}
        />

        <KPIBox
          title="Total Encaissé"
          value={analytics.encaisseEchuTotal}
          subValue={`Performance : ${analytics.tauxRecouvrement.toFixed(1)}%`}
          colorClass="border-sbbsGreen"
          icon={<Icons.Payment />}
        />

        <KPIBox
          title="Reste à Recouvrer"
          value={analytics.resteEchu}
          subValue="Retards de paiement"
          colorClass="border-sbbsRed"
          isNegative={analytics.resteEchu > 0}
          icon={<Icons.Abandon />}
        />

        <div className="bg-sbbsNavy text-white p-6 rounded-3xl shadow-2xl flex flex-col justify-center relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-8 -mt-8 group-hover:scale-110 transition-transform"></div>
          <div className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-2">
            Efficacité globale
          </div>
          <div className="text-4xl font-black">
            {Math.round(analytics.tauxRecouvrement)}%
          </div>
          <div className="mt-3 h-2 w-full bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-sbbsGreen"
              style={{
                width: `${Math.min(analytics.tauxRecouvrement, 100)}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* KPI PRÉVISION */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <KPIBox
          title="Recouvrable probable"
          value={recoveryForecast.recouvrableProbable}
          subValue="Montant potentiellement récupérable"
          colorClass="border-blue-500"
          icon={<Icons.Payment />}
        />

        <KPIBox
          title="CA probable final"
          value={recoveryForecast.caProbableFinal}
          subValue="Projection finale sur les échus"
          colorClass="border-sbbsGreen"
          icon={<Icons.Dashboard />}
        />

        <KPIBox
          title="Perte estimée"
          value={recoveryForecast.perteEstimee}
          subValue="Risque probable de non-recouvrement"
          colorClass="border-sbbsRed"
          isNegative={recoveryForecast.perteEstimee > 0}
          icon={<Icons.Abandon />}
        />
      </div>

      {/* KPI FUTURS / RISQUES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPIBox
          title="Attendus Futurs"
          value={analytics.caFuturTotal}
          subValue="Échéances non encore échues"
          colorClass="border-blue-300"
          icon={<Icons.Promo />}
        />

        <KPIBox
          title="Anticipations / Avances"
          value={analytics.anticipationsTotal}
          subValue="Déjà encaissé sur le futur"
          colorClass="border-emerald-300"
          icon={<Icons.Payment />}
        />

        <KPIBox
          title="Créances Douteuses"
          value={analytics.creancesDouteuses}
          subValue="Promotions achevées non soldées"
          colorClass="border-sbbsRed/40"
          isNegative={analytics.creancesDouteuses > 0}
          icon={<Icons.Abandon />}
        />

        <KPIBox
          title="Pertes sur Abandons"
          value={analytics.perteAbandons}
          subValue={`${analytics.nbAbandons} leaders sortis`}
          colorClass="border-sbbsRed"
          isNegative={analytics.perteAbandons > 0}
          icon={<Icons.Abandon />}
        />
      </div>

      {/* GRAPHIQUE */}
      <div className="bg-white p-10 rounded-[3rem] border-4 border-white shadow-2xl">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h3 className="text-xl font-black text-sbbsNavy uppercase tracking-tighter italic">
              Graphique mensuel des encaissements
            </h3>
            <p className="text-[10px] font-bold text-sbbsText opacity-40 uppercase tracking-widest mt-1">
              Montants réellement encaissés par mois d’entrée en caisse
            </p>
          </div>

          <div className="text-right">
            <div className="text-[10px] font-black uppercase text-sbbsText opacity-50">
              Période affichée
            </div>
            <div className="text-sm font-black text-sbbsNavy">
              {viewMode === "monthly"
                ? `6 derniers mois jusqu’à ${selectedMonth}`
                : `Janvier à Décembre ${selectedYear}`}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-8 items-end">
          <div className="h-[340px] flex items-end gap-4 bg-sbbsGray/30 rounded-[2rem] p-6 border border-sbbsBorder overflow-x-auto">
            {chartData.map((item) => {
              const heightPercent = (item.value / maxChartValue) * 100;

              return (
                <div
                  key={item.mois}
                  className="flex-1 min-w-[72px] h-full flex flex-col justify-end items-center gap-3"
                >
                  <div className="text-[10px] font-black text-sbbsNavy text-center leading-tight min-h-[32px]">
                    {item.value > 0 ? formatMoney(item.value) : "0 F"}
                  </div>

                  <div className="w-full h-[220px] flex items-end">
                    <div
                      className="w-full rounded-t-2xl bg-sbbsNavy shadow-lg hover:opacity-90 transition-all"
                      style={{
                        height: `${Math.max(
                          heightPercent,
                          item.value > 0 ? 6 : 0
                        )}%`,
                      }}
                      title={`${item.label} : ${formatMoney(item.value)}`}
                    />
                  </div>

                  <div className="text-[10px] font-black uppercase text-sbbsText text-center">
                    {item.label}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-sbbsGray/30 rounded-[2rem] p-6 border border-sbbsBorder space-y-4">
            <div className="text-sm font-black uppercase text-sbbsNavy">
              Lecture du graphique
            </div>

            <div className="bg-white rounded-2xl p-4 border border-sbbsBorder">
              <div className="text-[10px] font-black uppercase text-sbbsText opacity-50">
                Pic d’encaissement
              </div>
              <div className="mt-2 text-lg font-black text-sbbsGreen">
                {chartData.length > 0
                  ? formatMoney(
                      Math.max(...chartData.map((x) => asNumber(x.value)), 0)
                    )
                  : "0 F"}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-sbbsBorder">
              <div className="text-[10px] font-black uppercase text-sbbsText opacity-50">
                Total période graphique
              </div>
              <div className="mt-2 text-lg font-black text-sbbsNavy">
                {formatMoney(
                  chartData.reduce((sum, item) => sum + asNumber(item.value), 0)
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-sbbsBorder">
              <div className="text-[10px] font-black uppercase text-sbbsText opacity-50">
                Moyenne mensuelle
              </div>
              <div className="mt-2 text-lg font-black text-sbbsNavy">
                {formatMoney(
                  chartData.length > 0
                    ? chartData.reduce((sum, item) => sum + asNumber(item.value), 0) /
                        chartData.length
                    : 0
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RADAR PROMOTIONS */}
      <div className="bg-white p-10 rounded-[3rem] border-4 border-white shadow-2xl">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h3 className="text-xl font-black text-sbbsNavy uppercase tracking-tighter italic">
              Radar de santé financière des promotions
            </h3>
            <p className="text-[10px] font-bold text-sbbsText opacity-40 uppercase tracking-widest mt-1">
              État de santé du recouvrement par promotion
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black uppercase text-sbbsText border-b-4 border-sbbsGray">
                <th className="px-6 py-4">Promotion</th>
                <th className="px-6 py-4">Santé</th>
                <th className="px-6 py-4">CA brut</th>
                <th className="px-6 py-4">Bourses</th>
                <th className="px-6 py-4">CA attendu</th>
                <th className="px-6 py-4">Encaissé</th>
                <th className="px-6 py-4">Reste</th>
                <th className="px-6 py-4 text-right">Taux</th>
              </tr>
            </thead>

            <tbody className="divide-y-4 divide-sbbsGray">
              {promotionHealthRows.map((row: PromotionHealthRow) => (
                <tr
                  key={row.promotionId}
                  className="hover:bg-sbbsGray/30 transition-colors"
                >
                  <td className="px-6 py-5">
                    <div className="text-sm font-black text-sbbsNavy uppercase">
                      {row.promotionName}
                    </div>
                  </td>

                  <td className="px-6 py-5">
                    <span
                      className={`px-3 py-1 rounded-full text-[8px] font-black uppercase border ${row.santeColor}`}
                    >
                      {row.sante}
                    </span>
                  </td>

                  <td className="px-6 py-5 text-[11px] font-black text-sbbsNavy">
                    {formatMoney(row.caBrutTotal)}
                  </td>

                  <td className="px-6 py-5 text-[11px] font-black text-orange-700">
                    {formatMoney(row.totalBourses)}
                  </td>

                  <td className="px-6 py-5 text-[11px] font-black text-sbbsNavy">
                    {formatMoney(row.caAttendu)}
                  </td>

                  <td className="px-6 py-5 text-[11px] font-black text-sbbsGreen">
                    {formatMoney(row.encaisse)}
                  </td>

                  <td className="px-6 py-5 text-[11px] font-black text-sbbsRed">
                    {formatMoney(row.reste)}
                  </td>

                  <td className="px-6 py-5 text-right">
                    <div className="text-lg font-black text-sbbsNavy">
                      {row.taux.toFixed(1)}%
                    </div>
                  </td>
                </tr>
              ))}

              {promotionHealthRows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-12 text-center text-sbbsText/50 font-bold"
                  >
                    Aucune promotion disponible pour le radar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CRITICITÉ */}
      <div className="bg-white p-10 rounded-[3rem] border-4 border-white shadow-2xl">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h3 className="text-xl font-black text-sbbsNavy uppercase tracking-tighter italic">
              Cartographie des risques de recouvrement
            </h3>
            <p className="text-[10px] font-bold text-sbbsText opacity-40 uppercase tracking-widest mt-1">
              Répartition des dossiers selon le nombre de mensualités échues et leur niveau de couverture
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <div className="bg-green-50 border border-green-200 p-6 rounded-[2rem]">
            <div className="text-[10px] font-black uppercase text-green-700">
              Modéré
            </div>
            <div className="mt-2 text-3xl font-black text-green-900">
              {riskSummary["MODÉRÉ"].count}
            </div>
            <div className="mt-2 text-sm font-black text-green-700">
              {formatMoney(riskSummary["MODÉRÉ"].amount)}
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-[2rem]">
            <div className="text-[10px] font-black uppercase text-yellow-700">
              Surveillance
            </div>
            <div className="mt-2 text-3xl font-black text-yellow-900">
              {riskSummary["SURVEILLANCE"].count}
            </div>
            <div className="mt-2 text-sm font-black text-yellow-700">
              {formatMoney(riskSummary["SURVEILLANCE"].amount)}
            </div>
          </div>

          <div className="bg-orange-50 border border-orange-200 p-6 rounded-[2rem]">
            <div className="text-[10px] font-black uppercase text-orange-700">
              Élevé
            </div>
            <div className="mt-2 text-3xl font-black text-orange-900">
              {riskSummary["ÉLEVÉ"].count}
            </div>
            <div className="mt-2 text-sm font-black text-orange-700">
              {formatMoney(riskSummary["ÉLEVÉ"].amount)}
            </div>
          </div>

          <div className="bg-red-50 border border-red-200 p-6 rounded-[2rem]">
            <div className="text-[10px] font-black uppercase text-red-700">
              Critique
            </div>
            <div className="mt-2 text-3xl font-black text-red-900">
              {riskSummary["CRITIQUE"].count}
            </div>
            <div className="mt-2 text-sm font-black text-red-700">
              {formatMoney(riskSummary["CRITIQUE"].amount)}
            </div>
          </div>
        </div>
      </div>

      {/* SYNTHÈSE */}
      <div className="bg-white p-10 rounded-[3rem] border-4 border-white shadow-2xl">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h3 className="text-xl font-black text-sbbsNavy uppercase tracking-tighter italic">
              Synthèse financière détaillée
            </h3>
            <p className="text-[10px] font-bold text-sbbsText opacity-40 uppercase tracking-widest mt-1">
              Lecture consolidée de la période sélectionnée
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <tbody className="divide-y-2 divide-sbbsGray">
              <tr>
                <td className="px-4 py-4 text-sm font-black text-sbbsNavy uppercase">
                  CA brut total
                </td>
                <td className="px-4 py-4 text-right text-lg font-black text-sbbsNavy">
                  {formatMoney(analytics.caBrutTotal)}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-4 text-sm font-black text-sbbsNavy uppercase">
                  Total remises / bourses
                </td>
                <td className="px-4 py-4 text-right text-lg font-black text-orange-700">
                  {formatMoney(analytics.totalBourses)}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-4 text-sm font-black text-sbbsNavy uppercase">
                  CA net total
                </td>
                <td className="px-4 py-4 text-right text-lg font-black text-sbbsGreen">
                  {formatMoney(analytics.caNetTotal)}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-4 text-sm font-black text-sbbsNavy uppercase">
                  CA échu attendu
                </td>
                <td className="px-4 py-4 text-right text-lg font-black text-sbbsNavy">
                  {formatMoney(analytics.caEchuTotal)}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-4 text-sm font-black text-sbbsNavy uppercase">
                  Montant encaissé
                </td>
                <td className="px-4 py-4 text-right text-lg font-black text-sbbsGreen">
                  {formatMoney(analytics.encaisseEchuTotal)}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-4 text-sm font-black text-sbbsNavy uppercase">
                  Reste à recouvrer
                </td>
                <td className="px-4 py-4 text-right text-lg font-black text-sbbsRed">
                  {formatMoney(analytics.resteEchu)}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-4 text-sm font-black text-sbbsNavy uppercase">
                  Recouvrable probable
                </td>
                <td className="px-4 py-4 text-right text-lg font-black text-blue-700">
                  {formatMoney(recoveryForecast.recouvrableProbable)}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-4 text-sm font-black text-sbbsNavy uppercase">
                  CA probable final
                </td>
                <td className="px-4 py-4 text-right text-lg font-black text-sbbsGreen">
                  {formatMoney(recoveryForecast.caProbableFinal)}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-4 text-sm font-black text-sbbsNavy uppercase">
                  Perte estimée
                </td>
                <td className="px-4 py-4 text-right text-lg font-black text-sbbsRed">
                  {formatMoney(recoveryForecast.perteEstimee)}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-4 text-sm font-black text-sbbsNavy uppercase">
                  Taux de recouvrement
                </td>
                <td className="px-4 py-4 text-right text-lg font-black text-sbbsNavy">
                  {analytics.tauxRecouvrement.toFixed(1)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* CLASSEMENT DES PROMOTIONS */}
      <div className="bg-white p-10 rounded-[3.5rem] border-4 border-white shadow-2xl relative overflow-hidden">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h3 className="text-xl font-black text-sbbsNavy uppercase tracking-tighter italic flex items-center gap-3">
              <span className="p-2 bg-sbbsNavy text-white rounded-lg">
                <Icons.Promo />
              </span>
              Classement de performance des promotions
            </h3>
            <p className="text-[10px] font-bold text-sbbsText opacity-40 uppercase tracking-widest mt-1">
              Promotions classées par taux de recouvrement réel
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black uppercase text-sbbsText border-b-4 border-sbbsGray">
                <th className="px-6 py-4">Rang</th>
                <th className="px-6 py-4">Promotion</th>
                <th className="px-6 py-4">Cycle</th>
                <th className="px-6 py-4">Objectif</th>
                <th className="px-6 py-4">Échu</th>
                <th className="px-6 py-4">Encaissé</th>
                <th className="px-6 py-4">Écart cible</th>
                <th className="px-6 py-4 text-right">Performance</th>
              </tr>
            </thead>

            <tbody className="divide-y-4 divide-sbbsGray">
              {promoPerformance.map((p: any, index: number) => (
                <tr
                  key={p.id}
                  className="group hover:bg-sbbsGray/30 transition-colors"
                >
                  <td className="px-6 py-5">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${
                        index === 0
                          ? "bg-yellow-400 text-white shadow-lg scale-110"
                          : index === 1
                          ? "bg-gray-300 text-white"
                          : index === 2
                          ? "bg-orange-300 text-white"
                          : "bg-sbbsGray text-sbbsNavy"
                      }`}
                    >
                      {index + 1}
                    </div>
                  </td>

                  <td className="px-6 py-5">
                    <div className="text-sm font-black text-sbbsNavy uppercase tracking-tighter">
                      {p.nom_promotion || "PROMOTION"}
                    </div>
                  </td>

                  <td className="px-6 py-5">
                    <span
                      className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${
                        p.isAchevee
                          ? "bg-sbbsNavy text-white"
                          : "bg-blue-100 text-blue-600"
                      }`}
                    >
                      {p.isAchevee ? "ACHEVÉE" : "EN COURS"}
                    </span>
                  </td>

                  <td className="px-6 py-5 text-[10px] font-black text-sbbsText">
                    {asNumber(p.objectif).toFixed(0)}%
                  </td>

                  <td className="px-6 py-5 text-[11px] font-black text-sbbsNavy">
                    {formatMoney(asNumber(p.stats?.caEchuTotal))}
                  </td>

                  <td className="px-6 py-5 text-[11px] font-black text-sbbsGreen">
                    {formatMoney(asNumber(p.stats?.encaisseEchuTotal))}
                  </td>

                  <td
                    className={`px-6 py-5 text-[11px] font-black ${
                      asNumber(p.ecartMontant) >= 0
                        ? "text-sbbsGreen"
                        : "text-sbbsRed"
                    }`}
                  >
                    {formatMoney(asNumber(p.ecartMontant))}
                  </td>

                  <td className="px-6 py-5 text-right">
                    <div
                      className={`text-lg font-black ${
                        asNumber(p.stats?.tauxRecouvrement) >=
                        asNumber(p.objectif)
                          ? "text-sbbsGreen"
                          : "text-sbbsRed"
                      }`}
                    >
                      {asNumber(p.stats?.tauxRecouvrement).toFixed(1)}%
                    </div>
                    <span
                      className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${p.color} text-white`}
                    >
                      {p.classification}
                    </span>
                  </td>
                </tr>
              ))}

              {promoPerformance.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-12 text-center text-sbbsText/50 font-bold"
                  >
                    Aucune promotion disponible.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;