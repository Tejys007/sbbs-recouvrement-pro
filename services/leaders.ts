// src/services/leaders.ts
import { auth, db } from "../firebase";
import { recomputeLeaderEcheancier } from "./echeancierLeaders";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

type CreateLeaderInput = {
  promotion_id: string | null;
  nom_complet: string;
  telephone: string;
  scolarite_base: number;
  bourse_montant: number;
  statut?: "ACTIF" | "ATTENTE" | "ABANDON";
  promotion_origine_id?: string | null;
};

function pad4(n: number) {
  return String(n).padStart(4, "0");
}

function yearYY(date = new Date()) {
  return String(date.getFullYear()).slice(-2);
}

function asBool(v: any) {
  return v === true;
}

async function logLeaderAction(payload: {
  action: string;
  entity_id: string;
  message: string;
  metadata?: Record<string, any>;
}) {
  const user = auth.currentUser;

  await addDoc(collection(db, "activity_logs"), {
    actor_uid: user?.uid || null,
    actor_email: user?.email || null,
    action: payload.action,
    entity: "leaders",
    entity_id: payload.entity_id,
    message: payload.message,
    metadata: payload.metadata || {},
    created_at: serverTimestamp(),
  });
}

async function ensureUniquePhone(telephone: string) {
  const q = query(collection(db, "leaders"), where("telephone", "==", telephone));
  const snap = await getDocs(q);

  const existing = snap.docs.find((d) => {
    const data = d.data() as any;
    return !asBool(data.deleted);
  });

  if (existing) {
    throw new Error("Ce numéro de téléphone existe déjà pour un autre leader.");
  }
}

async function nextMatriculeTx(): Promise<string> {
  const yy = yearYY();
  const counterId = `leaders_matricule_${yy}`;
  const counterRef = doc(db, "counters", counterId);

  const matricule = await runTransaction(db, async (tx) => {
    const cSnap = await tx.get(counterRef);
    let value = 0;

    if (!cSnap.exists()) {
      value = 1;
      tx.set(
        counterRef,
        { value, yy, updated_at: serverTimestamp() },
        { merge: true }
      );
    } else {
      const cur = Number((cSnap.data() as any)?.value ?? 0);
      value = cur + 1;
      tx.set(
        counterRef,
        { value, yy, updated_at: serverTimestamp() },
        { merge: true }
      );
    }

    return `SBBS-${yy}-${pad4(value)}`;
  });

  return matricule;
}

export async function createLeaderWithMatricule(input: CreateLeaderInput) {
  const statut = input.statut ?? (input.promotion_id ? "ACTIF" : "ATTENTE");

  await ensureUniquePhone(input.telephone);

  const matricule = await nextMatriculeTx();

  const leaderRef = doc(collection(db, "leaders"));
  await setDoc(
    leaderRef,
    {
      promotion_id: input.promotion_id ?? null,
      promotion_origine_id: input.promotion_origine_id ?? null,
      nom_complet: (input.nom_complet || "").trim().toUpperCase(),
      telephone: (input.telephone || "").trim(),
      matricule,
      scolarite_base: Number(input.scolarite_base ?? 0),
      bourse_montant: Number(input.bourse_montant ?? 0),
      statut,
      deleted: false,
      deleted_at: null,
      deleted_by_uid: null,
      deleted_by_email: null,
      restored_at: null,
      restored_by_uid: null,
      restored_by_email: null,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      status_changed_at: serverTimestamp(),
    },
    { merge: true }
  );

  // ✅ Génération automatique de l’échéancier dès création
  if (input.promotion_id && statut === "ACTIF") {
    await recomputeLeaderEcheancier({
      leaderId: leaderRef.id,
      promotionId: input.promotion_id,
      scolarite_base: Number(input.scolarite_base ?? 0),
      bourse_montant: Number(input.bourse_montant ?? 0),
      preserveFirstAmount: true,
      defaultFirstAmount: 70000,
    } as any);
  }

  await logLeaderAction({
    action: "CREATE_LEADER",
    entity_id: leaderRef.id,
    message: `Création du leader ${(input.nom_complet || "").trim().toUpperCase()}`,
    metadata: {
      matricule,
      telephone: (input.telephone || "").trim(),
      promotion_id: input.promotion_id ?? null,
      statut,
    },
  });

  return { id: leaderRef.id, matricule };
}

