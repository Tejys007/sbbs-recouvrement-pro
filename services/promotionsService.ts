// src/services/promotionsService.ts
import { db } from "../firebase";
import { collection, getDocs, orderBy, query, Timestamp } from "firebase/firestore";

export type PromotionDoc = {
  id: string;

  // Champs Firestore
  name: string;
  isActive: boolean;
  createdAt?: Timestamp;

  // Champs attendus UI (on fournit des défauts)
  nom_promotion: string;
  objectif_recouvrement: number;
  date_fin_previsionnelle?: string;
  date_fin_reelle?: string;
};

export async function listPromotions(): Promise<PromotionDoc[]> {
  const ref = collection(db, "promotions");
  const qy = query(ref, orderBy("createdAt", "desc"));
  const snap = await getDocs(qy);

  return snap.docs.map((d) => {
    const data = d.data() as any;

    const name = (data.name ?? "").toString();

    const objectif = Number.isFinite(Number(data.objectif_recouvrement))
      ? Number(data.objectif_recouvrement)
      : 100;

    return {
      id: d.id,
      name,
      isActive: Boolean(data.isActive),
      createdAt: data.createdAt,

      nom_promotion: (data.nom_promotion ?? name).toString(),
      objectif_recouvrement: objectif,
      date_fin_previsionnelle:
        typeof data.date_fin_previsionnelle === "string" ? data.date_fin_previsionnelle : undefined,
      date_fin_reelle:
        typeof data.date_fin_reelle === "string" ? data.date_fin_reelle : undefined,
    };
  });
}
