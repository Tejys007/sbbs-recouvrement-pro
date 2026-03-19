// src/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import Sidebar from "./components/Sidebar";
import PromotionsView from "./components/PromotionsView";
import DashboardView from "./components/DashboardView";
import PaymentEntryView from "./components/PaymentEntryView";
import RelancesView from "./components/RelancesView";
import StatusListView from "./components/StatusListView";
import LeaderDossierModal from "./components/LeaderDossierModal";
import AccessManagementView from "./components/AccessManagementView";
import LoginView from "./components/LoginView";
import ActivityLogsView from "./components/ActivityLogsView";
import AccountSecurityView from "./components/AccountSecurityView";

import type {
  EcheancierLeader,
  EcheancierPromotion,
  Leader,
  Paiement,
  PaiementImputation,
  Promotion,
} from "./types";

import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { getUserProfile, logout } from "./services/auth";
import { canManageAccess, canReadBusiness } from "./services/accessControl";
import { logActivity } from "./services/activityLogs";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import {
  createLeaderWithMatricule,
  deleteLeaderCompletely,
} from "./services/leaders";
import { createEcheancierPromotion } from "./services/echeancierPromotions";
import { importLeadersFromExcel } from "./services/importLeadersFromExcel";
import { updateLeaderEcheance } from "./services/echeancierLeaders";
import {
  createPaiementWithAutoImputation,
  updatePaiementWithAutoImputation,
} from "./services/paiements";

function getInitialTab(): string {
  const h = (window.location.hash || "").replace("#", "").trim();
  return h || "dashboard";
}

function currentAuditFields() {
  const u = auth.currentUser;
  return {
    created_by_uid: u?.uid || null,
    created_by_email: u?.email || null,
    updated_by_uid: u?.uid || null,
    updated_by_email: u?.email || null,
  };
}

