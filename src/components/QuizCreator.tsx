import React, { useEffect, useRef, useState } from "react";
import { Button } from "./Button.js";
import type { QuizConfig, DifficultyLevel, QuizDisplayMode } from "../types/quiz.js";
import { AI_MODELS, DIFFICULTIES, AIModel, DEFAULT_MODEL, difficultyName, modelName } from "../models.js";
import { durationLabel } from "../quizConfig.js";
import type { Preferences } from '../workspace/types.js';
import { QuestionComposition, defaultComposition, type Composition } from './QuestionComposition.js';
import { defaultEvaluationSettings } from '../evaluationSettings.js';
import { ArrowRight, BookOpen, BrainCircuit, Check, ChevronDown, FileText, KeyRound, LayoutGrid, ListOrdered, ShieldCheck, SlidersHorizontal, Sparkles, Upload } from "lucide-react";

interface QuizCreatorProps {
  onGenerate: (config: QuizConfig) => void;
  isLoading: boolean;
  errorMessage: string | null;
  preferences: Preferences;
  hasApiKey: boolean;
  storageLabel: string;
  onOpenSettings: () => void;
  initialDraft?: Record<string, unknown> | null;
  onDraft: (draft: Record<string, unknown>) => void;
}
const PRESETS = ["Kecerdasan Buatan", "Biologi Molekuler", "Sejarah Dunia", "Algoritma & Struktur Data"];
const STYLES = ["Baku & akademis", "Santai & komunikatif", "Sederhana & mudah dipahami", "Profesional & ringkas"];

