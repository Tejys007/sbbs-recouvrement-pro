// src/services/importLeadersFromExcel.ts

import * as XLSX from "xlsx";
import { createLeaderWithMatricule } from "./leaders";
import { db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

function normalizePhone(phone: string): string {
  return String(phone || "").replace(/\s+/g, "").trim();
}

function normalizeName(name: string): string {
  return String(name || "").trim().toUpperCase();
}

export async function importLeadersFromExcel(file: File, promotionId: string) {
  if (!file) throw new Error("Fichier Excel manquant.");
  if (!promotionId) throw new Error("Promotion manquante.");

  // Lire scolarité par défaut depuis promotion si existe
  const promoSnap = await getDoc(doc(db, "promotions", promotionId));
  const promoData: any = promoSnap.exists() ? promoSnap.data() : {};
  const scolariteBase = Number(promoData?.scolarite_montant ?? 370000) || 370000;

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  // Ta feuille est "Feuil2" dans l’exemple, mais on prend la 1ère feuille disponible.
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });

  // Attend colonnes : "Nom et prénoms" + "Téléphone"
  // On accepte aussi variantes (robustesse)
  const getName = (r: any) =>
    r["Nom et prénoms"] || r["Nom et prenoms"] || r["Nom"] || r["Nom complet"] || r["NOM"] || "";
  const getPhone = (r: any) =>
    r["Téléphone"] || r["Telephone"] || r["Tel"] || r["TEL"] || r["Numéro"] || r["Numero"] || "";

  let count = 0;

  for (const r of rows) {
    const nom = normalizeName(getName(r));
    const tel = normalizePhone(getPhone(r));

    if (!nom || !tel) continue;

    await createLeaderWithMatricule({
      promotion_id: promotionId,
      nom_complet: nom,
      telephone: tel,
      scolarite_base: scolariteBase,
      bourse_montant: 0,
      statut: "ACTIF",
    } as any);

    count += 1;
  }

  return { imported: count };
}
