// src/services/echeancierLeaders.ts
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";

function asNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function compareMonth(a: string, b: string): number {
  return String(a || "").localeCompare(String(b || ""));
}

function getPaymentAmount(p: any): number {
  return asNumber(
    p.montant ??
      p.montant_total ??
      p.montant_paye ??
      p.amount ??
      0
  );
}

function getPaymentDateSortValue(p: any): string {
  return String(
    p.date_paiement ||
      p.date_valeur ||
      p.created_at?.toDate?.()?.toISOString?.() ||
      ""
  );
}

function getScheduleStatus(expected: number, paid: number) {
  if (paid >= expected && expected > 0) return "PAYE";
  if (paid > 0 && paid < expected) return "PARTIEL";
  return "NON PAYE";
}

type RecomputeParams = {
  leaderId: string;
  promotionId: string;

  // compatibilité large avec les différents appels existants
  scolariteBase?: number;
  scolarite_base?: number;

  bourseAmount?: number;
  bourse_montant?: number;

  defaultFirstAmount?: number;
  preserveFirstAmount?: boolean;
};

export async function updateLeaderEcheance(params: {
  echeanceId: string;
  patch: {
    montant_attendu?: number;
    date_limite?: string;
  };
}) {
  const data: any = {
    updated_at: serverTimestamp(),
  };

  if (params.patch.montant_attendu !== undefined) {
    data.montant_attendu = asNumber(params.patch.montant_attendu);
  }

  if (params.patch.date_limite !== undefined) {
    data.date_limite = params.patch.date_limite;
  }

  await updateDoc(doc(db, "echeancier_leaders", params.echeanceId), data);
}

function buildDistribution(params: {
  count: number;
  net: number;
  firstAmount: number;
}) {
  const count = Math.max(0, params.count);
  const net = Math.max(0, asNumber(params.net));
  const firstAmount = Math.max(0, asNumber(params.firstAmount));

  if (count === 0) return [];
  if (count === 1) return [net];

  const first = Math.min(firstAmount, net);
  const reste = Math.max(0, net - first);
  const othersCount = count - 1;

  const base = Math.floor(reste / othersCount);
  const remainder = reste % othersCount;

  const amounts: number[] = [first];

  for (let i = 0; i < othersCount; i++) {
    amounts.push(base + (i < remainder ? 1 : 0));
  }

  return amounts;
}

async function commitDeleteInChunks(docPaths: Array<{ collectionName: string; id: string }>) {
  if (docPaths.length === 0) return;

  let batch = writeBatch(db);
  let count = 0;

  for (const item of docPaths) {
    batch.delete(doc(db, item.collectionName, item.id));
    count++;

    if (count % 400 === 0) {
      await batch.commit();
      batch = writeBatch(db);
    }
  }

  await batch.commit();
}

async function commitUpdateInChunks(
  updates: Array<{
    collectionName: string;
    id: string;
    data: Record<string, any>;
  }>
) {
  if (updates.length === 0) return;

  let batch = writeBatch(db);
  let count = 0;

  for (const item of updates) {
    batch.update(doc(db, item.collectionName, item.id), item.data);
    count++;

    if (count % 400 === 0) {
      await batch.commit();
      batch = writeBatch(db);
    }
  }

  await batch.commit();
}

