// src/services/dataService.ts
import * as XLSX from "xlsx";

import type {
  Promotion,
  Leader,
  Paiement,
  PaiementImputation,
  EcheancierLeader,
} from "../types";

export type Analytics = {
  // Échus
  caEchuTotal: number;
  encaisseEchuTotal: number;
  resteEchu: number;
  tauxRecouvrement: number;

  // Futurs
  caFuturTotal: number;
  anticipationsTotal: number;

  // Compatibilité avec l'ancien nom utilisé dans le dashboard
  encaisseFuturTotal: number;

  // Bourses / remises
  totalBourses: number;
  caBrutTotal: number;
  caNetTotal: number;

  // Risques
  creancesDouteuses: number;
  perteAbandons: number;
  nbAbandons: number;
};

export type RecoveryForecast = {
  recouvrableProbable: number;
  perteEstimee: number;
  caProbableFinal: number;
};

export type PromotionHealthRow = {
  promotionId: string;
  promotionName: string;
  caAttendu: number;
  encaisse: number;
  reste: number;
  taux: number;
  recouvrableProbable: number;
  perteEstimee: number;
  caProbableFinal: number;
  totalBourses: number;
  caBrutTotal: number;
  caNetTotal: number;
  sante: "SAINE" | "STABLE" | "FRAGILE" | "DANGER";
  santeColor: string;
};

function asNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isMonthLE(a: string, b: string): boolean {
  return String(a || "").localeCompare(String(b || "")) <= 0;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function getPromoEndDate(p: Promotion): string {
  return String(
    (p as any).date_fin_reelle ||
      (p as any).date_fin_previsionnelle ||
      (p as any).date_fin ||
      "9999-12-31"
  );
}

function getImputationScheduleId(imp: PaiementImputation): string {
  return String((imp as any).echeance_leader_id || (imp as any).echeance_id || "");
}

function monthsLateBetween(scheduleMonth: string, referenceMonth: string): number {
  const [sy, sm] = String(scheduleMonth || "").split("-").map(Number);
  const [ry, rm] = String(referenceMonth || "").split("-").map(Number);

  if (!sy || !sm || !ry || !rm) return 0;

  return (ry - sy) * 12 + (rm - sm);
}

function recoveryProbability(monthsLate: number): number {
  if (monthsLate >= 4) return 0.2;
  if (monthsLate === 3) return 0.5;
  if (monthsLate === 2) return 0.7;
  return 0.9;
}

function getHealthMeta(taux: number): {
  sante: "SAINE" | "STABLE" | "FRAGILE" | "DANGER";
  santeColor: string;
} {
  if (taux >= 95) {
    return {
      sante: "SAINE",
      santeColor: "bg-green-100 text-green-800 border-green-200",
    };
  }

  if (taux >= 85) {
    return {
      sante: "STABLE",
      santeColor: "bg-blue-100 text-blue-800 border-blue-200",
    };
  }

  if (taux >= 70) {
    return {
      sante: "FRAGILE",
      santeColor: "bg-orange-100 text-orange-800 border-orange-200",
    };
  }

  return {
    sante: "DANGER",
    santeColor: "bg-red-100 text-red-800 border-red-200",
  };
}

export const DataService = {
  computeAnalytics(
    targetDate: string,
    promoId: string | null,
    promotions: Promotion[],
    leaders: Leader[],
    schedules: EcheancierLeader[],
    paiements: Paiement[],
    imputations: PaiementImputation[]
  ): Analytics {
    const scopePromos = promoId
      ? promotions.filter((p) => p.id === promoId)
      : promotions;

    const scopePromoIds = new Set(scopePromos.map((p) => p.id));

    const scopeLeaders = leaders.filter((l) =>
      scopePromoIds.has(String(l.promotion_id || ""))
    );
    const scopeLeaderIds = new Set(scopeLeaders.map((l) => l.id));

    const scopeSchedules = schedules.filter(
      (s) =>
        scopeLeaderIds.has(String(s.leader_id || "")) &&
        scopePromoIds.has(String(s.promotion_id || ""))
    );

    const schedById = new Map<string, EcheancierLeader>();
    for (const s of scopeSchedules) {
      schedById.set(s.id, s);
    }

    const scopePaiements = paiements.filter((p) =>
      scopeLeaderIds.has(String(p.leader_id || ""))
    );

    const paiementById = new Map<string, Paiement>();
    for (const p of scopePaiements) {
      paiementById.set(p.id, p);
    }

    const scopeImputations = imputations.filter((imp) => {
      const lid = String(imp.leader_id || "");
      const sid = getImputationScheduleId(imp);
      return scopeLeaderIds.has(lid) && schedById.has(sid);
    });

    let caEchuTotal = 0;
    let caFuturTotal = 0;

    for (const s of scopeSchedules) {
      const mois = String(s.mois || "");
      const attendu = asNumber((s as any).montant_attendu);

      if (isMonthLE(mois, targetDate)) {
        caEchuTotal += attendu;
      } else {
        caFuturTotal += attendu;
      }
    }

    let encaisseEchuTotal = 0;
    let anticipationsTotal = 0;

    for (const imp of scopeImputations) {
      if (String((imp as any).status || "ACTIF") === "ANNULE") continue;

      const sid = getImputationScheduleId(imp);
      const s = schedById.get(sid);
      if (!s) continue;

      const mois = String(s.mois || "");
      const montant = asNumber(imp.montant_impute);

      if (isMonthLE(mois, targetDate)) {
        encaisseEchuTotal += montant;
      } else {
        anticipationsTotal += montant;
      }
    }

    const resteEchu = Math.max(0, caEchuTotal - encaisseEchuTotal);
    const tauxRecouvrement =
      caEchuTotal > 0 ? (encaisseEchuTotal / caEchuTotal) * 100 : 0;

    // ✅ Bourses / remises
    const totalBourses = scopeLeaders.reduce(
      (sum, l: any) => sum + asNumber(l.bourse_montant),
      0
    );

    const caBrutTotal = scopeLeaders.reduce(
      (sum, l: any) => sum + asNumber(l.scolarite_base),
      0
    );

    const caNetTotal = Math.max(0, caBrutTotal - totalBourses);

    const today = todayISO();

    const endedPromoIds = new Set(
      scopePromos
        .filter((p) => getPromoEndDate(p) < today)
        .map((p) => p.id)
    );

    const attenduByPromo = new Map<string, number>();
    for (const s of scopeSchedules) {
      const pid = String(s.promotion_id || "");
      if (!endedPromoIds.has(pid)) continue;

      attenduByPromo.set(
        pid,
        (attenduByPromo.get(pid) || 0) + asNumber((s as any).montant_attendu)
      );
    }

    const encaisseByPromo = new Map<string, number>();
    for (const imp of scopeImputations) {
      if (String((imp as any).status || "ACTIF") === "ANNULE") continue;

      const sid = getImputationScheduleId(imp);
      const s = schedById.get(sid);
      if (!s) continue;

      const pid = String(s.promotion_id || "");
      if (!endedPromoIds.has(pid)) continue;

      encaisseByPromo.set(
        pid,
        (encaisseByPromo.get(pid) || 0) + asNumber(imp.montant_impute)
      );
    }

    let creancesDouteuses = 0;
    for (const pid of endedPromoIds) {
      const attendu = attenduByPromo.get(pid) || 0;
      const encaisse = encaisseByPromo.get(pid) || 0;
      creancesDouteuses += Math.max(0, attendu - encaisse);
    }

    const abandonedLeaders = scopeLeaders.filter((l) => l.statut === "ABANDON");
    const abandonedIds = new Set(abandonedLeaders.map((l) => l.id));
    const nbAbandons = abandonedLeaders.length;

    const attenduByLeader = new Map<string, number>();
    for (const s of scopeSchedules) {
      const lid = String(s.leader_id || "");
      if (!abandonedIds.has(lid)) continue;

      attenduByLeader.set(
        lid,
        (attenduByLeader.get(lid) || 0) + asNumber((s as any).montant_attendu)
      );
    }

    const encaisseByLeader = new Map<string, number>();
    for (const imp of scopeImputations) {
      if (String((imp as any).status || "ACTIF") === "ANNULE") continue;

      const lid = String(imp.leader_id || "");
      if (!abandonedIds.has(lid)) continue;

      encaisseByLeader.set(
        lid,
        (encaisseByLeader.get(lid) || 0) + asNumber(imp.montant_impute)
      );
    }

    let perteAbandons = 0;
    for (const lid of abandonedIds) {
      const attendu = attenduByLeader.get(lid) || 0;
      const encaisse = encaisseByLeader.get(lid) || 0;
      perteAbandons += Math.max(0, attendu - encaisse);
    }

    return {
      caEchuTotal: Math.round(caEchuTotal),
      encaisseEchuTotal: Math.round(encaisseEchuTotal),
      resteEchu: Math.round(resteEchu),
      tauxRecouvrement,

      caFuturTotal: Math.round(caFuturTotal),
      anticipationsTotal: Math.round(anticipationsTotal),

      encaisseFuturTotal: Math.round(anticipationsTotal),

      totalBourses: Math.round(totalBourses),
      caBrutTotal: Math.round(caBrutTotal),
      caNetTotal: Math.round(caNetTotal),

      creancesDouteuses: Math.round(creancesDouteuses),
      perteAbandons: Math.round(perteAbandons),
      nbAbandons,
    };
  },

  computeRecoveryForecast(
    targetDate: string,
    promoId: string | null,
    promotions: Promotion[],
    leaders: Leader[],
    schedules: EcheancierLeader[],
    imputations: PaiementImputation[]
  ): RecoveryForecast {
    const scopePromos = promoId
      ? promotions.filter((p) => p.id === promoId)
      : promotions;

    const scopePromoIds = new Set(scopePromos.map((p) => p.id));

    const scopeLeaders = leaders.filter((l) =>
      scopePromoIds.has(String(l.promotion_id || ""))
    );
    const scopeLeaderIds = new Set(scopeLeaders.map((l) => l.id));

    const scopeSchedules = schedules.filter(
      (s) =>
        scopeLeaderIds.has(String(s.leader_id || "")) &&
        scopePromoIds.has(String(s.promotion_id || "")) &&
        isMonthLE(String(s.mois || ""), targetDate)
    );

    const paidBySchedule = new Map<string, number>();

    for (const imp of imputations) {
      if (String((imp as any).status || "ACTIF") === "ANNULE") continue;

      const leaderId = String(imp.leader_id || "");
      if (!scopeLeaderIds.has(leaderId)) continue;

      const schedId = getImputationScheduleId(imp);
      if (!schedId) continue;

      paidBySchedule.set(
        schedId,
        asNumber(paidBySchedule.get(schedId) || 0) + asNumber(imp.montant_impute)
      );
    }

    let caEchu = 0;
    let encaisse = 0;
    let recouvrableProbable = 0;
    let perteEstimee = 0;

    for (const s of scopeSchedules) {
      const attendu = asNumber((s as any).montant_attendu);
      const paye = asNumber(paidBySchedule.get(s.id) || 0);
      const reste = Math.max(0, attendu - paye);

      caEchu += attendu;
      encaisse += paye;

      if (reste <= 0) continue;

      const late = monthsLateBetween(String(s.mois || ""), targetDate);
      const proba = recoveryProbability(late);

      recouvrableProbable += reste * proba;
      perteEstimee += reste * (1 - proba);
    }

    const caProbableFinal = encaisse + recouvrableProbable;

    return {
      recouvrableProbable: Math.round(recouvrableProbable),
      perteEstimee: Math.round(perteEstimee),
      caProbableFinal: Math.round(Math.min(caProbableFinal, caEchu)),
    };
  },

  computePromotionHealth(
    targetDate: string,
    promotions: Promotion[],
    leaders: Leader[],
    schedules: EcheancierLeader[],
    paiements: Paiement[],
    imputations: PaiementImputation[]
  ): PromotionHealthRow[] {
    return promotions
      .map((promo) => {
        const analytics = this.computeAnalytics(
          targetDate,
          promo.id,
          promotions,
          leaders,
          schedules,
          paiements,
          imputations
        );

        const forecast = this.computeRecoveryForecast(
          targetDate,
          promo.id,
          promotions,
          leaders,
          schedules,
          imputations
        );

        const health = getHealthMeta(analytics.tauxRecouvrement);

        return {
          promotionId: promo.id,
          promotionName: String(promo.nom_promotion || "PROMOTION"),
          caAttendu: analytics.caEchuTotal,
          encaisse: analytics.encaisseEchuTotal,
          reste: analytics.resteEchu,
          taux: analytics.tauxRecouvrement,
          recouvrableProbable: forecast.recouvrableProbable,
          perteEstimee: forecast.perteEstimee,
          caProbableFinal: forecast.caProbableFinal,
          totalBourses: analytics.totalBourses,
          caBrutTotal: analytics.caBrutTotal,
          caNetTotal: analytics.caNetTotal,
          sante: health.sante,
          santeColor: health.santeColor,
        };
      })
      .sort((a, b) => b.taux - a.taux);
  },

  exportRelancesExcel(overdueList: any[], targetMonth: string) {
    const rows = (overdueList || []).map((item, index) => ({
      Rang: index + 1,
      Matricule: item.matricule || "",
      Nom: item.nom || "",
      Telephone: item.telephone || "",
      Promotion: item.promo || "",
      "Reste dû": asNumber(item.reste),
      "Mois cible": targetMonth || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "Relances");

    const safeMonth = String(targetMonth || "export").replace(/[^\d-]/g, "");
    XLSX.writeFile(workbook, `relances-${safeMonth}.xlsx`);
  },

  exportDetailedRelancesExcel(overdueList: any[], targetMonth: string) {
    const syntheseRows = (overdueList || []).map((item: any, index: number) => ({
      Rang: index + 1,
      Matricule: item.matricule || "",
      "Nom complet": item.nom || "",
      Telephone: item.telephone || "",
      Promotion: item.promo || "",
      "Total dû": asNumber(item.reste),
      "Nombre de mois impayés": Array.isArray(item.details) ? item.details.length : 0,
      "Mois cible": targetMonth || "",
    }));

    const detailsRows = (overdueList || []).flatMap((item: any, index: number) => {
      const details = Array.isArray(item.details) ? item.details : [];

      if (details.length === 0) {
        return [
          {
            Rang: index + 1,
            Matricule: item.matricule || "",
            "Nom complet": item.nom || "",
            Telephone: item.telephone || "",
            Promotion: item.promo || "",
            "Mois impayé": "",
            "Montant attendu": 0,
            "Montant versé": 0,
            "Montant dû": 0,
            "Total leader": asNumber(item.reste),
          },
        ];
      }

      return details.map((d: any) => ({
        Rang: index + 1,
        Matricule: item.matricule || "",
        "Nom complet": item.nom || "",
        Telephone: item.telephone || "",
        Promotion: item.promo || "",
        "Mois impayé": d.mois || "",
        "Montant attendu": asNumber(d.attendu),
        "Montant versé": asNumber(d.paye),
        "Montant dû": asNumber(d.reste),
        "Total leader": asNumber(item.reste),
      }));
    });

    const workbook = XLSX.utils.book_new();

    const wsSynthese = XLSX.utils.json_to_sheet(syntheseRows);
    const wsDetails = XLSX.utils.json_to_sheet(detailsRows);

    XLSX.utils.book_append_sheet(workbook, wsSynthese, "Synthese");
    XLSX.utils.book_append_sheet(workbook, wsDetails, "Details");

    const safeMonth = String(targetMonth || "export").replace(/[^\d-]/g, "");
    XLSX.writeFile(workbook, `relances-detaillees-${safeMonth}.xlsx`);
  },
};