import React from "react";
import {
  BrainCircuit,
  Plus,
  ShieldCheck,
  History,
  LayoutGrid,
  KeyRound,
} from "lucide-react";
import { Button } from "./Button.js";
interface TopBarProps {
  activeView: "creator" | "runner" | "results" | "history";
  isBusy?: boolean;
  onNavigate: (view: "creator" | "history") => void;
  onOpenSecurityModal: () => void;
  onOpenConnections: () => void;
  isKeyConfigured: boolean;
  onNewQuizClick: () => void;
}
export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  isBusy,
  onNavigate,
  onOpenSecurityModal,
  onOpenConnections,
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
        <button type="button" className="connection-trigger" onClick={onOpenConnections} disabled={isBusy}><KeyRound size={16}/><span>Koneksi AI</span><span className={'status-dot ' + (isKeyConfigured ? '' : 'inactive')}/></button>
        <button
          onClick={onOpenSecurityModal}
          className="icon-button"
          aria-label="Privasi API key"
          title="Privasi API key"
        >
          <ShieldCheck size={19} />
        </button>
        {activeView === "creator" ? (
          <span className="key-status hidden lg:flex" role="status">
            <span
              className={`status-dot ${isKeyConfigured ? "" : "inactive"}`}
            />
            {isKeyConfigured ? "API key tersedia" : "API key belum tersedia"}
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
