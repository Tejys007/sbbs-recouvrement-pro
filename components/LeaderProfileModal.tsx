
import React, { useState, useMemo, useEffect } from 'react';
import { Leader, Promotion, EcheancierLeader, Paiement, PaiementImputation, StatusLeader } from '../types';
import { DataService } from '../services/dataService';
import { Icons } from '../constants';

interface Props {
  leader: Leader;
  promotion: Promotion;
  promotions: Promotion[];
  schedules: EcheancierLeader[];
  paiements: Paiement[];
  imputations: PaiementImputation[];
  onClose: () => void;
  onChangeStatus: (id: string, status: StatusLeader, targetPromoId?: string) => void;
  onUpdateSchedule: (leaderId: string, bourse: number, scheduleData: any[], profileInfo?: { nom_complet: string, telephone: string }) => void;
}

const LeaderProfileModal: React.FC<Props> = ({ 
  leader, promotion, promotions, schedules, paiements, imputations, onClose, onChangeStatus, onUpdateSchedule 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [bourse, setBourse] = useState(leader.bourse_montant);
  const [tempSchedule, setTempSchedule] = useState(schedules.map(s => ({ id: s.id, montant: s.montant_attendu })));
  
  // Nouveaux états pour l'identité
  const [tempName, setTempName] = useState(leader.nom_complet);
  const [tempPhone, setTempPhone] = useState(leader.telephone);

  const [isPendingSelectorOpen, setIsPendingSelectorOpen] = useState(false);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [targetPromoId, setTargetPromoId] = useState('');

  // Synchronisation des données locales
  useEffect(() => {
    setBourse(leader.bourse_montant);
    setTempName(leader.nom_complet);
    setTempPhone(leader.telephone);
    setTempSchedule(schedules.map(s => ({ id: s.id, montant: s.montant_attendu })));
  }, [leader, schedules]);

  const handleAutoRedistribute = () => {
    const net = Math.max(leader.scolarite_base - bourse, 0);
    const months = schedules.map(s => s.mois).sort((a,b) => a.localeCompare(b));
    const newAmounts = DataService.distributeNet(net, months);
    
    setTempSchedule(schedules.map((s) => {
      const monthIdx = months.indexOf(s.mois);
      return {
        id: s.id,
        montant: newAmounts[monthIdx]
      };
    }));
  };

  const financials = useMemo(() => 
    DataService.computeLeaderFinancials(leader, schedules, imputations, paiements),
    [leader, schedules, imputations, paiements]
  );

  const liveResteAPayer = useMemo(() => {
    const net = Math.max(leader.scolarite_base - bourse, 0);
    const totalImpute = imputations.reduce((sum, imp) => sum + imp.montant_impute, 0);
    return Math.max(net - totalImpute, 0);
  }, [leader.scolarite_base, bourse, imputations]);

  const calculatedSchedules = useMemo(() => {
    return schedules.map(s => {
      const paid = imputations.filter(i => i.echeance_leader_id === s.id).reduce((sum, i) => sum + i.montant_impute, 0);
      const tempItem = tempSchedule.find(t => t.id === s.id);
      const currentAmount = tempItem ? tempItem.montant : s.montant_attendu;
      
      return {
        ...s,
        montant_attendu_display: currentAmount,
        montant_paye: paid,
        statut: paid >= currentAmount && currentAmount > 0 ? 'PAYE' : paid > 0 ? 'PARTIEL' : 'NON_PAYE'
      };
    }).sort((a, b) => a.mois.localeCompare(b.mois));
  }, [schedules, imputations, tempSchedule]);

  const handleConfirmPending = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (targetPromoId) {
      onChangeStatus(leader.id, 'ATTENTE', targetPromoId);
      setIsPendingSelectorOpen(false);
    }
  };

  const handleConfirmAbandon = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChangeStatus(leader.id, 'ABANDON');
    setShowAbandonConfirm(false);
  };

  const handleUpdateMonthAmount = (id: string, val: string) => {
    const amount = parseFloat(val) || 0;
    setTempSchedule(prev => prev.map(item => item.id === id ? { ...item, montant: amount } : item));
  };

  const handleFinalSave = () => {
    onUpdateSchedule(leader.id, bourse, tempSchedule, { nom_complet: tempName, telephone: tempPhone });
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 bg-sbbsNavy/80 flex items-end sm:items-center justify-center z-[60] md:p-4 backdrop-blur-sm animate-fade-in">
      
      {/* Overlays de Confirmation */}
      {showAbandonConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl text-center border-4 border-sbbsRed/20">
            <div className="w-16 h-16 bg-sbbsRed/10 text-sbbsRed rounded-full flex items-center justify-center mx-auto mb-6">
              <Icons.Abandon />
            </div>
            <h3 className="text-xl font-black text-sbbsNavy uppercase mb-2">Abandon Définitif ?</h3>
            <p className="text-sbbsText text-xs font-medium mb-8 leading-relaxed italic">
              Cette action retirera le leader du flux de recouvrement actif.
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={handleConfirmAbandon} className="w-full bg-sbbsRed text-white py-4 rounded-xl font-black uppercase text-xs shadow-lg hover:bg-red-700 transition-colors">Confirmer l'Abandon</button>
              <button onClick={() => setShowAbandonConfirm(false)} className="w-full py-2 text-sbbsText font-bold text-xs uppercase hover:underline">Retour</button>
            </div>
          </div>
        </div>
      )}

      {isPendingSelectorOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl border-4 border-sbbsNavy/20">
            <h3 className="text-xl font-black text-sbbsNavy uppercase mb-4 text-center tracking-tighter">Mise en Attente</h3>
            <p className="text-[10px] text-sbbsText font-medium mb-6 text-center italic">Sélectionnez la promotion de reprise pour ce leader.</p>
            
            <select 
              value={targetPromoId} 
              onChange={e => setTargetPromoId(e.target.value)}
              className="w-full bg-sbbsGray border-2 border-sbbsGray rounded-xl px-4 py-4 font-black text-sbbsNavy outline-none focus:border-sbbsNavy mb-6"
            >
              <option value="">Choisir la promotion...</option>
              {promotions.map(p => <option key={p.id} value={p.id}>{p.nom_promotion}</option>)}
            </select>

            <div className="flex flex-col gap-2">
              <button disabled={!targetPromoId} onClick={handleConfirmPending} className="w-full bg-sbbsNavy text-white py-4 rounded-xl font-black uppercase text-xs shadow-lg disabled:opacity-30">Confirmer la mise en attente</button>
              <button onClick={() => setIsPendingSelectorOpen(false)} className="w-full py-2 text-sbbsText font-bold text-xs uppercase hover:underline">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Modal Container */}
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-5xl h-[95vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up relative border-4 border-white">
        
        {/* Header Section */}
        <div className="bg-sbbsNavy text-white p-6 md:p-8 shrink-0 relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
          <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-white/10 flex items-center justify-center text-3xl md:text-4xl font-black text-white border-2 border-white/20 shrink-0 uppercase">
              {tempName.charAt(0) || "L"}
            </div>
            <div className="overflow-hidden w-full text-center sm:text-left space-y-2">
              {isEditing ? (
                <div className="space-y-2 max-w-xl">
                  <input 
                    type="text" 
                    value={tempName} 
                    onChange={e => setTempName(e.target.value.toUpperCase())}
                    className="w-full bg-white/10 border-2 border-white/30 rounded-xl px-4 py-2 text-xl font-black text-white outline-none focus:border-white uppercase"
                    placeholder="NOM COMPLET"
                  />
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <span className="bg-sbbsRed px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest">{leader.matricule}</span>
                    <input 
                      type="text" 
                      value={tempPhone} 
                      onChange={e => setTempPhone(e.target.value)}
                      className="bg-white/10 border-2 border-white/30 rounded px-3 py-1 text-[10px] font-black text-white outline-none focus:border-white"
                      placeholder="TÉLÉPHONE"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-xl md:text-3xl font-black truncate leading-tight uppercase tracking-tighter">{leader.nom_complet}</h2>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <span className="bg-sbbsRed px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest">{leader.matricule}</span>
                    <span className="opacity-70 text-xs font-bold">{leader.telephone}</span>
                    <span className={`px-3 py-1 rounded text-[10px] font-black uppercase ${leader.statut === 'ACTIF' ? 'bg-sbbsGreen' : leader.statut === 'ATTENTE' ? 'bg-sbbsNavy border border-white/30' : 'bg-sbbsRed'}`}>{leader.statut}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-sbbsGray/40">
          <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6 md:gap-8">
            
            {/* Sidebar Details */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white p-6 rounded-[2rem] border border-sbbsBorder shadow-xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                   <Icons.Payment />
                </div>
                <h4 className="text-[10px] font-black text-sbbsNavy uppercase mb-6 tracking-widest border-b-2 border-sbbsGray pb-2 flex items-center gap-2">
                   <span className="w-2 h-2 bg-sbbsNavy rounded-full"></span>
                   Scolarité & Bourse
                </h4>
                <div className="space-y-4">
                  <div>
                    <span className="block text-[8px] font-black text-sbbsText uppercase opacity-40 mb-1">Base Scolarité</span>
                    <span className="text-sm font-black text-sbbsNavy">{leader.scolarite_base.toLocaleString()} F</span>
                  </div>

                  <div className="p-4 bg-sbbsGray rounded-2xl border-2 border-white shadow-inner">
                    <label className="block text-[8px] font-black text-sbbsNavy uppercase mb-2">Bourse / Remise (F)</label>
                    {isEditing ? (
                      <div className="space-y-2">
                        <input 
                          type="number" 
                          value={bourse} 
                          onChange={e => setBourse(parseFloat(e.target.value) || 0)} 
                          className="w-full bg-white border-2 border-sbbsNavy rounded-xl px-4 py-3 font-black text-sbbsNavy outline-none shadow-sm"
                        />
                        <button onClick={handleAutoRedistribute} className="w-full bg-sbbsNavy text-white py-2 rounded-lg text-[8px] font-black uppercase hover:bg-sbbsRed transition-colors">Appliquer Grille SBBS</button>
                      </div>
                    ) : (
                      <span className="text-lg font-black text-sbbsRed">-{leader.bourse_montant.toLocaleString()} F</span>
                    )}
                  </div>

                  <div className="flex justify-between items-center p-4 bg-sbbsNavy text-white rounded-2xl shadow-xl">
                    <span className="text-[9px] font-black uppercase opacity-60">Reste Net</span>
                    <span className="font-black text-lg">
                      {isEditing ? liveResteAPayer.toLocaleString() : financials.reste_a_payer.toLocaleString()} F
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                {isEditing ? (
                   <button onClick={handleFinalSave} className="w-full bg-sbbsGreen text-white font-black py-5 rounded-2xl text-xs uppercase shadow-xl hover:scale-105 transition-all flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"/></svg>
                      Enregistrer le Profil
                   </button>
                ) : (
                  <button onClick={() => setIsEditing(true)} className="w-full bg-sbbsNavy text-white font-black py-5 rounded-2xl text-xs uppercase shadow-xl hover:bg-sbbsRed transition-all">
                    Ajuster Profil & Échéancier
                  </button>
                )}

                {!isEditing && (
                  <div className="flex gap-2">
                    <button onClick={() => setShowAbandonConfirm(true)} className="flex-1 bg-white border-2 border-sbbsRed text-sbbsRed font-black py-4 rounded-2xl text-[10px] uppercase hover:bg-sbbsRed hover:text-white transition-all">Abandon</button>
                    {leader.statut === 'ACTIF' && (
                      <button onClick={() => setIsPendingSelectorOpen(true)} className="flex-1 bg-white border-2 border-sbbsNavy text-sbbsNavy font-black py-4 rounded-2xl text-[10px] uppercase hover:bg-sbbsNavy hover:text-white transition-all">Mettre en Attente</button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Main Schedule Table */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-[2.5rem] border border-sbbsBorder overflow-hidden shadow-2xl">
                <div className="p-6 border-b-2 border-sbbsGray bg-sbbsGray/30 flex justify-between items-center">
                  <h4 className="text-xs font-black text-sbbsNavy uppercase tracking-widest italic">Calendrier de Règlement</h4>
                  {isEditing && <span className="text-[9px] font-black text-sbbsRed uppercase animate-pulse">Mode Édition Activé</span>}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[500px]">
                    <thead className="bg-sbbsGray text-[9px] font-black uppercase text-sbbsText border-b">
                      <tr>
                        <th className="px-6 py-4">Mois / Période</th>
                        <th className="px-6 py-4">Montant Attendu</th>
                        <th className="px-6 py-4 text-right">Déjà Versé</th>
                        <th className="px-6 py-4 text-center">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sbbsGray">
                      {calculatedSchedules.map(sch => (
                        <tr key={sch.id} className="hover:bg-sbbsGray/10 transition-colors">
                          <td className="px-6 py-5 font-black text-sbbsNavy uppercase">{sch.mois}</td>
                          <td className="px-6 py-5 font-bold">
                            {isEditing ? (
                              <input 
                                type="number" 
                                value={tempSchedule.find(t => t.id === sch.id)?.montant || 0}
                                onChange={(e) => handleUpdateMonthAmount(sch.id, e.target.value)}
                                className="w-32 bg-sbbsGray border-2 border-sbbsNavy/20 rounded-lg px-2 py-1 font-black text-sbbsNavy focus:border-sbbsNavy outline-none"
                              />
                            ) : (
                              <span className="text-sbbsNavy font-black">{(sch.montant_attendu_display || 0).toLocaleString()} F</span>
                            )}
                          </td>
                          <td className="px-6 py-5 text-sbbsGreen font-black text-right">{sch.montant_paye.toLocaleString()} F</td>
                          <td className="px-6 py-5 text-center">
                            <span className={`text-[8px] font-black px-3 py-1 rounded-full uppercase ${sch.statut === 'PAYE' ? 'bg-sbbsGreen text-white' : sch.statut === 'PARTIEL' ? 'bg-sbbsNavy text-white' : 'bg-sbbsGray text-sbbsText'}`}>
                               {sch.statut.replace('_', ' ')}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {calculatedSchedules.length === 0 && (
                        <tr><td colSpan={4} className="px-6 py-12 text-center text-[10px] font-black text-sbbsNavy uppercase opacity-20 italic">Aucune échéance générée</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeaderProfileModal;
