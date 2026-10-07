import React, { useState } from "react";
import { Button } from "./Button.js";
import type {
  QuizConfig,
  DifficultyLevel,
  QuizDisplayMode,
} from "../types/quiz.js";
import {
  AI_MODELS,
  DIFFICULTIES,
  AIModel,
  DEFAULT_MODEL,
  difficultyName,
  modelName,
} from "../models.js";
import { durationLabel } from "../quizConfig.js";
import {
  Sparkles,
  Upload,
  BookOpen,
  FileText,
  Search,
  Clock,
  Layers,
  ArrowRight,
  Check,
  KeyRound,
  Eye,
  EyeOff,
  Zap,
  BrainCircuit,
  ShieldCheck,
  LayoutGrid,
  ListOrdered,
  SlidersHorizontal,
  Infinity as InfinityIcon,
  ChevronDown,
  WandSparkles,
} from "lucide-react";

interface QuizCreatorProps {
  onGenerate: (config: QuizConfig) => void;
  isLoading: boolean;
  errorMessage: string | null;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  requiresApiKey: boolean;
}
const PRESETS = [
  "Kecerdasan Buatan",
  "Biologi Molekuler",
  "Sejarah Dunia",
  "Algoritma & Struktur Data",
];
const STYLES = [
  "Baku & akademis",
  "Santai & komunikatif",
  "Sederhana & mudah dipahami",
  "Profesional & ringkas",
];

