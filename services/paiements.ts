// src/services/paiements.ts
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { recomputeLeaderEcheancier } from "./echeancierLeaders";

const COL_PAIEMENTS = "paiements";
const COL_IMPUTATIONS = "paiement_imputations";
const COL_ECHEANCIERS = "echeancier_leaders";

function asNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(input?: string): string {
  if (input) return String(input);

  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function compareAsc(a?: string, b?: string) {
  return String(a || "").localeCompare(String(b || ""));
}

async function listLeaderSchedules(leaderId: string) {
  const q = query(
    collection(db, COL_ECHEANCIERS),
    where("leader_id", "==", leaderId)
  );

  const snap = await getDocs(q);

  return snap.docs
    .map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }))
    .sort((a, b) => {
      const byMonth = compareAsc(a.mois, b.mois);
      if (byMonth !== 0) return byMonth;

      const byDeadline = compareAsc(a.date_limite, b.date_limite);
      if (byDeadline !== 0) return byDeadline;

      return compareAsc(a.id, b.id);
    });
}

async function listLeaderPayments(leaderId: string) {
  const q = query(
    collection(db, COL_PAIEMENTS),
    where("leader_id", "==", leaderId)
  );

  const snap = await getDocs(q);

  return snap.docs
    .map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }))
    .filter((p) => String(p.status || "ACTIF") !== "ANNULE")
    .sort((a, b) => {
      const byDate = compareAsc(
        a.date_paiement || a.date_valeur,
        b.date_paiement || b.date_valeur
      );
      if (byDate !== 0) return byDate;

      const byCreated = compareAsc(
        String(a.created_at?.seconds || ""),
        String(b.created_at?.seconds || "")
      );
      if (byCreated !== 0) return byCreated;

      return compareAsc(a.id, b.id);
    });
}

async function listLeaderImputations(leaderId: string) {
  const q = query(
    collection(db, COL_IMPUTATIONS),
    where("leader_id", "==", leaderId)
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as any),
  }));
}

async function deleteAllLeaderImputations(leaderId: string) {
  const current = await listLeaderImputations(leaderId);
  if (current.length === 0) return;

  let batch = writeBatch(db);
  let count = 0;

  for (const row of current) {
    batch.delete(doc(db, COL_IMPUTATIONS, row.id));
    count++;

    if (count % 400 === 0) {
      await batch.commit();
      batch = writeBatch(db);
    }
  }

  await batch.commit();
}

async function ensureLeaderSchedulesReady(leaderId: string) {
  let schedules = await listLeaderSchedules(leaderId);
  if (schedules.length > 0) return schedules;

  const leaderRef = doc(db, "leaders", leaderId);
  const leaderSnap = await getDoc(leaderRef);

  if (!leaderSnap.exists()) {
    throw new Error("Leader introuvable.");
  }

  const leader = leaderSnap.data() as any;
  const promotionId = String(leader.promotion_id || "").trim();

  if (!promotionId) {
    throw new Error(
      "Ce leader n'a pas de promotion active. Impossible de générer son échéancier."
    );
  }

  await recomputeLeaderEcheancier({
    leaderId,
    promotionId,
    scolarite_base: asNumber(leader.scolarite_base ?? 370000),
    bourse_montant: asNumber(leader.bourse_montant ?? 0),
    preserveFirstAmount: true,
    defaultFirstAmount: 70000,
  });

  schedules = await listLeaderSchedules(leaderId);

  if (schedules.length === 0) {
    throw new Error(
      "Aucune échéance leader disponible après génération automatique."
    );
  }

  return schedules;
}

