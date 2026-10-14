import React from "react";
import {
  BrainCircuit,
  Plus,
  Settings2,
  History,
  LayoutGrid,
  ArrowLeft,
} from "lucide-react";
import { Button } from "./Button.js";
import type { AppView } from '../types/app.js';
interface TopBarProps {
  activeView: AppView;
  pageTitle?: string;
  onBack?: () => void;
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
  pageTitle,
  onBack,
}) => activeView === 'preparation' ? (
  <header className="app-header preparation-header print:hidden">
    <div className="header-inner">
      <button type="button" className="preparation-back" aria-label="Kembali ke konfigurasi" disabled={isBusy} onClick={onBack}><ArrowLeft size={21} aria-hidden="true" /></button>
      <h1 id="preparation-title">{pageTitle || 'Persiapan Kuis'}</h1>
      <span className="preparation-header-spacer" aria-hidden="true" />
    </div>
  </header>
) : (
  <header className={`app-header print:hidden ${activeView === 'configuration' ? 'configuration-header' : ''}`}>
    <div className="header-inner">
      <button
        className="brand"
        onClick={() => onNavigate("creator")}
        disabled={isBusy}
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
        {activeView !== 'results' && <button
          aria-current={activeView === "creator" || activeView === "configuration" ? "page" : undefined}
          disabled={isBusy}
          onClick={() => onNavigate("creator")}
        >
          <LayoutGrid size={16} /> Beranda
        </button>}
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
              disabled={isBusy}
              onClick={onNewQuizClick}
            />
          )
        )}
      </div>
    </div>
  </header>
);