export const QuizCreator: React.FC<QuizCreatorProps> = ({ onGenerate, isLoading, errorMessage, preferences, hasApiKey, storageLabel, onOpenSettings, initialDraft, onDraft }) => {
  const restore = <T,>(field: string, fallback: T): T => (initialDraft?.[field] as T) ?? fallback;
  const [inputMode, setInputMode] = useState<"topic" | "material">(restore('inputMode', 'topic'));
  const [topic, setTopic] = useState(restore('topic', ''));
  const [studyMaterial, setStudyMaterial] = useState(restore('studyMaterial', ''));
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(() => {
    const saved = String(restore('difficulty', 'moderate'));
    const id = ({ beginner: 'easy', advanced: 'hard', expert: 'master' } as Record<string, string>)[saved] || saved;
    return DIFFICULTIES.find(level => level.id === id)?.id || 'moderate';
  });
  const [countChoice, setCountChoice] = useState<number | "custom">(restore('countChoice', 10));
  const [customCount, setCustomCount] = useState(restore('customCount', '25'));
  const [displayMode, setDisplayMode] = useState<QuizDisplayMode>(restore('displayMode', 'non_sequential'));
  const [totalMinutes, setTotalMinutes] = useState(restore('totalMinutes', '15'));
  const [perQuestionSeconds, setPerQuestionSeconds] = useState(restore('perQuestionSeconds', '60'));
  const [unlimited, setUnlimited] = useState(restore('unlimited', false));
  const [language, setLanguage] = useState<"id" | "en">(restore('language', 'id'));
  const [languageStyle, setLanguageStyle] = useState(restore('languageStyle', ''));
  const [additionalInstructions, setAdditionalInstructions] = useState(restore('additionalInstructions', ''));
  const [composition, setComposition] = useState<Composition>(restore('composition', defaultComposition));
  const enableGrounding = preferences.grounding;
  const model = preferences.model;
  const draftCallback = useRef(onDraft); draftCallback.current = onDraft;
  useEffect(() => {
    const timer = setTimeout(() => draftCallback.current({ inputMode, topic, studyMaterial, difficulty, countChoice, customCount,
      displayMode, totalMinutes, perQuestionSeconds, unlimited, language, languageStyle, additionalInstructions, composition }), 600);
    return () => clearTimeout(timer);
  }, [inputMode, topic, studyMaterial, difficulty, countChoice, customCount, displayMode, totalMinutes, perQuestionSeconds, unlimited, language, languageStyle, additionalInstructions, composition]);
  const [uploadError, setUploadError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedCount = countChoice === "custom" ? Number(customCount) : countChoice;
  const questionCount = composition.mode === 'mixed' ? Object.values(composition.distribution).reduce((n,v) => n+(v??0),0) : selectedCount;
  const validCount = Number.isInteger(questionCount) && questionCount >= 1 && questionCount <= 100;
  const sequential = displayMode === "sequential";
  const timerValue = sequential ? perQuestionSeconds : totalMinutes;
  const timerNumber = Number(timerValue);
  const validTimer = unlimited || (Number.isInteger(timerNumber) && timerNumber >= (sequential ? 15 : 1) && timerNumber <= (sequential ? 600 : 120));
  const timerLabel = unlimited ? "Tanpa batas" : validTimer ? durationLabel(sequential ? timerNumber : timerNumber * 60) : "—";
  const supportsGrounding = model !== "gemma-4-31b-it" || preferences.searchProvider === 'parallel';
  const selectedModel = AI_MODELS.find(item => item.id === model)!;
  const missingReason = !topic.trim() ? "Isi topik kuis untuk melanjutkan."
    : inputMode === "material" && !studyMaterial.trim() ? "Tempel atau unggah materi belajar."
    : !validCount ? "Masukkan jumlah soal antara 1–100."
    : !validTimer ? `Masukkan durasi ${sequential ? "15–600 detik" : "1–120 menit"}.`
    : !hasApiKey ? "Tambahkan API key melalui Pengaturan AI untuk membuat kuis." : "";
  const canGenerate = !isLoading && !missingReason;
  const upload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.(txt|md|text|csv)$/i.test(file.name)) {
      setUploadError("Gunakan file .txt, .md, .text, atau .csv.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError("Ukuran file maksimal 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setStudyMaterial(String(reader.result).slice(0, 15000));
      setUploadError("");
      if (!topic.trim()) setTopic(file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").slice(0, 300));
    };
    reader.onerror = () => setUploadError("File belum berhasil dibaca. Silakan coba kembali.");
    reader.readAsText(file);
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canGenerate) return;
    onGenerate({
      model, topic: topic.trim(),
      studyMaterial: inputMode === "material" ? studyMaterial.trim() : undefined,
      difficulty, questionCount, displayMode,
      questionType: composition.type, questionDistribution: composition.mode === 'mixed' ? composition.distribution : { [composition.type]: questionCount },
      pointsByType: composition.points, partialCredit: composition.partialCredit, timePerQuestionByType: sequential && !unlimited ? composition.times : undefined,
      evaluationSettings: preferences.evaluation ?? defaultEvaluationSettings,
      timeLimitMinutes: unlimited ? 0 : sequential
        ? (Number.isInteger(Number(totalMinutes)) && Number(totalMinutes) >= 1 && Number(totalMinutes) <= 120 ? Number(totalMinutes) : 15)
        : Number(totalMinutes),
      timePerQuestionSeconds: sequential ? unlimited ? 0 : Number(perQuestionSeconds) : undefined,
      language, languageStyle: languageStyle.trim() || undefined,
      additionalInstructions: additionalInstructions.trim() || undefined, enableGrounding: enableGrounding && supportsGrounding,
    });
  };

  return (
    <div className="page-shell menu-page">
      <div className="menu-heading">
        <div>
          <div className="eyebrow">RUANG BELAJAR</div>
          <h1>Buat kuis baru</h1>
          <p>Pilih materi, sesuaikan latihan, dan mulai belajar.</p>
        </div>
        <span className="menu-heading-note"><Sparkles size={16} /> Dibantu AI</span>
      </div>
      {errorMessage && <div role="alert" className="form-alert"><strong>Kuis belum berhasil dibuat</strong><p>{errorMessage}</p></div>}
      <form onSubmit={submit} className="menu-layout">
        <fieldset disabled={isLoading} className="menu-fields">
          <QuestionComposition value={composition} onChange={setComposition} count={selectedCount} sequential={sequential && !unlimited} evaluator={preferences.evaluation ?? defaultEvaluationSettings} onOpen={onOpenSettings} />
          <section className="surface menu-section">
            <div className="menu-section-title"><BookOpen size={19} /><h2>Materi kuis</h2></div>
            <fieldset className="source-options">
              <legend className="sr-only">Sumber materi</legend>
              {([{ id: "topic", label: "Topik bebas", icon: BookOpen }, { id: "material", label: "Materi sendiri", icon: FileText }] as const).map(({ id, label, icon: Icon }) => (
                <label key={id} className="source-option">
                  <input type="radio" name="input-mode" value={id} checked={inputMode === id} onChange={() => setInputMode(id)} />
                  <Icon size={16} /><span>{label}</span>
                </label>
              ))}
            </fieldset>
            <label htmlFor="quiz-topic" className="field-label">Topik kuis <span className="required-dot">*</span></label>
            <input id="quiz-topic" required maxLength={300} value={topic} onChange={e => setTopic(e.target.value)} placeholder="Contoh: sistem tata surya" className="field-input" />
            {inputMode === "topic" ? (
              <div className="menu-presets"><span>Ide topik</span>{PRESETS.map(preset => <button type="button" className="topic-chip" key={preset} onClick={() => setTopic(preset)}>{preset}</button>)}</div>
            ) : (
              <div className="material-field">
                <div className="material-label"><label htmlFor="study-material" className="field-label">Materi belajar <span className="required-dot">*</span></label>
                  <button type="button" className="upload-button" onClick={() => fileInput.current?.click()}><Upload size={14} /> Unggah teks</button>
                  <input ref={fileInput} type="file" accept=".txt,.md,.text,.csv" onChange={upload} className="sr-only" tabIndex={-1} aria-label="File materi belajar" />
                </div>
                <textarea id="study-material" className="field-input resize-y" rows={5} required maxLength={15000} value={studyMaterial} onChange={e => setStudyMaterial(e.target.value)} placeholder="Tempel catatan atau materi belajar di sini…" aria-describedby="material-help" />
                <p id="material-help" className="field-help material-help"><span>TXT, MD, TEXT, CSV · Maks. 2 MB</span><span>{studyMaterial.length.toLocaleString("id-ID")} / 15.000</span></p>
                {uploadError && <p role="alert" className="text-sm text-red-600 mt-2">{uploadError}</p>}
              </div>
            )}
          </section>

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

          <details className="surface menu-advanced">
            <summary><SlidersHorizontal size={18} /><span><strong>Personalisasi kuis</strong><small>Bahasa, gaya penulisan, dan instruksi tambahan</small></span><ChevronDown size={18} /></summary>
            <div className="menu-advanced-body">
              <div className="menu-setting-grid">
                <div><span className="field-label">Partner AI</span><button type="button" className="ai-config-shortcut" onClick={onOpenSettings}><BrainCircuit size={18} /><span>{modelName(model)}<small>Kelola di Pengaturan AI</small></span><ArrowRight size={16} /></button></div>
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
          </details>

          <section className="surface ai-connection-card"><span className={`connection-dot ${hasApiKey ? 'connected' : ''}`} /><div><strong>{hasApiKey ? 'Partner AI siap digunakan' : 'Hubungkan partner AI Anda'}</strong><p>{hasApiKey ? 'Key dan model mengikuti ruang penyimpanan aktif.' : 'Tambahkan API key tanpa perlu login.'}</p></div><button type="button" className="settings-link" onClick={onOpenSettings}>Pengaturan AI <ArrowRight size={15} /></button></section>
        </fieldset>

        <aside className="surface menu-summary" aria-label="Ringkasan kuis">
          <div className="menu-section-title"><Sparkles size={19} /><h2>Ringkasan kuis</h2></div>
          <div className="menu-summary-topic"><span>{inputMode === "material" ? "DARI MATERI ANDA" : "TOPIK PILIHAN"}</span><h3>{topic.trim() || "Topik belum diisi"}</h3></div>
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
          <Button type="submit" label={isLoading ? "Menyiapkan kuis…" : "Buat kuis"} icon={<ArrowRight size={17} />} iconPosition="trailing" className="w-full" size="lg" disabled={!canGenerate} aria-describedby="generate-help" />
          <p id="generate-help" className="menu-submit-help" aria-live="polite">{missingReason || "Setiap soal dilengkapi pembahasan."}</p>
          <p className="menu-privacy-note"><ShieldCheck size={14} /> {storageLabel}</p>
        </aside>
      </form>
    </div>
  );
};
