// src/services/activityLogs.ts
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";

export type ActivityAction =
  | "CREATE_PROMOTION"
  | "UPDATE_PROMOTION"
  | "DELETE_PROMOTION"
  | "CREATE_LEADER"
  | "IMPORT_LEADERS"
  | "UPDATE_LEADER_STATUS"
  | "DELETE_LEADER"
  | "CREATE_PAIEMENT"
  | "UPDATE_PAIEMENT"
  | "UPDATE_ECHEANCE"
  | "UPDATE_USER_ACCESS"
  | "CREATE_RELANCE_NOTE";

export async function logActivity(payload: {
  action: ActivityAction;
  entity: string;
  entity_id?: string | null;
  message: string;
  metadata?: Record<string, any>;
}) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Utilisateur non connecté pour le journal d'activité.");
  }

  await addDoc(collection(db, "activity_logs"), {
    actor_uid: user.uid,
    actor_email: user.email || null,
    action: payload.action,
    entity: payload.entity,
    entity_id: payload.entity_id || null,
    message: payload.message,
    metadata: payload.metadata || {},
    created_at: serverTimestamp(),
  });
}