import React from 'react';
import { Button } from './Button.js';
import { ShieldCheck, Plus, Sparkles } from 'lucide-react';

interface TopBarProps {
  activeView: 'creator' | 'runner' | 'results' | 'history';
  onNavigate: (view: 'creator' | 'history') => void;
  onOpenSecurityModal: () => void;
  isKeyConfigured: boolean;
  onNewQuizClick: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  onNavigate,
  onOpenSecurityModal,
  isKeyConfigured,
  onNewQuizClick,
}) => {
  return (
    <header className="sticky top-0 z-30 w-full bg-white/95 backdrop-blur-xs border-b border-slate-200">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Zone 1: Brand title, single text element wordmark */}
        <button
          onClick={() => onNavigate('creator')}
          className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2 cursor-pointer hover:text-blue-600 transition-colors"
        >
          <span className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
            Q
          </span>
          <span>QuizMind AI</span>
        </button>

        {/* Zone 2: Clean nav links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
          <button
            onClick={() => onNavigate('creator')}
            className={`cursor-pointer transition-colors hover:text-slate-900 pb-0.5 ${
              activeView === 'creator'
                ? 'text-blue-600 font-semibold border-b-2 border-blue-600'
                : 'text-slate-600'
            }`}
          >
            Buat Kuis
          </button>
          <button
            onClick={() => onNavigate('history')}
            className={`cursor-pointer transition-colors hover:text-slate-900 pb-0.5 ${
              activeView === 'history'
                ? 'text-blue-600 font-semibold border-b-2 border-blue-600'
                : 'text-slate-600'
            }`}
          >
            Riwayat Tersimpan
          </button>
          <button
            onClick={onOpenSecurityModal}
            className="cursor-pointer transition-colors hover:text-slate-900 flex items-center gap-1.5"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Keamanan & Git</span>
          </button>
        </nav>

        {/* Zone 3: 1-2 primary actions */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenSecurityModal}
            className="md:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
            aria-label="Keamanan dan Git"
            title="Keamanan dan Git"
          >
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
          </button>

          {activeView !== 'creator' ? (
            <Button
              label="Buat Kuis Baru"
              icon={<Plus className="w-4 h-4" />}
              iconPosition="leading"
              variant="primary"
              size="sm"
              collapseOnMobile={true}
              onClick={onNewQuizClick}
            />
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
              <span className={`w-2 h-2 rounded-full ${isKeyConfigured ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span className="hidden sm:inline">{isKeyConfigured ? 'Kunci Gemini terpasang' : 'Isi API key Gemini'}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