function updateAuditFields() {
  const u = auth.currentUser;
  return {
    updated_by_uid: u?.uid || null,
    updated_by_email: u?.email || null,
  };
}

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [authUser, setAuthUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<string>(getInitialTab());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [schedules, setSchedules] = useState<EcheancierLeader[]>([]);
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [imputations, setImputations] = useState<PaiementImputation[]>([]);
  const [echeancierTemplates, setEcheancierTemplates] = useState<EcheancierPromotion[]>([]);
  const [appUsers, setAppUsers] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dossierLeaderId, setDossierLeaderId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setProfileError(null);
      setProfile(null);

      if (!u) {
        setAuthUser(null);
        setAuthLoading(false);
        return;
      }

      setAuthUser(u);

      try {
        const p = await getUserProfile(u.uid);
        setProfile(p);
      } catch (e: any) {
        setProfileError(e?.message || "Erreur lecture profil");
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    const onHashChange = () => setActiveTab(getInitialTab());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const allowBusiness = canReadBusiness(profile);
  const allowManageUsers = canManageAccess(authUser);
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    if (!allowBusiness) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const unsubPromos = onSnapshot(
      query(collection(db, "promotions"), orderBy("date_debut", "desc")),
      (snap) => {
        setPromotions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      },
      (err) => setErrorMsg(err.message)
    );

    const unsubLeaders = onSnapshot(
      query(collection(db, "leaders"), orderBy("created_at", "desc")),
      (snap) => {
        setLeaders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      },
      (err) => setErrorMsg(err.message)
    );

    const unsubSchedules = onSnapshot(
      query(collection(db, "echeancier_leaders"), orderBy("mois", "asc")),
      (snap) => {
        setSchedules(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      },
      (err) => setErrorMsg(err.message)
    );

    const unsubPaiements = onSnapshot(
      query(collection(db, "paiements"), orderBy("created_at", "desc")),
      (snap) => {
        setPaiements(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      },
      (err) => setErrorMsg(err.message)
    );

    const unsubImputations = onSnapshot(
      query(collection(db, "paiement_imputations"), orderBy("created_at", "desc")),
      (snap) => {
        setImputations(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setLoading(false);
      },
      (err) => {
        setErrorMsg(err.message);
        setLoading(false);
      }
    );

    const unsubTemplates = onSnapshot(
      query(collection(db, "echeancier_promotions"), orderBy("mois", "asc")),
      (snap) => {
        setEcheancierTemplates(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      },
      (err) => setErrorMsg(err.message)
    );

    let unsubUsers = () => {};
    if (allowManageUsers) {
      unsubUsers = onSnapshot(
        collection(db, "users"),
        (snap) => {
          const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
          data.sort((a: any, b: any) =>
            String(a.email || "").localeCompare(String(b.email || ""))
          );
          setAppUsers(data);
        },
        (err) => setErrorMsg(err.message)
      );
    }

    return () => {
      unsubPromos();
      unsubLeaders();
      unsubSchedules();
      unsubPaiements();
      unsubImputations();
      unsubTemplates();
      unsubUsers();
    };
  }, [allowBusiness, allowManageUsers]);

  const currentTitle = useMemo(() => {
    switch (activeTab) {
      case "dashboard":
        return "Tableau de bord";
      case "promotions":
        return "Promotions & Scolarités";
      case "payments":
        return "Saisie des paiements";
      case "relances":
        return "Relances (impayés)";
      case "pending":
        return "Leaders en attente";
      case "abandoned":
        return "Leaders en abandon";
      case "access":
        return "Gestion des comptes";
      case "journal":
      case "logs":
        return "Journal d’activité";
      case "security":
      case "securite":
      case "account-security":
        return "Sécurité";
      default:
        return "SBBS Recouvrement";
    }
  }, [activeTab]);

  const handleCreatePromotion = async (
    payload: {
      nom_promotion: string;
      date_debut: string;
      date_fin_previsionnelle?: string;
      objectif_recouvrement: number;
      montant_scolarite?: number;
      scolarite_promotion?: number;
    },
    filledMonths: Array<{ mois: string; date_limite: string }>
  ) => {
    const montantScolarite = Number(
      payload.montant_scolarite ?? payload.scolarite_promotion ?? 370000
    );

    const promoRef = await addDoc(collection(db, "promotions"), {
      nom_promotion: payload.nom_promotion,
      date_debut: payload.date_debut,
      date_fin_previsionnelle: payload.date_fin_previsionnelle || null,
      objectif_recouvrement: Number(payload.objectif_recouvrement || 0),
      montant_scolarite: montantScolarite,
      scolarite_promotion: montantScolarite,
      statut: "EN_COURS",
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      ...currentAuditFields(),
    });

    for (const m of filledMonths) {
      await createEcheancierPromotion({
        promotion_id: promoRef.id,
        mois: m.mois,
        date_limite: m.date_limite,
      });
    }

    await logActivity({
      action: "CREATE_PROMOTION",
      entity: "promotions",
      entity_id: promoRef.id,
      message: `Création de la promotion ${payload.nom_promotion}`,
      metadata: {
        nom_promotion: payload.nom_promotion,
        date_debut: payload.date_debut,
        montant_scolarite: montantScolarite,
      },
    });
  };

  const handleUpdatePromotion = async (
    promotionId: string,
    patch: Partial<Promotion> & { scolarite_promotion?: number },
    _filledMonths?: Array<{ mois: string; date_limite: string }>
  ) => {
    const montantScolarite = Number(
      (patch as any).montant_scolarite ??
        (patch as any).scolarite_promotion ??
        370000
    );

    await updateDoc(doc(db, "promotions", promotionId), {
      ...patch,
      montant_scolarite: montantScolarite,
      scolarite_promotion: montantScolarite,
      updated_at: serverTimestamp(),
      ...updateAuditFields(),
    } as any);

    await logActivity({
      action: "UPDATE_PROMOTION",
      entity: "promotions",
      entity_id: promotionId,
      message: `Mise à jour de la promotion ${promotionId}`,
      metadata: { patch },
    });
  };

  const handleDeletePromotion = async (promotionId: string) => {
    await deleteDoc(doc(db, "promotions", promotionId));

    await logActivity({
      action: "DELETE_PROMOTION",
      entity: "promotions",
      entity_id: promotionId,
      message: `Suppression de la promotion ${promotionId}`,
    });
  };

  const handleManualAddLeader = async (
    promotionId: string,
    payload: { nom_complet: string; telephone: string }
  ) => {
    const promo: any = promotions.find((p: any) => p.id === promotionId);

    const promoScolarite = Number(
      promo?.montant_scolarite ??
        promo?.scolarite_promotion ??
        promo?.scolarite_montant ??
        promo?.scolarite_base ??
        370000
    );

    const result = await createLeaderWithMatricule({
      promotion_id: promotionId,
      nom_complet: payload.nom_complet,
      telephone: payload.telephone,
      scolarite_base: promoScolarite,
      bourse_montant: 0,
    } as any);

    await logActivity({
      action: "CREATE_LEADER",
      entity: "leaders",
      entity_id: result.id,
      message: `Création du leader ${payload.nom_complet}`,
      metadata: {
        promotion_id: promotionId,
        telephone: payload.telephone,
      },
    });
  };

  const handleImportLeaders = async (file: File, promoId: string) => {
    await importLeadersFromExcel(file, promoId);

    await logActivity({
      action: "IMPORT_LEADERS",
      entity: "leaders",
      entity_id: null,
      message: `Import de leaders dans la promotion ${promoId}`,
      metadata: {
        file_name: file.name,
        promotion_id: promoId,
      },
    });
  };

  const handleSetLeaderStatus = async (
    leaderId: string,
    statut: "ACTIF" | "ATTENTE" | "ABANDON"
  ) => {
    await updateDoc(doc(db, "leaders", leaderId), {
      statut,
      updated_at: serverTimestamp(),
      status_changed_at: serverTimestamp(),
      ...updateAuditFields(),
    } as any);

    await logActivity({
      action: "UPDATE_LEADER_STATUS",
      entity: "leaders",
      entity_id: leaderId,
      message: `Changement de statut leader ${leaderId} -> ${statut}`,
      metadata: { statut },
    });
  };

  const handleSaveLeaderEcheance = async (
    echeanceId: string,
    patch: { montant_attendu?: number; date_limite?: string }
  ) => {
    await updateLeaderEcheance({ echeanceId, patch });

    await logActivity({
      action: "UPDATE_ECHEANCE",
      entity: "echeancier_leaders",
      entity_id: echeanceId,
      message: `Mise à jour de l'échéance ${echeanceId}`,
      metadata: patch,
    });
  };

  const handleCreatePaiement = async (payload: any) => {
    const result = await createPaiementWithAutoImputation(payload);

    await logActivity({
      action: "CREATE_PAIEMENT",
      entity: "paiements",
      entity_id: result.paiementId,
      message: `Création d'un paiement pour le leader ${payload.leader_id}`,
      metadata: payload,
    });
  };

  const handleUpdatePaiement = async (
    paiementId: string,
    patch: Partial<Paiement>
  ) => {
    await updatePaiementWithAutoImputation(paiementId, patch as any);

    await logActivity({
      action: "UPDATE_PAIEMENT",
      entity: "paiements",
      entity_id: paiementId,
      message: `Mise à jour du paiement ${paiementId}`,
      metadata: patch as any,
    });
  };

  const handleDeleteLeader = async (leaderId: string) => {
    await deleteLeaderCompletely(leaderId);

    await logActivity({
      action: "DELETE_LEADER",
      entity: "leaders",
      entity_id: leaderId,
      message: `Suppression définitive du leader ${leaderId}`,
    });

    if (dossierLeaderId === leaderId) {
      setDossierLeaderId(null);
    }
  };

  const handleSaveUserAccess = async (
    userId: string,
    patch: { isActive: boolean }
  ) => {
    await updateDoc(doc(db, "users", userId), {
      isActive: patch.isActive,
      updatedAt: serverTimestamp(),
    } as any);

    await logActivity({
      action: "UPDATE_USER_ACCESS",
      entity: "users",
      entity_id: userId,
      message: `Mise à jour du compte utilisateur ${userId}`,
      metadata: patch,
    });
  };

  if (authLoading) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        Chargement authentification...
      </div>
    );
  }

  if (!authUser) {
    return <LoginView />;
  }

  if (profileError) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui", color: "#b00020" }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Erreur profil</div>
        <div>{profileError}</div>
      </div>
    );
  }

  if (!allowBusiness) {
    return (
      <div className="min-h-screen bg-sbbsGray flex items-center justify-center p-6">
        <div className="w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl border-2 border-sbbsBorder p-8">
          <div className="text-2xl font-black text-sbbsNavy uppercase">
            Accès refusé
          </div>
          <div className="mt-4 text-sbbsText font-bold">
            Ton compte existe, mais il n’est pas encore activé.
          </div>
          <div className="mt-2 text-sbbsText font-bold">
            Demande à tejysjean@gmail.com d’activer ton compte.
          </div>

          <button
            onClick={() => logout()}
            className="mt-6 px-5 py-3 rounded-2xl bg-sbbsNavy text-white font-black uppercase text-xs"
          >
            Retour à la connexion
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sbbsGray">
      <div className="flex">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          canManageAccess={allowManageUsers}
        />

        <div className="flex-1 min-w-0">
          <div className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-black/5">
            <div className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  className="md:hidden p-2 rounded-xl bg-sbbsGray"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Ouvrir le menu"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                </button>

                <div>
                  <div className="text-xl font-black text-sbbsNavy">
                    SBBS Recouvrement
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-sbbsText opacity-50">
                    {currentTitle}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-[11px] font-black text-sbbsNavy">
                    {authUser.email || "Utilisateur"}
                  </div>
                  <div className="text-[10px] text-sbbsText opacity-50">
                    {allowManageUsers ? "Administrateur principal" : "Utilisateur actif"}
                  </div>
                </div>

                <button
                  onClick={() => logout()}
                  className="px-3 py-2 rounded-xl bg-sbbsGray text-sbbsNavy font-black text-xs"
                  title="Déconnexion"
                >
                  Déconnexion
                </button>
              </div>
            </div>
          </div>

          <main className="p-6 md:p-10">
            {errorMsg && (
              <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm">
                <div className="font-black mb-1">Erreur Firebase</div>
                <div className="opacity-80">{errorMsg}</div>
              </div>
            )}

            {loading ? (
              <div className="p-10 bg-white rounded-3xl shadow">Chargement...</div>
            ) : (
              <>
                {activeTab === "dashboard" && (
                  <DashboardView
                    promotions={promotions}
                    leaders={leaders}
                    paiements={paiements}
                    imputations={imputations}
                    schedules={schedules}
                  />
                )}

                {activeTab === "promotions" && (
                  <PromotionsView
                    promotions={promotions}
                    leaders={leaders}
                    echeancierTemplates={echeancierTemplates}
                    onCreatePromotion={handleCreatePromotion}
                    onUpdatePromotion={handleUpdatePromotion as any}
                    onDeletePromotion={handleDeletePromotion}
                    onManualAddLeader={handleManualAddLeader}
                    onLeaderClick={(leaderId: string) => setDossierLeaderId(leaderId)}
                    onImportLeaders={handleImportLeaders}
                    canPermanentDelete={isAdmin}
                  />
                )}

                {activeTab === "payments" && (
                  <PaymentEntryView
                    promotions={promotions}
                    leaders={leaders}
                    paiements={paiements}
                    imputations={imputations}
                    onCreatePaiement={handleCreatePaiement}
                    onUpdatePaiement={handleUpdatePaiement}
                  />
                )}

                {activeTab === "relances" && (
                  <RelancesView
                    promotions={promotions}
                    leaders={leaders}
                    schedules={schedules}
                    paiements={paiements}
                    imputations={imputations}
                  />
                )}

                {activeTab === "pending" && (
                  <StatusListView
                    title="Leaders en attente"
                    status="ATTENTE"
                    promotions={promotions}
                    leaders={leaders}
                    schedules={schedules}
                    paiements={paiements}
                    imputations={imputations}
                    onChangeStatus={handleSetLeaderStatus}
                    onDeleteLeader={handleDeleteLeader}
                    canPermanentDelete={isAdmin}
                  />
                )}

                {activeTab === "abandoned" && (
                  <StatusListView
                    title="Leaders en abandon"
                    status="ABANDON"
                    promotions={promotions}
                    leaders={leaders}
                    schedules={schedules}
                    paiements={paiements}
                    imputations={imputations}
                    onChangeStatus={handleSetLeaderStatus}
                    onDeleteLeader={handleDeleteLeader}
                    canPermanentDelete={isAdmin}
                  />
                )}

                {activeTab === "access" && allowManageUsers && (
                  <AccessManagementView
                    users={appUsers}
                    currentUserUid={authUser.uid}
                    onSaveAccess={handleSaveUserAccess}
                  />
                )}

                {(activeTab === "journal" || activeTab === "logs") && isAdmin && (
                  <ActivityLogsView />
                )}

                {(activeTab === "security" ||
                  activeTab === "securite" ||
                  activeTab === "account-security") && <AccountSecurityView />}
              </>
            )}
          </main>
        </div>
      </div>

      {dossierLeaderId && (
        <LeaderDossierModal
          leaderId={dossierLeaderId}
          leaders={leaders}
          promotions={promotions}
          schedules={schedules}
          paiements={paiements}
          imputations={imputations}
          onClose={() => setDossierLeaderId(null)}
          onSaveEcheance={handleSaveLeaderEcheance}
          onChangeStatus={handleSetLeaderStatus}
          onDeleteLeader={handleDeleteLeader}
          canPermanentDelete={isAdmin}
        />
      )}
    </div>
  );
}