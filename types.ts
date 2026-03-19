// src/types.ts

export type StatusLeader = "ACTIF" | "ATTENTE" | "ABANDON";

export interface Promotion {
  id: string;
  nom_promotion: string;
  ville?: string;

  date_debut?: any;
  date_fin?: any;

  // Champs réellement utilisés dans l'application
  date_fin_previsionnelle?: string | null;
  date_fin_reelle?: string | null;

  objectif_recouvrement?: number;

  // Compatibilité large avec les différents noms déjà utilisés
  montant_scolarite?: number;
  scolarite_montant?: number;
  scolarite_base?: number;

  statut?: string;

  created_at?: any;
  updated_at?: any;
}

export interface Leader {
  id: string;
  promotion_id?: string | null;
  promotion_origine_id?: string | null;

  matricule: string;
  nom_complet: string;
  telephone: string;

  scolarite_base: number;
  bourse_montant: number;

  statut: StatusLeader;

  created_at?: any;
  updated_at?: any;
  status_changed_at?: any;
}

export interface EcheancierPromotion {
  id: string;
  promotion_id: string;
  mois: string; // YYYY-MM
  date_limite?: string; // YYYY-MM-DD
  created_at?: any;
  updated_at?: any;
}

export interface EcheancierLeader {
  id: string;
  leader_id: string;
  promotion_id: string;
  mois: string; // YYYY-MM
  date_limite?: string;

  montant_attendu: number;

  montant_verse?: number;
  statut_paiement?: "PAYE" | "PARTIEL" | "NON_PAYE";

  created_at?: any;
  updated_at?: any;
}

export interface Paiement {
  id: string;
  promotion_id: string | null;
  leader_id: string;

  date_paiement: string;
  date_valeur?: string;

  montant: number;

  mode: "WAVE" | "ORANGE_MONEY" | "MOOV_MONEY" | "MTN_MONEY" | "ESPECES" | "CHEQUE";
  moyen_paiement?: string;

  reference?: string;
  reference_paiement?: string;

  status?: string;
  montant_impute?: number;

  created_at?: any;
  updated_at?: any;
}

export interface PaiementImputation {
  id: string;
  paiement_id: string;

  leader_id: string;
  promotion_id: string | null;

  // Champ réellement utilisé dans le reste du projet
  echeance_leader_id: string;

  // Compatibilité éventuelle avec d'anciens enregistrements
  echeance_id?: string;

  mois?: string;
  montant_impute: number;

  status?: string;

  created_at?: any;
  updated_at?: any;
}