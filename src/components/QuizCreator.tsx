import React, { useEffect, useRef, useState } from "react";
import { Button } from "./Button.js";
import type { QuizConfig, DifficultyLevel, QuizDisplayMode } from "../types/quiz.js";
import { DIFFICULTIES, difficultyName, modelName } from "../models.js";
import { durationLabel, normalizeQuizConfig } from "../quizConfig.js";
import type { Preferences } from '../workspace/types.js';
import { QuestionComposition } from './QuestionComposition.js';
import { defaultEvaluationSettings } from '../evaluationSettings.js';
import { ArrowLeft, ArrowRight, BookOpen, BrainCircuit, Check, LayoutGrid, ListOrdered, ShieldCheck, SlidersHorizontal, Sparkles, Zap, GraduationCap, Lightbulb } from "lucide-react";
import { QuizComposer } from './QuizComposer.js';
import { useComposerDraft } from './useComposerDraft.js';
import { applyQuickStart, composerSources, QUICK_STARTS } from '../composerDraft.js';

interface QuizCreatorProps {
  onGenerate: (config: QuizConfig) => void; isLoading: boolean; errorMessage: string | null;
  preferences: Preferences; hasApiKey: boolean; storageLabel: string; onOpenSettings: () => void;
  onOpenModelSettings?: () => void;
  initialDraft?: Record<string, unknown> | null; onDraft: (draft: Record<string, unknown>) => Promise<unknown> | void;
  stage?: 'creator' | 'configuration'; onNavigate?: (stage: 'creator' | 'configuration') => void;
  continueLearning?: React.ReactNode;
}
const STYLES = ["Baku & akademis", "Santai & komunikatif", "Sederhana & mudah dipahami", "Profesional & ringkas"];
export const QuizCreator: React.FC<QuizCreatorProps> = ({ onGenerate, isLoading, errorMessage, preferences, hasApiKey, storageLabel, onOpenSettings, onOpenModelSettings = onOpenSettings, initialDraft, onDraft, stage = 'configuration', onNavigate, continueLearning }) => {
  const { draft, patch, flush, saveError, saving, pending, latest } = useComposerDraft(initialDraft, onDraft);
  const { topic, studyMaterial, difficulty, countChoice, customCount, displayMode, totalMinutes, perQuestionSeconds, unlimited, language, languageStyle, additionalInstructions, composition } = draft;
  const setDifficulty = (difficulty: DifficultyLevel) => patch({ difficulty, preset: undefined });
  const setCountChoice = (countChoice: number | 'custom') => patch({ countChoice, preset: undefined });
  const setCustomCount = (customCount: string) => patch({ customCount, preset: undefined });
  const setDisplayMode = (displayMode: QuizDisplayMode) => patch({ displayMode, preset: undefined });
  const setTotalMinutes = (totalMinutes: string) => patch({ totalMinutes, preset: undefined });
  const setPerQuestionSeconds = (perQuestionSeconds: string) => patch({ perQuestionSeconds, preset: undefined });
  const setUnlimited = (unlimited: boolean) => patch({ unlimited, preset: undefined });
  const setLanguage = (language: 'id' | 'en') => patch({ language });
  const setLanguageStyle = (languageStyle: string) => patch({ languageStyle });
  const setAdditionalInstructions = (additionalInstructions: string) => patch({ additionalInstructions });
  const setComposition = (composition: typeof draft.composition) => patch({ composition, preset: undefined });
  const [transitioning, setTransitioning] = useState(false), [validationError, setValidationError] = useState('');
  const guard = useRef(false), heading = useRef<HTMLHeadingElement>(null), previousStage = useRef(stage);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (previousStage.current !== stage) { previousStage.current = stage; heading.current?.focus(); } }, [stage]);
  const sources = composerSources(draft), enableGrounding = preferences.grounding, model = preferences.model;
  const selectedCount = countChoice === 'custom' ? Number(customCount) : countChoice;
  const questionCount = composition.mode === 'mixed' ? Object.values(composition.distribution).reduce((n,v) => n+(v??0),0) : selectedCount;
  const validCount = Number.isInteger(questionCount) && questionCount >= 1 && questionCount <= 100;
  const sequential = displayMode === 'sequential', timerValue = sequential ? perQuestionSeconds : totalMinutes, timerNumber = Number(timerValue);
  const validTimer = unlimited || (Number.isInteger(timerNumber) && timerNumber >= (sequential ? 15 : 1) && timerNumber <= (sequential ? 600 : 120));
  const timerLabel = unlimited ? 'Tanpa batas' : validTimer ? durationLabel(sequential ? timerNumber : timerNumber * 60) : '—';
  const supportsGrounding = model !== 'gemma-4-31b-it' || preferences.searchProvider === 'parallel';
  const missingReason = sources.error || (!validCount ? 'Masukkan jumlah soal antara 1–100.' : !validTimer ? 'Masukkan durasi ' + (sequential ? '15–600 detik.' : '1–120 menit.') : !hasApiKey ? 'Tambahkan API key melalui Pengaturan AI untuk membuat kuis.' : '');
  const canGenerate = !isLoading && !missingReason;
  const navigate = async (next: 'creator' | 'configuration') => {
    if (guard.current || (next === 'configuration' && sources.error)) return;
    guard.current = true; setTransitioning(true); setValidationError('');
    try { await flush(); if (alive.current) onNavigate?.(next); } catch { /* Save error is visible; keep current stage. */ }
    finally { guard.current = false; if (alive.current) setTransitioning(false); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!canGenerate || guard.current || stage !== 'configuration') return;
    guard.current = true; setTransitioning(true); setValidationError('');
    try {
      await flush(); if (!alive.current) return;
      const currentSources = composerSources(latest.current);
      const { difficulty, countChoice, customCount, displayMode, totalMinutes, perQuestionSeconds, unlimited, language, languageStyle, additionalInstructions, composition } = latest.current;
      const sequential = displayMode === 'sequential';
      const questionCount = composition.mode === 'mixed' ? Object.values(composition.distribution).reduce((n,v) => n+(v??0),0) : countChoice === 'custom' ? Number(customCount) : countChoice;
      if (currentSources.error) throw new Error(currentSources.error);
      onGenerate(normalizeQuizConfig({ model, topic: currentSources.topic, studyMaterial: currentSources.material || undefined,
        difficulty, questionCount, displayMode, questionType: composition.type, questionDistribution: composition.mode === 'mixed' ? composition.distribution : { [composition.type]: questionCount },
        pointsByType: composition.points, partialCredit: composition.partialCredit, timePerQuestionByType: sequential && !unlimited ? composition.times : undefined,
        evaluationSettings: preferences.evaluation ?? defaultEvaluationSettings,
        timeLimitMinutes: unlimited ? 0 : sequential ? (Number.isInteger(Number(totalMinutes)) && Number(totalMinutes) >= 1 && Number(totalMinutes) <= 120 ? Number(totalMinutes) : 15) : Number(totalMinutes),
        timePerQuestionSeconds: sequential ? unlimited ? 0 : Number(perQuestionSeconds) : undefined, language, languageStyle: languageStyle.trim() || undefined,
        additionalInstructions: additionalInstructions.trim() || undefined, enableGrounding: enableGrounding && supportsGrounding }));
    } catch (error) { if (alive.current) setValidationError((error as Error).message); }
    finally { guard.current = false; if (alive.current) setTransitioning(false); }
  };
  if (stage === 'creator') return <div className="page-shell smart-home">
    <div className="home-heading"><div className="eyebrow"><span className="home-eyebrow-line" /> RUANG UNTUK RASA INGIN TAHU</div><h1 ref={heading} tabIndex={-1}>Apa yang ingin Anda<br /><span>pelajari hari ini?</span></h1><p>Ubah topik, catatan, atau materi Anda menjadi kuis yang bermakna.</p></div>
    {errorMessage && <div className="form-alert" role="alert"><strong>Kuis belum berhasil dibuat</strong><p>{errorMessage}</p></div>}
    <QuizComposer draft={draft} patch={patch} onContinue={() => void navigate('configuration')} busy={transitioning || isLoading} saving={saving || pending} saveError={saveError} />
    <section className="quick-start-section" aria-labelledby="quick-start-title"><div className="home-section-heading"><h2 id="quick-start-title">Mulai dengan ritme Anda</h2><span>Preset opsional</span></div><div className="quick-starts">{QUICK_STARTS.map((preset, i) => { const Icon = [Zap, GraduationCap, Lightbulb][i]; return <button type="button" key={preset.id} aria-pressed={draft.preset === preset.id} onClick={() => patch(d => applyQuickStart(d, preset.id))}><span className="preset-icon"><Icon size={19} /></span><span><strong>{preset.label}</strong><small>{preset.description}</small></span><ArrowRight size={16} /></button>; })}</div></section>
    {continueLearning}
    <div className="home-ai-note"><BrainCircuit size={16} /><span>{modelName(model)}</span><span className="home-note-separator">·</span><button onClick={onOpenSettings}>{hasApiKey ? 'Kelola AI' : 'Hubungkan AI Anda'}<ArrowRight size={13} /></button></div>
  </div>;
  return <div className="page-shell menu-page configuration-page">
    <button type="button" className="configuration-back" disabled={transitioning || isLoading} onClick={() => void navigate('creator')}><ArrowLeft size={17} />Kembali</button>
    <div className="menu-heading"><div><div className="eyebrow">LANGKAH 2 · SESUAIKAN LATIHAN</div><h1 ref={heading} tabIndex={-1}>Konfigurasi Kuis</h1><p>Atur latihan sesuai tujuan dan waktu Anda.</p></div><span className="menu-heading-note"><Sparkles size={16} /> Dibantu AI</span></div>
    {(errorMessage || validationError || saveError) && <div role="alert" className="form-alert"><strong>Kuis belum dapat dimulai</strong><p>{validationError || saveError || errorMessage}</p></div>}
    <form onSubmit={submit} className="menu-layout"><fieldset disabled={isLoading || transitioning} className="menu-fields">
      <section className="surface menu-section source-summary"><div className="menu-section-title"><BookOpen size={19} /><h2>Sumber kuis</h2><button type="button" onClick={() => void navigate('creator')}>Edit materi<ArrowRight size={14} /></button></div><h3>{sources.topic}</h3><p>{studyMaterial.trim() ? 'Konteks materi ditambahkan · ' : ''}{draft.attachments.length ? draft.attachments.length + ' lampiran · ' : ''}{sources.material.length.toLocaleString('id-ID')} karakter materi</p>{draft.attachments.map(a => <span key={a.id} className="configuration-file">{a.name}</span>)}</section>
      <QuestionComposition expanded value={composition} onChange={setComposition} count={selectedCount} sequential={sequential && !unlimited} evaluator={preferences.evaluation ?? defaultEvaluationSettings} onOpen={onOpenModelSettings} />
          <section className="surface menu-section">
            <div className="menu-section-title"><SlidersHorizontal size={19} /><h2>Pengaturan latihan</h2></div>
            <div className="menu-setting-grid">
              <div>
                <label htmlFor="quiz-difficulty" className="field-label">Tingkat kesulitan</label>
                <select id="quiz-difficulty" className="field-input" value={difficulty} onChange={e => setDifficulty(e.target.value as DifficultyLevel)} aria-describedby="difficulty-help">
                  {DIFFICULTIES.map((level, index) => <option key={level.id} value={level.id}>{index + 1}. {level.name}</option>)}
                </select>
                <p id="difficulty-help" className="field-help">Pilih tingkat latihan yang kamu inginkan.</p>
              </div>
              <div>
                <label htmlFor="quiz-count" className="field-label">Jumlah soal</label>
                <select id="quiz-count" className="field-input" value={countChoice} onChange={e => setCountChoice(e.target.value === "custom" ? "custom" : Number(e.target.value))}>
                  {[5, 10, 15, 20].map(count => <option key={count} value={count}>{count} soal</option>)}
                  <option value="custom">Jumlah lainnya…</option>
                </select>
                {countChoice === "custom" && <div className="menu-custom-count">
                  <label htmlFor="custom-count" className="field-label">Jumlah soal pilihan Anda</label>
                  <input id="custom-count" type="number" min={1} max={100} step={1} required value={customCount} onChange={e => setCustomCount(e.target.value)} aria-invalid={!validCount} aria-describedby="count-help" className="field-input" />
                </div>}
                <p id="count-help" className={`field-help ${!validCount ? "text-red-600" : ""}`}>{countChoice === "custom" ? "Masukkan 1–100 soal." : "Lebih banyak soal membutuhkan waktu pembuatan lebih lama."}</p>
              </div>
            </div>
            <fieldset className="menu-mode-field">
              <legend className="field-label">Cara mengerjakan</legend>
              <div className="menu-mode-options">
                {([{ id: "non_sequential", label: "Urutan bebas", help: "Bisa kembali ke soal sebelumnya.", icon: LayoutGrid }, { id: "sequential", label: "Satu per satu", help: "Berurutan, tanpa kembali ke soal sebelumnya.", icon: ListOrdered }] as const).map(({ id, label, help, icon: Icon }) => (
                  <label key={id} className="menu-mode-option">
                    <input type="radio" name="display-mode" checked={displayMode === id} value={id} onChange={() => setDisplayMode(id)} />
                    <span><strong><Icon size={16} />{label}</strong><small>{help}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="menu-setting-grid menu-time-row">
              <div>
                <label htmlFor="quiz-duration" className="field-label">{sequential ? "Waktu per soal" : "Waktu total kuis"}</label>
                <div className="menu-number-field"><input id="quiz-duration" className="field-input" type="number" min={sequential ? 15 : 1} max={sequential ? 600 : 120} step={1} value={timerValue} required={!unlimited} disabled={unlimited} aria-invalid={!validTimer} aria-describedby="duration-help" onChange={e => sequential ? setPerQuestionSeconds(e.target.value) : setTotalMinutes(e.target.value)} /><span>{sequential ? "detik" : "menit"}</span></div>
                <p id="duration-help" className={`field-help ${!validTimer ? "text-red-600" : ""}`}>{unlimited ? "Kerjakan sesuai ritme Anda." : sequential ? "15–600 detik untuk setiap soal." : "1–120 menit untuk seluruh kuis."}</p>
              </div>
              <label className="menu-checkbox menu-unlimited"><input type="checkbox" checked={unlimited} onChange={e => setUnlimited(e.target.checked)} /><span>Tanpa batas waktu</span></label>
            </div>
          </section>

          <section className="surface menu-advanced">
            <div className="menu-section-title personalization-title"><SlidersHorizontal size={18} /><h2>Bahasa & instruksi</h2></div>
            <div className="menu-advanced-body">
              <div className="menu-setting-grid">
                <div><span className="field-label">Partner AI</span><button type="button" className="ai-config-shortcut" onClick={onOpenModelSettings}><BrainCircuit size={18} /><span>{modelName(model)}<small>Kelola di Pengaturan AI</small></span><ArrowRight size={16} /></button></div>
                <div><label htmlFor="quiz-language" className="field-label">Bahasa kuis</label><select id="quiz-language" className="field-input" value={language} onChange={e => setLanguage(e.target.value as "id" | "en")}><option value="id">Bahasa Indonesia</option><option value="en">English</option></select></div>
              </div>
              <p className="field-help mt-4">Referensi web {enableGrounding && supportsGrounding ? 'aktif' : 'nonaktif'} · Ubah melalui Pengaturan AI.</p>
              <label htmlFor="language-style" className="field-label">Gaya bahasa <span className="optional-badge">Opsional</span></label>
              <input id="language-style" list="language-styles" className="field-input" maxLength={500} value={languageStyle} onChange={e => setLanguageStyle(e.target.value)} placeholder="Baku & akademis" aria-describedby="style-help" />
              <datalist id="language-styles">{STYLES.map(style => <option key={style} value={style} />)}</datalist>
              <p id="style-help" className="field-help">Pilih saran atau tulis gaya Anda sendiri.</p>
              <label htmlFor="additional-instructions" className="field-label mt-5">Instruksi tambahan <span className="optional-badge">Opsional</span></label>
              <textarea id="additional-instructions" className="field-input resize-y" rows={3} maxLength={2000} value={additionalInstructions} onChange={e => setAdditionalInstructions(e.target.value)} placeholder="Contoh: fokus pada studi kasus dan contoh sehari-hari." />
            </div>
          </section>

          <section className="surface ai-connection-card"><span className={`connection-dot ${hasApiKey ? 'connected' : ''}`} /><div><strong>{hasApiKey ? 'Partner AI siap digunakan' : 'Hubungkan partner AI Anda'}</strong><p>{hasApiKey ? 'Key dan model mengikuti ruang penyimpanan aktif.' : 'Tambahkan API key tanpa perlu login.'}</p></div><button type="button" className="settings-link" onClick={onOpenSettings}>Pengaturan AI <ArrowRight size={15} /></button></section>
        </fieldset>

        <aside className="surface menu-summary" aria-label="Ringkasan kuis">
          <div className="menu-section-title"><Sparkles size={19} /><h2>Ringkasan kuis</h2></div>
          <div className="menu-summary-topic"><span>{"LATIHAN ANDA"}</span><h3>{sources.topic}</h3></div>
          <dl className="menu-summary-list">
            <div><dt>Kesulitan</dt><dd>{difficultyName(difficulty)}</dd></div>
            <div><dt>Jumlah soal</dt><dd>{validCount ? questionCount : "—"} soal</dd></div>
            <div><dt>Mode kuis</dt><dd>{sequential ? "Satu per satu" : "Urutan bebas"}</dd></div>
            <div><dt>{sequential ? "Waktu per soal" : "Waktu total"}</dt><dd>{timerLabel}</dd></div>
            <div><dt>Bahasa</dt><dd>{language === "id" ? "Indonesia" : "English"}</dd></div>
            {languageStyle.trim() && <div><dt>Gaya bahasa</dt><dd>{languageStyle}</dd></div>}
            <div><dt>Referensi web</dt><dd>{enableGrounding && supportsGrounding ? "Aktif" : "Nonaktif"}</dd></div>
            {additionalInstructions.trim() && <div><dt>Instruksi tambahan</dt><dd><Check size={14} /> Ditambahkan</dd></div>}
          </dl>
          <div className="menu-summary-model"><BrainCircuit size={17} /><span>{modelName(model)}</span></div>
          <Button type="submit" label={isLoading || transitioning ? "Menyiapkan kuis…" : "Mulai"} icon={<ArrowRight size={17} />} iconPosition="trailing" className="w-full" size="lg" disabled={!canGenerate || transitioning} aria-describedby="generate-help" />
          <p id="generate-help" className="menu-submit-help" aria-live="polite">{missingReason || "Mulai menggunakan kuota AI pada ruang aktif."}</p>
          <p className="menu-privacy-note"><ShieldCheck size={14} /> {storageLabel}</p>
        </aside>
    </form>
  </div>;
};
