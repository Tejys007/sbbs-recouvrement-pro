// src/components/Sidebar.tsx
import React from "react";

interface Props {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen: boolean;
  onClose: () => void;
  canManageAccess?: boolean;
}

type Item = {
  key: string;
  label: string;
};

export default function Sidebar({
  activeTab,
  setActiveTab,
  isOpen,
  onClose,
  canManageAccess = false,
}: Props) {
  const items: Item[] = [
    { key: "dashboard", label: "Dashboard" },
    { key: "promotions", label: "Promotions" },
    { key: "payments", label: "Paiements" },
    { key: "relances", label: "Relances" },
    { key: "pending", label: "En attente" },
    { key: "abandoned", label: "Abandons" },
    { key: "security", label: "Sécurité" },
  ];

  if (canManageAccess) {
    items.push({ key: "logs", label: "Journal" });
    items.push({ key: "access", label: "Accès" });
  }

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed md:sticky top-0 left-0 z-50 h-screen w-[280px] bg-sbbsNavy text-white p-6 transform transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="text-2xl font-black uppercase tracking-tight">
          SBBS
        </div>
        <div className="text-[10px] uppercase tracking-widest opacity-50 mt-1">
          Recouvrement Pro
        </div>

        <nav className="mt-10 space-y-3">
          {items.map((item) => {
            const isActive = activeTab === item.key;

            return (
              <button
                key={item.key}
                onClick={() => {
                  setActiveTab(item.key);
                  window.location.hash = item.key;
                  onClose();
                }}
                className={`w-full text-left px-4 py-4 rounded-2xl font-black uppercase text-[11px] tracking-wider transition-all ${
                  isActive
                    ? "bg-white text-sbbsNavy"
                    : "bg-white/10 hover:bg-white/20 text-white"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}