export async function recomputeLeaderEcheancier(params: RecomputeParams) {
  const leaderId = params.leaderId;
  const promotionId = params.promotionId;

  if (!leaderId) throw new Error("leaderId manquant.");
  if (!promotionId) throw new Error("promotionId manquant.");

  const scolariteBase = asNumber(
    params.scolariteBase ?? params.scolarite_base ?? 370000
  );
  const bourseMontant = asNumber(
    params.bourseAmount ?? params.bourse_montant ?? 0
  );
  const netAPayer = Math.max(0, scolariteBase - bourseMontant);

  // 1) charger les templates de la nouvelle promotion
  const templateSnap = await getDocs(
    query(
      collection(db, "echeancier_promotions"),
      where("promotion_id", "==", promotionId)
    )
  );

  const templates = templateSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .sort((a, b) => compareMonth(a.mois, b.mois));

  if (templates.length === 0) {
    throw new Error("Aucune échéance modèle trouvée pour cette promotion.");
  }

  // 2) charger TOUS les anciens échéanciers du leader
  const echeancesSnap = await getDocs(
    query(
      collection(db, "echeancier_leaders"),
      where("leader_id", "==", leaderId)
    )
  );

  const allExistingSchedules = echeancesSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .sort((a, b) => compareMonth(a.mois, b.mois));

  // 3) conserver le premier montant de la promotion cible si demandé
  let firstAmount = asNumber(params.defaultFirstAmount ?? 70000);

  if (params.preserveFirstAmount) {
    const currentSamePromo = allExistingSchedules
      .filter((e) => String(e.promotion_id || "") === promotionId)
      .sort((a, b) => compareMonth(a.mois, b.mois));

    if (currentSamePromo.length > 0) {
      const currentFirst = asNumber(currentSamePromo[0]?.montant_attendu);
      if (currentFirst > 0) {
        firstAmount = currentFirst;
      }
    }
  }

  const distribution = buildDistribution({
    count: templates.length,
    net: netAPayer,
    firstAmount,
  });

  // 4) supprimer toutes les anciennes imputations du leader
  const imputationsSnap = await getDocs(
    query(
      collection(db, "paiement_imputations"),
      where("leader_id", "==", leaderId)
    )
  );

  const imputationsToDelete = imputationsSnap.docs.map((d) => ({
    collectionName: "paiement_imputations",
    id: d.id,
  }));

  await commitDeleteInChunks(imputationsToDelete);

  // 5) supprimer tous les anciens échéanciers du leader
  const schedulesToDelete = allExistingSchedules.map((s) => ({
    collectionName: "echeancier_leaders",
    id: s.id,
  }));

  await commitDeleteInChunks(schedulesToDelete);

  // 6) créer le nouvel échéancier
  const createdSchedules: Array<{
    id: string;
    mois: string;
    date_limite: string;
    montant_attendu: number;
    montant_verse: number;
    montant_paye: number;
  }> = [];

  for (let i = 0; i < templates.length; i++) {
    const tpl: any = templates[i];
    const amount = asNumber(distribution[i] ?? 0);

    const ref = await addDoc(collection(db, "echeancier_leaders"), {
      leader_id: leaderId,
      promotion_id: promotionId,
      mois: tpl.mois,
      date_limite: tpl.date_limite,
      montant_attendu: amount,
      montant_verse: 0,
      montant_paye: 0,
      reste: amount,
      statut: amount > 0 ? "NON PAYE" : "PAYE",
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    createdSchedules.push({
      id: ref.id,
      mois: String(tpl.mois || ""),
      date_limite: String(tpl.date_limite || ""),
      montant_attendu: amount,
      montant_verse: 0,
      montant_paye: 0,
    });
  }

  // 7) charger tous les paiements du leader pour les réimputer
  const paiementsSnap = await getDocs(
    query(
      collection(db, "paiements"),
      where("leader_id", "==", leaderId)
    )
  );

  const paiements = paiementsSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((p: any) => String(p.status || "ACTIF") !== "ANNULE")
    .sort((a: any, b: any) =>
      getPaymentDateSortValue(a).localeCompare(getPaymentDateSortValue(b))
    );

  const paymentUpdateRows: Array<{
    collectionName: string;
    id: string;
    data: Record<string, any>;
  }> = [];

  const workingSchedules = createdSchedules.map((s) => ({ ...s }));

  // 8) réimputer les paiements du leader sur le nouvel échéancier
  for (const paiement of paiements) {
    let remainingPayment = getPaymentAmount(paiement);
    let totalImputedForThisPayment = 0;

    if (remainingPayment <= 0) {
      paymentUpdateRows.push({
        collectionName: "paiements",
        id: paiement.id,
        data: {
          montant_impute: 0,
          updated_at: serverTimestamp(),
        },
      });
      continue;
    }

    for (const sched of workingSchedules) {
      const alreadyPaid = asNumber(sched.montant_paye);
      const expected = asNumber(sched.montant_attendu);
      const remainingSchedule = Math.max(0, expected - alreadyPaid);

      if (remainingSchedule <= 0) continue;
      if (remainingPayment <= 0) break;

      const toImpute = Math.min(remainingPayment, remainingSchedule);
      if (toImpute <= 0) continue;

      await addDoc(collection(db, "paiement_imputations"), {
        leader_id: leaderId,
        promotion_id: promotionId,
        paiement_id: paiement.id,
        echeance_leader_id: sched.id,
        echeance_id: sched.id,
        mois: sched.mois,
        montant_impute: toImpute,
        status: "ACTIF",
        created_at: serverTimestamp(),
      });

      sched.montant_paye = asNumber(sched.montant_paye) + toImpute;
      sched.montant_verse = asNumber(sched.montant_verse) + toImpute;

      remainingPayment -= toImpute;
      totalImputedForThisPayment += toImpute;
    }

    paymentUpdateRows.push({
      collectionName: "paiements",
      id: paiement.id,
      data: {
        montant_impute: totalImputedForThisPayment,
        updated_at: serverTimestamp(),
      },
    });
  }

  // 9) mettre à jour les paiements avec leur nouveau montant imputé
  await commitUpdateInChunks(paymentUpdateRows);

  // 10) mettre à jour le nouvel échéancier avec les paiements recalculés
  const scheduleUpdateRows = workingSchedules.map((sched) => {
    const expected = asNumber(sched.montant_attendu);
    const paid = asNumber(sched.montant_paye);
    const reste = Math.max(0, expected - paid);
    const statut = getScheduleStatus(expected, paid);

    return {
      collectionName: "echeancier_leaders",
      id: sched.id,
      data: {
        montant_paye: paid,
        montant_verse: paid,
        reste,
        statut,
        updated_at: serverTimestamp(),
      },
    };
  });

  await commitUpdateInChunks(scheduleUpdateRows);

  return true;
}