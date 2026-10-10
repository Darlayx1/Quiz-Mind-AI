import React from "react";
import {
  BrainCircuit,
  Plus,
  Settings2,
  History,
  LayoutGrid,
} from "lucide-react";
import { Button } from "./Button.js";
interface TopBarProps {
  activeView: "creator" | "runner" | "results" | "history";
  isBusy?: boolean;
  onNavigate: (view: "creator" | "history") => void;
  onOpenSettings: () => void;
  storageLabel: string;
  isKeyConfigured: boolean;
  onNewQuizClick: () => void;
}
export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  isBusy,
  onNavigate,
  onOpenSettings,
  storageLabel,
  isKeyConfigured,
  onNewQuizClick,
}) => (
  <header className="app-header print:hidden">
    <div className="header-inner">
      <button
        className="brand"
        onClick={onNewQuizClick}
        disabled={isBusy || activeView === "runner"}
        aria-label="QuizMind AI · Menu utama"
      >
        <span className="brand-mark">
          <BrainCircuit size={23} />
        </span>
        <span>
          QuizMind<span className="brand-ai">AI</span>
        </span>
      </button>
      <nav aria-label="Navigasi utama" className="header-nav">
        <button
          aria-current={activeView === "creator" ? "page" : undefined}
          disabled={isBusy || activeView === "runner"}
          onClick={() => onNavigate("creator")}
        >
          <LayoutGrid size={16} /> Buat kuis
        </button>
        <button
          aria-current={activeView === "history" ? "page" : undefined}
          disabled={isBusy || activeView === "runner"}
          onClick={() => onNavigate("history")}
        >
          <History size={16} /> Riwayat
        </button>
      </nav>
      <div className="header-actions">
        <button
          onClick={onOpenSettings}
          className="header-settings-button"
          aria-label="Buka Pengaturan AI"
          title="Pengaturan AI"
        >
          <Settings2 size={18} /><span>Pengaturan AI</span>
        </button>
        {activeView === "creator" ? (
          <span className="key-status hidden lg:flex" role="status">
            <span
              className={`status-dot ${isKeyConfigured ? "" : "inactive"}`}
            />
            {storageLabel}
          </span>
        ) : (
          activeView !== "runner" && (
            <Button
              label="Kuis baru"
              icon={<Plus size={16} />}
              iconPosition="leading"
              size="sm"
              collapseOnMobile
              onClick={onNewQuizClick}
            />
          )
        )}
      </div>
    </div>
  </header>
);
