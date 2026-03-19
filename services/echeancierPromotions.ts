// src/services/echeancierPromotions.ts
import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";

export async function createEcheancierPromotion(payload: {
  promotion_id: string;
  mois: string;        // YYYY-MM
  date_limite: string; // YYYY-MM-DD
}) {
  if (!payload.promotion_id || !payload.mois || !payload.date_limite) return;

  await addDoc(collection(db, "echeancier_promotions"), {
    promotion_id: payload.promotion_id,
    mois: payload.mois,
    date_limite: payload.date_limite,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
}

/**
 * Synchronise complètement les templates d’échéancier d’une promotion.
 * - upsert par "mois"
 * - supprime les mois retirés
 */
export async function syncEcheancierPromotionTemplates(
  promotionId: string,
  filledMonths: Array<{ mois: string; date_limite: string }>
) {
  if (!promotionId) return;

  // Normalisation + filtrage
  const wanted = (filledMonths || [])
    .filter((m) => m?.mois && m?.date_limite)
    .map((m) => ({ mois: String(m.mois), date_limite: String(m.date_limite) }));

  // Lire l’existant
  const q = query(collection(db, "echeancier_promotions"), where("promotion_id", "==", promotionId));
  const snap = await getDocs(q);

  const existing = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as any),
  })) as Array<{ id: string; mois?: string; date_limite?: string }>;

  const existingByMois = new Map<string, { id: string; date_limite?: string }>();
  for (const e of existing) {
    const mois = String(e.mois || "");
    if (mois) existingByMois.set(mois, { id: e.id, date_limite: e.date_limite });
  }

  const wantedMoisSet = new Set(wanted.map((m) => m.mois));

  // 1) Upsert: update si existe, sinon add
  for (const m of wanted) {
    const found = existingByMois.get(m.mois);
    if (found) {
      // Update seulement si nécessaire
      if ((found.date_limite || "") !== m.date_limite) {
        await updateDoc(doc(db, "echeancier_promotions", found.id), {
          date_limite: m.date_limite,
          updated_at: serverTimestamp(),
        } as any);
      }
    } else {
      await addDoc(collection(db, "echeancier_promotions"), {
        promotion_id: promotionId,
        mois: m.mois,
        date_limite: m.date_limite,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    }
  }

  // 2) Delete: supprimer ceux qui ne sont plus dans la liste
  for (const e of existing) {
    const mois = String(e.mois || "");
    if (mois && !wantedMoisSet.has(mois)) {
      await deleteDoc(doc(db, "echeancier_promotions", e.id));
    }
  }
}