export const QuizCreator: React.FC<QuizCreatorProps> = ({
  onGenerate,
  isLoading,
  errorMessage,
  apiKey,
  onApiKeyChange,
  requiresApiKey,
}) => {
  const [showApiKey, setShowApiKey] = useState(false);
  const [inputMode, setInputMode] = useState<"topic" | "material">("topic");
  const [topic, setTopic] = useState("");
  const [studyMaterial, setStudyMaterial] = useState("");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("moderate");
  const [countChoice, setCountChoice] = useState<number | "custom">(10);
  const [customCount, setCustomCount] = useState("25");
  const [displayMode, setDisplayMode] =
    useState<QuizDisplayMode>("non_sequential");
  const [totalMinutes, setTotalMinutes] = useState(15);
  const [perQuestionSeconds, setPerQuestionSeconds] = useState(60);
  const [unlimited, setUnlimited] = useState(false);
  const [language, setLanguage] = useState<"id" | "en">("id");
  const [languageStyle, setLanguageStyle] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [enableGrounding, setEnableGrounding] = useState(true);
  const [model, setModel] = useState<AIModel>(DEFAULT_MODEL);
  const [uploadError, setUploadError] = useState("");
  const questionCount =
    countChoice === "custom" ? Number(customCount) : countChoice;
  const validCount =
    Number.isInteger(questionCount) &&
    questionCount >= 1 &&
    questionCount <= 100;
  const sequential = displayMode === "sequential";
  const timerValue = sequential ? perQuestionSeconds : totalMinutes;
  const timerMin = sequential ? 15 : 1;
  const timerMax = sequential ? 600 : 120;
  const timerLabel = unlimited
    ? "Tanpa batas"
    : durationLabel(sequential ? perQuestionSeconds : totalMinutes * 60);
  const difficultyIndex = DIFFICULTIES.findIndex(
    (level) => level.id === difficulty,
  );
  const canGenerate =
    !isLoading &&
    Boolean(topic.trim()) &&
    validCount &&
    (!requiresApiKey || Boolean(apiKey.trim())) &&
    (inputMode !== "material" || Boolean(studyMaterial.trim()));
  const upload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
      if (!topic)
        setTopic(file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
    };
    reader.onerror = () =>
      setUploadError("File belum berhasil dibaca. Silakan coba kembali.");
    reader.readAsText(file);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canGenerate) return;
    onGenerate({
      model,
      topic: topic.trim(),
      studyMaterial:
        inputMode === "material" ? studyMaterial.trim() : undefined,
      difficulty,
      questionCount,
      displayMode,
      timeLimitMinutes: unlimited ? 0 : totalMinutes,
      timePerQuestionSeconds: sequential
        ? unlimited
          ? 0
          : perQuestionSeconds
        : undefined,
      language,
      languageStyle: languageStyle.trim() || undefined,
      additionalInstructions: additionalInstructions.trim() || undefined,
      enableGrounding,
    });
  };

  return (
    <div className="page-shell creator-page">
      <section className="creator-hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="status-dot" /> RUANG BELAJAR PERSONAL
          </div>
          <h1>
            Latihan yang tepat.
            <br />
            <span>Pemahaman yang melekat.</span>
          </h1>
          <p>
            Rancang pengalaman belajar Anda sendiri. Dari rasa ingin tahu
            <br className="hidden sm:block" /> menjadi kuis yang sesuai dengan
            tujuan dan ritme Anda.
          </p>
          <div className="hero-features">
            <span>
              <BrainCircuit size={16} /> {AI_MODELS.length} model AI
            </span>
            <span>
              <Layers size={16} /> 9 tingkat kesulitan
            </span>
            <span>
              <SlidersHorizontal size={16} /> Kendali penuh
            </span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <span className="art-orbit orbit-one" />
          <span className="art-orbit orbit-two" />
          <div className="art-card">
            <div className="art-card-top">
              <span className="art-icon">
                <BrainCircuit size={25} />
              </span>
              <span className="art-chip">PERSONAL LEARNING</span>
            </div>
            <div className="art-title">Satu ide, banyak kemungkinan.</div>
            <div className="art-bars">
              <span />
              <span />
              <span />
            </div>
            <div className="art-bottom">
              <span>
                <span className="status-dot" /> Dirancang untuk Anda
              </span>
              <Sparkles size={16} />
            </div>
          </div>
          <span className="art-float">
            <Check size={15} /> Belajar. Pahami. Berkembang.
          </span>
        </div>
      </section>
      <div className="workspace-label">
        <span>
          <SlidersHorizontal size={15} /> KONFIGURASI KUIS
        </span>
        <span>Sesuaikan setiap detail sesi Anda</span>
      </div>
      {errorMessage && (
        <div role="alert" className="form-alert">
          <strong>Kuis belum berhasil dibuat</strong>
          <p>{errorMessage}</p>
        </div>
      )}
      <form onSubmit={submit} className="creator-layout">
        <fieldset
          disabled={isLoading}
          className="creator-fields space-y-5 min-w-0"
        >
          <section className="surface section-pad">
            <div className="section-heading">
              <span className="step-number">01</span>
              <div>
                <h2>Mulai dari materi</h2>
                <p>Tentukan apa yang ingin Anda kuasai.</p>
              </div>
              <BookOpen className="section-end-icon" size={20} />
            </div>
            <div className="segmented mt-6" aria-label="Sumber materi">
              <button
                type="button"
                aria-pressed={inputMode === "topic"}
                onClick={() => setInputMode("topic")}
              >
                <BookOpen size={17} /> Topik bebas
              </button>
              <button
                type="button"
                aria-pressed={inputMode === "material"}
                onClick={() => setInputMode("material")}
              >
                <FileText size={17} /> Catatan & dokumen
              </button>
            </div>
            <label htmlFor="quiz-topic" className="field-label mt-6">
              Topik kuis <span className="required-dot">*</span>
            </label>
            <input
              id="quiz-topic"
              required
              maxLength={300}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Misalnya, bagaimana kecerdasan buatan bekerja?"
              className="field-input"
            />
            <p className="field-help mt-3 mb-2">
              Mulai dari inspirasi berikut, atau tulis topik Anda sendiri.
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  type="button"
                  className="topic-chip"
                  key={preset}
                  onClick={() => setTopic(preset)}
                >
                  {preset}
                  <ArrowRight size={12} />
                </button>
              ))}
            </div>
            {inputMode === "material" && (
              <div className="mt-6">
                <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                  <label htmlFor="study-material" className="field-label mb-0">
                    Materi belajar <span className="required-dot">*</span>
                  </label>
                  <label className="upload-button">
                    <Upload size={14} /> Unggah teks
                    <input
                      type="file"
                      accept=".txt,.md,.text,.csv"
                      onChange={upload}
                      className="sr-only"
                    />
                  </label>
                </div>
                <textarea
                  id="study-material"
                  className="field-input resize-y"
                  rows={6}
                  required
                  maxLength={15000}
                  value={studyMaterial}
                  onChange={(e) => setStudyMaterial(e.target.value)}
                  placeholder="Tempel catatan, ringkasan, atau materi belajar Anda di sini…"
                />
                <div className="field-help flex justify-between gap-3 mt-2">
                  <span>File teks maksimal 2 MB</span>
                  <span>
                    {studyMaterial.length.toLocaleString("id-ID")} / 15.000
                    karakter
                  </span>
                </div>
                {uploadError && (
                  <p role="alert" className="text-sm text-red-600 mt-2">
                    {uploadError}
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="surface section-pad">
            <div className="section-heading">
              <span className="step-number">02</span>
              <div>
                <h2>Atur ritme & tantangan</h2>
                <p>Pengalaman kuis yang mengikuti cara belajar Anda.</p>
              </div>
              <SlidersHorizontal className="section-end-icon" size={20} />
            </div>
            <fieldset className="mt-6">
              <legend className="field-label">
                <Layers size={15} /> Tingkat kesulitan{" "}
                <span className="field-meta">9 level</span>
              </legend>
              <div className="difficulty-grid">
                {DIFFICULTIES.map((level, i) => (
                  <button
                    key={level.id}
                    type="button"
                    aria-pressed={difficulty === level.id}
                    onClick={() => setDifficulty(level.id)}
                  >
                    <span className="level-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{level.name}</span>
                    {difficulty === level.id && <Check size={13} />}
                  </button>
                ))}
              </div>
              <div className="difficulty-description">
                <div className="difficulty-meter" aria-hidden="true">
                  {DIFFICULTIES.map((level, i) => (
                    <span
                      key={level.id}
                      className={i <= difficultyIndex ? "active" : ""}
                    />
                  ))}
                </div>
                <p>{DIFFICULTIES[difficultyIndex].description}</p>
              </div>
            </fieldset>
            <div className="config-divider" />
            <fieldset>
              <legend className="field-label">Jumlah soal</legend>
              <div className="choice-grid count-grid">
                {[5, 10, 15, 20, "custom"].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={countChoice === n}
                    onClick={() => setCountChoice(n as number | "custom")}
                  >
                    {n === "custom" ? (
                      "Custom"
                    ) : (
                      <>
                        {n}
                        <small>soal</small>
                      </>
                    )}
                  </button>
                ))}
              </div>
              {countChoice === "custom" && (
                <div className="custom-count">
                  <label htmlFor="custom-count" className="field-label">
                    Jumlah pilihan Anda
                  </label>
                  <input
                    id="custom-count"
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    required
                    value={customCount}
                    onChange={(e) => setCustomCount(e.target.value)}
                    aria-invalid={!validCount}
                    aria-describedby="count-help"
                    className="field-input"
                  />
                  <p
                    id="count-help"
                    className={`field-help ${!validCount ? "text-red-600" : ""}`}
                  >
                    Masukkan 1–100 soal. Jumlah lebih besar membutuhkan waktu
                    pembuatan lebih lama.
                  </p>
                </div>
              )}
            </fieldset>
            <div className="config-divider" />
            <fieldset>
              <legend className="field-label">Tampilan soal</legend>
              <div className="mode-grid">
                <button
                  type="button"
                  className="mode-card"
                  aria-pressed={!sequential}
                  onClick={() => setDisplayMode("non_sequential")}
                >
                  <div className="mode-card-top">
                    <LayoutGrid size={19} />
                    <span className="selection-dot">
                      {!sequential && <Check size={11} />}
                    </span>
                  </div>
                  <strong>Non sekuensial</strong>
                  <p>
                    Semua soal ditampilkan. Jawab dan tinjau dengan urutan
                    bebas.
                  </p>
                  <span className="mode-tag">Timer total kuis</span>
                </button>
                <button
                  type="button"
                  className="mode-card"
                  aria-pressed={sequential}
                  onClick={() => setDisplayMode("sequential")}
                >
                  <div className="mode-card-top">
                    <ListOrdered size={19} />
                    <span className="selection-dot">
                      {sequential && <Check size={11} />}
                    </span>
                  </div>
                  <strong>Sekuensial</strong>
                  <p>
                    Satu soal per langkah. Lanjut berurutan tanpa kembali ke
                    soal sebelumnya.
                  </p>
                  <span className="mode-tag">Timer per soal</span>
                </button>
              </div>
            </fieldset>
            <div className={`timer-config ${unlimited ? "is-unlimited" : ""}`}>
              <div className="timer-config-heading">
                <label htmlFor="quiz-duration" className="field-label mb-0">
                  <Clock size={16} />{" "}
                  {sequential ? "Durasi per soal" : "Durasi total kuis"}
                </label>
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={unlimited}
                    onChange={(e) => setUnlimited(e.target.checked)}
                  />
                  <span className="toggle-track" />
                  <span>Tanpa batas</span>
                </label>
              </div>
              <div className="timer-value">
                {unlimited ? (
                  <InfinityIcon size={30} />
                ) : (
                  <strong>
                    {sequential
                      ? `${String(Math.floor(perQuestionSeconds / 60)).padStart(2, "0")}:${String(perQuestionSeconds % 60).padStart(2, "0")}`
                      : totalMinutes}
                  </strong>
                )}
                <span>
                  {unlimited
                    ? "Belajar tanpa tekanan waktu"
                    : sequential
                      ? "menit : detik / soal"
                      : "menit / kuis"}
                </span>
              </div>
              <input
                id="quiz-duration"
                type="range"
                min={timerMin}
                max={timerMax}
                step={sequential ? 15 : 1}
                value={timerValue}
                disabled={unlimited}
                onChange={(e) =>
                  sequential
                    ? setPerQuestionSeconds(Number(e.target.value))
                    : setTotalMinutes(Number(e.target.value))
                }
                aria-valuetext={timerLabel}
                style={
                  {
                    "--range-progress": `${((timerValue - timerMin) / (timerMax - timerMin)) * 100}%`,
                  } as React.CSSProperties
                }
              />
              <div className="slider-scale">
                <span>{sequential ? "15 detik" : "1 menit"}</span>
                <span>{sequential ? "10 menit" : "120 menit"}</span>
              </div>
              <p className="field-help">
                {unlimited
                  ? "Kuis hanya selesai saat Anda mengumpulkannya."
                  : sequential
                    ? "Waktu direset setiap soal. Saat habis, kuis otomatis beralih ke soal berikutnya."
                    : "Satu timer untuk seluruh soal. Saat habis, jawaban otomatis dikumpulkan."}
              </p>
            </div>
          </section>

          <section className="surface section-pad">
            <div className="section-heading">
              <span className="step-number">03</span>
              <div>
                <h2>Pilih partner AI</h2>
                <p>Enam pilihan model untuk mendampingi sesi Anda.</p>
              </div>
              <BrainCircuit className="section-end-icon" size={20} />
            </div>
            <fieldset className="model-grid mt-6">
              <legend className="sr-only">Model AI</legend>
              {AI_MODELS.map((m) => (
                <label
                  key={m.id}
                  className={`model-card ${model === m.id ? "is-selected" : ""}`}
                >
                  <div className="model-card-header">
                    <span className="icon-tile">
                      {m.id.startsWith("gemma") ? (
                        <Layers size={19} />
                      ) : m.id.includes("lite") ? (
                        <Zap size={19} />
                      ) : (
                        <BrainCircuit size={19} />
                      )}
                    </span>
                    <input
                      type="radio"
                      name="ai-model"
                      value={m.id}
                      checked={model === m.id}
                      onChange={() => setModel(m.id)}
                      className="accent-indigo-600 w-4 h-4"
                    />
                  </div>
                  <strong>{m.name}</strong>
                  <span className="model-tag">{m.tag}</span>
                  <p>{m.description}</p>
                </label>
              ))}
            </fieldset>
            <label className="grounding-option">
              <div className="icon-tile">
                <Search size={19} />
              </div>
              <div className="flex-1 min-w-0">
                <strong>Perkaya dengan referensi web</strong>
                <p>
                  Google Search Grounding membantu AI menemukan rujukan yang
                  relevan.
                </p>
              </div>
              <input
                type="checkbox"
                checked={enableGrounding}
                onChange={(e) => setEnableGrounding(e.target.checked)}
                className="w-5 h-5 accent-indigo-600 shrink-0"
              />
            </label>
            <details
              className="api-details mt-6"
              open={requiresApiKey || undefined}
            >
              <summary>
                <KeyRound size={16} /> API key pribadi{" "}
                <span>{requiresApiKey ? "Wajib diisi" : "Opsional"}</span>
                <ChevronDown size={14} />
              </summary>
              <div className="pt-4">
                <label htmlFor="personal-api-key" className="field-label">
                  API key Google AI Studio
                </label>
                <div className="flex gap-2">
                  <input
                    id="personal-api-key"
                    type={showApiKey ? "text" : "password"}
                    className="field-input min-w-0 flex-1"
                    value={apiKey}
                    onChange={(e) => onApiKeyChange(e.target.value)}
                    required={requiresApiKey}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Masukkan API key Anda"
                    aria-describedby="api-help"
                  />
                  <button
                    type="button"
                    aria-label={
                      showApiKey ? "Sembunyikan API key" : "Tampilkan API key"
                    }
                    aria-pressed={showApiKey}
                    className="icon-button"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p id="api-help" className="field-help mt-3">
                  Kunci dikirim langsung ke Google dan digunakan selama sesi
                  ini. Kunci tidak disimpan dalam riwayat atau penyimpanan
                  browser.
                </p>
                <div className="flex justify-between gap-2 mt-3">
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-600 font-semibold underline underline-offset-4"
                  >
                    Buat API key di Google AI Studio
                  </a>
                  {apiKey && (
                    <button
                      type="button"
                      className="text-xs text-slate-500"
                      onClick={() => onApiKeyChange("")}
                    >
                      Hapus kunci
                    </button>
                  )}
                </div>
              </div>
            </details>
          </section>

          <section className="surface section-pad">
            <div className="section-heading">
              <span className="step-number">04</span>
              <div>
                <h2>Berikan sentuhan personal</h2>
                <p>Sesuaikan bahasa dan arah latihan Anda.</p>
              </div>
              <WandSparkles className="section-end-icon" size={20} />
            </div>
            <fieldset className="mt-6">
              <legend className="field-label">Bahasa kuis</legend>
              <div className="segmented">
                <button
                  type="button"
                  aria-pressed={language === "id"}
                  onClick={() => setLanguage("id")}
                >
                  Bahasa Indonesia
                </button>
                <button
                  type="button"
                  aria-pressed={language === "en"}
                  onClick={() => setLanguage("en")}
                >
                  English
                </button>
              </div>
            </fieldset>
            <label htmlFor="language-style" className="field-label mt-6">
              Gaya bahasa <span className="optional-badge">Opsional</span>
            </label>
            <input
              id="language-style"
              list="language-styles"
              className="field-input"
              maxLength={500}
              value={languageStyle}
              onChange={(e) => setLanguageStyle(e.target.value)}
              placeholder="Pilih saran atau tulis gaya Anda sendiri"
              aria-describedby="style-help"
            />
            <datalist id="language-styles">
              {STYLES.map((style) => (
                <option key={style} value={style} />
              ))}
            </datalist>
            <div className="style-chips mt-3">
              {STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  aria-pressed={languageStyle === style}
                  onClick={() =>
                    setLanguageStyle(languageStyle === style ? "" : style)
                  }
                >
                  {style}
                </button>
              ))}
            </div>
            <p id="style-help" className="field-help mt-2">
              Kosongkan untuk menggunakan gaya baku & akademis.
            </p>
            <label
              htmlFor="additional-instructions"
              className="field-label mt-6"
            >
              Instruksi tambahan{" "}
              <span className="optional-badge">Opsional</span>
            </label>
            <textarea
              id="additional-instructions"
              className="field-input resize-y"
              rows={4}
              maxLength={2000}
              value={additionalInstructions}
              onChange={(e) => setAdditionalInstructions(e.target.value)}
              placeholder="Contoh: fokus pada studi kasus, sertakan contoh kehidupan sehari-hari, dan hindari perhitungan yang panjang."
            />
            <div className="field-help flex justify-between gap-3 mt-2">
              <span>Beri konteks agar latihan lebih sesuai tujuan Anda.</span>
              <span className="shrink-0">
                {additionalInstructions.length.toLocaleString("id-ID")} / 2.000
              </span>
            </div>
          </section>
        </fieldset>
        <aside className="creator-summary surface section-pad">
          <div className="summary-heading">
            <span className="icon-tile">
              <Sparkles size={19} />
            </span>
            <span className="eyebrow">SESI BELAJAR ANDA</span>
          </div>
          <h2 className="text-xl font-bold mt-5 mb-2">Dirancang oleh Anda.</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Tinjau pengaturan, lalu mulai perjalanan belajar Anda.
          </p>
          <div className="summary-topic">
            <BookOpen size={20} />
            <span>{topic.trim() || "Topik pilihan Anda"}</span>
          </div>
          <dl className="summary-list">
            <div>
              <dt>Kesulitan</dt>
              <dd>
                {difficultyName(difficulty)}
                <small>Level {difficultyIndex + 1} dari 9</small>
              </dd>
            </div>
            <div>
              <dt>Jumlah soal</dt>
              <dd>{validCount ? questionCount : "—"} soal</dd>
            </div>
            <div>
              <dt>Tampilan</dt>
              <dd>{sequential ? "Sekuensial" : "Non sekuensial"}</dd>
            </div>
            <div>
              <dt>{sequential ? "Waktu per soal" : "Waktu total"}</dt>
              <dd>{timerLabel}</dd>
            </div>
            <div>
              <dt>Bahasa</dt>
              <dd>{language === "id" ? "Indonesia" : "English"}</dd>
            </div>
            <div>
              <dt>Gaya bahasa</dt>
              <dd>{languageStyle || "Baku & akademis"}</dd>
            </div>
            <div>
              <dt>Referensi web</dt>
              <dd className={enableGrounding ? "summary-active" : ""}>
                {enableGrounding ? "Aktif" : "Nonaktif"}
              </dd>
            </div>
            {additionalInstructions.trim() && (
              <div>
                <dt>Instruksi tambahan</dt>
                <dd>
                  Ditambahkan <Check size={12} className="inline" />
                </dd>
              </div>
            )}
          </dl>
          <div className="summary-model">
            <BrainCircuit size={17} />
            <div>
              <small>MODEL PILIHAN</small>
              <span>{modelName(model)}</span>
            </div>
            <Check size={14} className="ml-auto shrink-0" />
          </div>
          <Button
            type="submit"
            label={isLoading ? "Menyiapkan kuis…" : "Buat kuis saya"}
            icon={<ArrowRight size={18} />}
            iconPosition="trailing"
            size="lg"
            className="w-full"
            disabled={!canGenerate}
          />
          <p className="summary-note">
            {!topic.trim() ? (
              "Isi topik untuk memulai sesi Anda."
            ) : !validCount ? (
              "Periksa kembali jumlah soal custom."
            ) : requiresApiKey && !apiKey.trim() ? (
              "Lengkapi API key pada bagian partner AI."
            ) : inputMode === "material" && !studyMaterial.trim() ? (
              "Tambahkan materi belajar Anda."
            ) : (
              <>
                <ShieldCheck size={14} /> Riwayat tersimpan di perangkat Anda
              </>
            )}
          </p>
          <div className="summary-tip">
            <BookOpen size={17} />
            <p>
              Setiap soal dilengkapi pembahasan. Pahami alasan di balik jawaban,
              lalu coba lagi untuk melihat kemajuan.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
};