async function recomputeLeaderImputations(leaderId: string) {
  const schedules = await ensureLeaderSchedulesReady(leaderId);
  const payments = await listLeaderPayments(leaderId);

  await deleteAllLeaderImputations(leaderId);

  if (payments.length === 0) {
    return {
      payments,
      schedules,
      imputedByPayment: new Map<string, number>(),
    };
  }

  const remainByScheduleId = new Map<string, number>();
  for (const s of schedules) {
    remainByScheduleId.set(s.id, Math.max(0, asNumber(s.montant_attendu)));
  }

  const imputationsToCreate: Array<{
    paiement_id: string;
    echeance_leader_id: string;
    leader_id: string;
    promotion_id: string | null;
    mois: string;
    montant_impute: number;
    status: "ACTIF";
  }> = [];

  const imputedByPayment = new Map<string, number>();

  for (const p of payments) {
    let amountLeft = Math.max(0, asNumber(p.montant));
    let totalImputedForPayment = 0;

    for (const s of schedules) {
      if (amountLeft <= 0) break;

      const remain = Math.max(0, asNumber(remainByScheduleId.get(s.id) || 0));
      if (remain <= 0) continue;

      const amountToApply = Math.min(amountLeft, remain);
      if (amountToApply <= 0) continue;

      imputationsToCreate.push({
        paiement_id: p.id,
        echeance_leader_id: s.id,
        leader_id: leaderId,
        promotion_id: s.promotion_id || p.promotion_id || null,
        mois: String(s.mois || ""),
        montant_impute: amountToApply,
        status: "ACTIF",
      });

      remainByScheduleId.set(s.id, remain - amountToApply);
      amountLeft -= amountToApply;
      totalImputedForPayment += amountToApply;
    }

    imputedByPayment.set(p.id, totalImputedForPayment);
  }

  if (imputationsToCreate.length > 0) {
    let batch = writeBatch(db);
    let count = 0;

    for (const row of imputationsToCreate) {
      const ref = doc(collection(db, COL_IMPUTATIONS));
      batch.set(ref, {
        ...row,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      count++;
      if (count % 400 === 0) {
        await batch.commit();
        batch = writeBatch(db);
      }
    }

    await batch.commit();
  }

  let batch = writeBatch(db);
  let count = 0;

  for (const p of payments) {
    batch.update(doc(db, COL_PAIEMENTS, p.id), {
      montant_impute: asNumber(imputedByPayment.get(p.id) || 0),
      updated_at: serverTimestamp(),
    });

    count++;
    if (count % 400 === 0) {
      await batch.commit();
      batch = writeBatch(db);
    }
  }

  await batch.commit();

  return {
    payments,
    schedules,
    imputedByPayment,
  };
}

export async function createPaiementWithAutoImputation(payload: {
  leader_id: string;
  promotion_id: string | null;
  montant: number;
  date_paiement?: string;
  date_valeur?: string;
  mode?: string;
  moyen_paiement?: string;
  reference?: string;
  reference_paiement?: string;
}) {
  const leaderId = String(payload.leader_id || "").trim();
  if (!leaderId) throw new Error("leader_id requis.");

  const montant = asNumber(payload.montant);
  if (montant <= 0) throw new Error("Montant invalide.");

  const datePaiement = normalizeDate(payload.date_paiement || payload.date_valeur);
  const mode = String(payload.mode || payload.moyen_paiement || "WAVE");
  const reference = String(payload.reference || payload.reference_paiement || "");

  const ref = await addDoc(collection(db, COL_PAIEMENTS), {
    leader_id: leaderId,
    promotion_id: payload.promotion_id ?? null,
    montant,
    date_paiement: datePaiement,
    date_valeur: datePaiement,
    mode,
    moyen_paiement: mode,
    reference,
    reference_paiement: reference,
    status: "ACTIF",
    montant_impute: 0,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  const result = await recomputeLeaderImputations(leaderId);
  const imputed = asNumber(result.imputedByPayment.get(ref.id) || 0);

  return {
    paiementId: ref.id,
    imputationsCount: result.payments.length,
    remainingUnimputed: Math.max(0, montant - imputed),
  };
}

export async function updatePaiementWithAutoImputation(
  paiementId: string,
  patch: Partial<{
    montant: number;
    date_paiement: string;
    date_valeur: string;
    mode: string;
    moyen_paiement: string;
    reference: string;
    reference_paiement: string;
    status: string;
  }>
) {
  const paiementRef = doc(db, COL_PAIEMENTS, paiementId);
  const paiementSnap = await getDoc(paiementRef);

  if (!paiementSnap.exists()) {
    throw new Error("Paiement introuvable.");
  }

  const paiement = paiementSnap.data() as any;
  const leaderId = String(paiement.leader_id || "");
  if (!leaderId) throw new Error("leader_id manquant sur le paiement.");

  const updateData: any = {
    updated_at: serverTimestamp(),
  };

  if (patch.montant !== undefined) updateData.montant = asNumber(patch.montant);
  if (patch.date_paiement !== undefined) updateData.date_paiement = patch.date_paiement;
  if (patch.date_valeur !== undefined) updateData.date_valeur = patch.date_valeur;
  if (patch.mode !== undefined) updateData.mode = patch.mode;
  if (patch.moyen_paiement !== undefined) updateData.moyen_paiement = patch.moyen_paiement;
  if (patch.reference !== undefined) updateData.reference = patch.reference;
  if (patch.reference_paiement !== undefined) updateData.reference_paiement = patch.reference_paiement;
  if (patch.status !== undefined) updateData.status = patch.status;

  await updateDoc(paiementRef, updateData);
  await recomputeLeaderImputations(leaderId);
}

export async function deletePaiementWithAutoImputation(paiementId: string) {
  const paiementRef = doc(db, COL_PAIEMENTS, paiementId);
  const paiementSnap = await getDoc(paiementRef);

  if (!paiementSnap.exists()) {
    return;
  }

  const paiement = paiementSnap.data() as any;
  const leaderId = String(paiement.leader_id || "");

  await deleteDoc(paiementRef);

  if (leaderId) {
    await recomputeLeaderImputations(leaderId);
  }
}