export async function setLeaderStatusAndDetach(
  leaderId: string,
  statut: "ACTIF" | "ATTENTE" | "ABANDON",
  opts?: { promotionIdForActif?: string }
) {
  const leaderRef = doc(db, "leaders", leaderId);

  let scolariteBase = 0;
  let bourseMontant = 0;
  let promotionIdUsed: string | null = null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(leaderRef);
    if (!snap.exists()) throw new Error("Leader introuvable.");
    const data = snap.data() as any;

    scolariteBase = Number(data?.scolarite_base ?? 0);
    bourseMontant = Number(data?.bourse_montant ?? 0);

    const currentPromo = data.promotion_id ?? null;
    const originPromo = data.promotion_origine_id ?? null;

    if (statut === "ACTIF") {
      const promotionIdForActif = opts?.promotionIdForActif ?? null;
      if (!promotionIdForActif) {
        throw new Error("promotionIdForActif requis pour ACTIF.");
      }

      promotionIdUsed = promotionIdForActif;

      tx.update(leaderRef, {
        statut: "ACTIF",
        promotion_id: promotionIdForActif,
        promotion_origine_id: originPromo ?? currentPromo ?? null,
        updated_at: serverTimestamp(),
        status_changed_at: serverTimestamp(),
      });
      return;
    }

    tx.update(leaderRef, {
      statut,
      promotion_origine_id: originPromo ?? currentPromo ?? null,
      promotion_id: null,
      updated_at: serverTimestamp(),
      status_changed_at: serverTimestamp(),
    });
  });

  // ✅ Si réaffectation en ACTIF, on régénère automatiquement l’échéancier
  if (statut === "ACTIF" && promotionIdUsed) {
    await recomputeLeaderEcheancier({
      leaderId,
      promotionId: promotionIdUsed,
      scolarite_base: scolariteBase,
      bourse_montant: bourseMontant,
      preserveFirstAmount: true,
      defaultFirstAmount: 70000,
    } as any);
  }

  await logLeaderAction({
    action: "UPDATE_LEADER_STATUS",
    entity_id: leaderId,
    message: `Changement de statut du leader ${leaderId} vers ${statut}`,
    metadata: {
      statut,
      promotionIdForActif: opts?.promotionIdForActif ?? null,
    },
  });
}

export async function softDeleteLeader(leaderId: string) {
  if (!leaderId) throw new Error("leaderId manquant.");

  const user = auth.currentUser;
  const leaderRef = doc(db, "leaders", leaderId);
  const leaderSnap = await getDoc(leaderRef);

  if (!leaderSnap.exists()) {
    throw new Error("Leader introuvable.");
  }

  const data = leaderSnap.data() as any;

  await updateDoc(leaderRef, {
    deleted: true,
    deleted_at: serverTimestamp(),
    deleted_by_uid: user?.uid || null,
    deleted_by_email: user?.email || null,
    updated_at: serverTimestamp(),
  } as any);

  await logLeaderAction({
    action: "SOFT_DELETE_LEADER",
    entity_id: leaderId,
    message: `Suppression logique du leader ${data?.nom_complet || leaderId}`,
    metadata: {
      matricule: data?.matricule || null,
      promotion_id: data?.promotion_id || null,
      statut: data?.statut || null,
    },
  });

  return true;
}

export async function restoreLeader(leaderId: string) {
  if (!leaderId) throw new Error("leaderId manquant.");

  const user = auth.currentUser;
  const leaderRef = doc(db, "leaders", leaderId);
  const leaderSnap = await getDoc(leaderRef);

  if (!leaderSnap.exists()) {
    throw new Error("Leader introuvable.");
  }

  const data = leaderSnap.data() as any;

  await updateDoc(leaderRef, {
    deleted: false,
    deleted_at: null,
    deleted_by_uid: null,
    deleted_by_email: null,
    restored_at: serverTimestamp(),
    restored_by_uid: user?.uid || null,
    restored_by_email: user?.email || null,
    updated_at: serverTimestamp(),
  } as any);

  await logLeaderAction({
    action: "RESTORE_LEADER",
    entity_id: leaderId,
    message: `Restauration du leader ${data?.nom_complet || leaderId}`,
    metadata: {
      matricule: data?.matricule || null,
      promotion_id: data?.promotion_id || null,
      statut: data?.statut || null,
    },
  });

  return true;
}

async function deleteDocsByLeaderId(collectionName: string, leaderId: string) {
  const q = query(collection(db, collectionName), where("leader_id", "==", leaderId));
  const snap = await getDocs(q);

  if (snap.empty) return;

  let batch = writeBatch(db);
  let count = 0;

  for (const d of snap.docs) {
    batch.delete(doc(db, collectionName, d.id));
    count++;

    if (count % 400 === 0) {
      await batch.commit();
      batch = writeBatch(db);
    }
  }

  await batch.commit();
}

export async function permanentlyDeleteLeader(leaderId: string) {
  if (!leaderId) throw new Error("leaderId manquant.");

  const leaderRef = doc(db, "leaders", leaderId);
  const leaderSnap = await getDoc(leaderRef);

  if (!leaderSnap.exists()) {
    throw new Error("Leader introuvable.");
  }

  const data = leaderSnap.data() as any;

  await deleteDocsByLeaderId("paiement_imputations", leaderId);
  await deleteDocsByLeaderId("paiements", leaderId);
  await deleteDocsByLeaderId("echeancier_leaders", leaderId);
  await deleteDocsByLeaderId("relance_notes", leaderId);

  const batch = writeBatch(db);
  batch.delete(leaderRef);
  await batch.commit();

  await logLeaderAction({
    action: "DELETE_LEADER",
    entity_id: leaderId,
    message: `Suppression définitive du leader ${data?.nom_complet || leaderId}`,
    metadata: {
      matricule: data?.matricule || null,
      promotion_id: data?.promotion_id || null,
      statut: data?.statut || null,
    },
  });

  return true;
}

export async function deleteLeaderCompletely(leaderId: string) {
  return permanentlyDeleteLeader(leaderId);
}