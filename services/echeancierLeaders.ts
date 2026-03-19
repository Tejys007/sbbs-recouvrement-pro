// src/services/echeancierLeaders.ts
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

function asNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function compareMonth(a: string, b: string): number {
  return (a || "").localeCompare(b || "");
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

  // 1) charger les templates de la promotion
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

  // 2) charger les échéances actuelles du leader
  const echeancesSnap = await getDocs(
    query(
      collection(db, "echeancier_leaders"),
      where("leader_id", "==", leaderId)
    )
  );

  const existing = echeancesSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((e) => e.promotion_id === promotionId)
    .sort((a, b) => compareMonth(a.mois, b.mois));

  let firstAmount = asNumber(params.defaultFirstAmount ?? 70000);

  if (params.preserveFirstAmount && existing.length > 0) {
    const currentFirst = asNumber(existing[0]?.montant_attendu);
    if (currentFirst > 0) {
      firstAmount = currentFirst;
    }
  }

  const distribution = buildDistribution({
    count: templates.length,
    net: netAPayer,
    firstAmount,
  });

  // 3) upsert des échéances du leader
  for (let i = 0; i < templates.length; i++) {
    const tpl = templates[i];
    const amount = distribution[i] ?? 0;

    const current = existing.find((e) => e.mois === tpl.mois);

    if (current) {
      await updateDoc(doc(db, "echeancier_leaders", current.id), {
        leader_id: leaderId,
        promotion_id: promotionId,
        mois: tpl.mois,
        date_limite: tpl.date_limite,
        montant_attendu: amount,
        updated_at: serverTimestamp(),
      });
    } else {
      await addDoc(collection(db, "echeancier_leaders"), {
        leader_id: leaderId,
        promotion_id: promotionId,
        mois: tpl.mois,
        date_limite: tpl.date_limite,
        montant_attendu: amount,
        montant_verse: 0,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    }
  }

  return true;
}