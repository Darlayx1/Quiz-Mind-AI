import type { QuizProgress } from '../workspace/types.js';
import { exportJSON, type Draft } from '../quizStorage.js';
import { validateAnswer } from '../questionState.js';
import { QuestionInput, stableShuffle } from './QuestionInput.js';
import { answerProgress, normalizedAnswer, questionLabels, questionType } from '../questionState.js';
import React, { useState, useEffect, useRef } from "react";
import { quizTimerSeconds } from "../quizConfig.js";
import type { Quiz, QuizSubmission, Question, StoredAnswer, AnswerValue } from "../types/quiz.js";
import { ConfirmModal } from "./ConfirmModal.js";
import { useAnimatedDismiss, useVisualTransition } from '../ui/motion.js';
import {
  Clock,
  Bookmark,
  ChevronRight,
  Infinity as InfinityIcon,
  ChevronLeft,
  Download,
  X,
  LogOut,
  LockKeyhole,
  Check,
  ArrowRight,
} from "lucide-react";

interface QuizRunnerProps {
  quiz: Quiz;
  onSubmit: (submission: QuizSubmission) => void;
  onQuit: () => void;
  attemptKey?: string;
  initialProgress?: QuizProgress | null;
  onProgress?: (progress: QuizProgress) => void | Promise<unknown>;
}

export type AnswerCompleteness = 'unanswered' | 'partial' | 'answered';
// Readiness is a presentation hint; scoring and persisted answers keep their existing contracts.
export function evaluateAnswerCompleteness(question: Question, rawAnswer?: StoredAnswer): AnswerCompleteness {
  const progress = answerProgress(question, rawAnswer);
  if (progress !== 'complete') return progress;
  const answer = normalizedAnswer(question, rawAnswer);
  if (answer?.type === 'essay' && answer.text.trim().split(/\s+/).length < 8) return 'partial';
  return 'answered';
}

export function emptyQuestionAnswer(question: Question, seed: string): AnswerValue {
  switch (question.type) {
    case 'multiple_select': return { type: 'multiple_select', selectedOptionIds: [] };
    case 'true_false': return { type: 'true_false', value: null };
    case 'short_answer': case 'essay': return { type: question.type, text: '' };
    case 'matching': return { type: 'matching', pairs: {} };
    case 'ordering': return { type: 'ordering', orderedItemIds: stableShuffle(question.items, question.id + seed).map(i => i.id), confirmed: false };
    default: return { type: 'single_choice', selectedOptionId: null };
  }
}

export const QuizRunner: React.FC<QuizRunnerProps> = ({quiz,onSubmit,onQuit,attemptKey,initialProgress,onProgress}) => {
  const progressCallback=useRef(onProgress);progressCallback.current=onProgress;
  const readData=async<T,>(_key:string):Promise<T|undefined>=>initialProgress?.quizId===quiz.id?({...initialProgress,index:initialProgress.currentIndex,attemptId:initialProgress.attemptId??crypto.randomUUID()} as T):undefined;
  const writeData=async(_key:string,draft:Draft)=>{if(draft.submitted)return;await progressCallback.current?.({quizId:quiz.id,currentIndex:draft.index,answers:draft.answers,bookmarks:draft.bookmarks,startedAt:draft.startedAt,deadline:draft.deadline,attemptId:draft.attemptId});};
  const sequential=quiz.displayMode==='sequential',total=quiz.questions.length;
  const questionLimit=(index:number)=>sequential?(quiz.timePerQuestionByType?.[questionType(quiz.questions[index])]??quizTimerSeconds(quiz)):quizTimerSeconds(quiz);
  const [currentIndex,setCurrentIndex]=useState(0),[userAnswers,setUserAnswers]=useState<Record<string,StoredAnswer>>({}),[bookmarks,setBookmarks]=useState<Set<string>>(new Set());
  const [timeLeft,setTimeLeft]=useState(questionLimit(0)),[notice,setNotice]=useState(''),[showSubmitConfirm,setShowSubmitConfirm]=useState(false),[showQuitConfirm,setShowQuitConfirm]=useState(false),[hydrated,setHydrated]=useState(false),[readOnly,setReadOnly]=useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const dismissDrawer = useAnimatedDismiss(drawerRef, () => setIsMobileDrawerOpen(false), isMobileDrawerOpen);
  const dismissDrawerRef = useRef(dismissDrawer); dismissDrawerRef.current = dismissDrawer;
  const questionPresentation = useRef<HTMLDivElement>(null);
  useVisualTransition(questionPresentation, sequential ? currentIndex : 'free', 10);
  const canReviewSequential = sequential && quiz.questions.every((_, index) => questionLimit(index) === 0);
  const submitted=useRef(false),startedAt=useRef(Date.now()),deadline=useRef(0),indexRef=useRef(0),answersRef=useRef(userAnswers),bookmarksRef=useRef(bookmarks),submitRef=useRef(onSubmit),attempt=useRef(attemptKey??crypto.randomUUID()),ready=useRef(false),owner=useRef(false),questionHeading=useRef<HTMLHeadingElement>(null),saveTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  submitRef.current=onSubmit;
  const active=useRef(true);
  const limit=questionLimit(currentIndex),unlimited=limit===0;
  const snapshot=():Draft=>({quizId:quiz.id,attemptId:attempt.current,answers:answersRef.current,bookmarks:Array.from(bookmarksRef.current),index:indexRef.current,startedAt:startedAt.current,deadline:deadline.current});
  const save=()=>{if(!ready.current||!owner.current||submitted.current)return;clearTimeout(saveTimer.current);void writeData('draft:'+quiz.id,snapshot()).catch(()=>setNotice('Belum tersimpan pada ruang aktif. Ekspor jawaban sebelum menutup halaman.'));};
  const schedule=()=>{clearTimeout(saveTimer.current);saveTimer.current=setTimeout(save,500);};
  const finish=(finishedAt=Date.now(),reason:'manual'|'timer'='manual')=>{
    if(submitted.current||!ready.current||!owner.current)return;submitted.current=true;setIsSubmitting(true);setIsMobileDrawerOpen(false);clearTimeout(saveTimer.current);
    const submission:QuizSubmission={schemaVersion:2,quizId:quiz.id,attemptId:attempt.current,submissionId:crypto.randomUUID(),userAnswers:{...answersRef.current},bookmarkedQuestions:Array.from(bookmarksRef.current),startedAt:new Date(startedAt.current).toISOString(),completedAt:new Date().toISOString(),timeTakenSeconds:Math.max(0,Math.round((finishedAt-startedAt.current)/1000)),submitReason:reason};
    void writeData('draft:'+quiz.id,{...snapshot(),submitted:submission}).catch(()=>{}).finally(()=>{if(active.current)submitRef.current(submission);});
  };
  const tick=()=>{
    if(!ready.current||!owner.current||submitted.current)return false;
    const now=Date.now();let changed=false;
    while(questionLimit(indexRef.current)>0&&now>=deadline.current){
      if(!sequential||indexRef.current>=total-1){finish(deadline.current,'timer');return true;}
      indexRef.current++;const nextLimit=questionLimit(indexRef.current);deadline.current=nextLimit?deadline.current+nextLimit*1000:0;changed=true;
    }
    if(changed){setCurrentIndex(indexRef.current);setShowSubmitConfirm(false);setNotice('Waktu habis. Jawaban sebelumnya dikunci; lanjutkan soal berikutnya.');save();}
    setTimeLeft(questionLimit(indexRef.current)?Math.max(0,Math.ceil((deadline.current-now)/1000)):0);return changed;
  };
  useEffect(()=>{
    active.current=true;
    let mounted=true,release:()=>void=()=>{},heartbeat:ReturnType<typeof setInterval>|undefined;
    const token=crypto.randomUUID(),lease='quizmind_attempt_owner_'+quiz.id;
    const initialize=async()=>{
      if(!mounted)return;owner.current=true;
      try{
        const draft=attemptKey?undefined:await readData<Draft>('draft:'+quiz.id);
        if(!mounted)return;
        if(draft){
          if(draft.quizId!==quiz.id||typeof draft.attemptId!=='string'||!draft.answers||typeof draft.answers!=='object'||Array.isArray(draft.answers)||!Number.isInteger(draft.index)||draft.index<0||draft.index>=total||!Number.isFinite(draft.startedAt)||!Number.isFinite(draft.deadline)||!Array.isArray(draft.bookmarks)||Object.keys(draft.answers).some(id=>!quiz.questions.some(q=>q.id===id))||quiz.questions.some(q=>!validateAnswer(q,draft.answers[q.id])))throw Error('Draft tidak valid. Salinan asli tetap tersimpan.');
          attempt.current=draft.attemptId;answersRef.current=draft.answers;bookmarksRef.current=new Set(draft.bookmarks.filter(id=>quiz.questions.some(q=>q.id===id)));indexRef.current=draft.index;startedAt.current=draft.startedAt;deadline.current=draft.deadline;setUserAnswers(draft.answers);setBookmarks(new Set(bookmarksRef.current));setCurrentIndex(draft.index);setNotice('Progres sebelumnya dipulihkan; waktu mengikuti deadline semula.');
          if(draft.submitted){submitted.current=true;submitRef.current(draft.submitted);return;}
        }else{startedAt.current=Date.now();deadline.current=questionLimit(0)?Date.now()+questionLimit(0)*1000:0;}
      }catch(e){if(e instanceof Error&&e.message.startsWith('Draft tidak valid')){owner.current=false;setReadOnly(true);setHydrated(true);setNotice(e.message);return;}setNotice(e instanceof Error?e.message:'Draft belum berhasil dibaca.');startedAt.current=Date.now();deadline.current=questionLimit(0)?Date.now()+questionLimit(0)*1000:0;}
      ready.current=true;setHydrated(true);tick();
    };
    // StrictMode cleans up its first effect before remounting. Never acquire a lease for that stale effect.
    if(navigator.locks){void Promise.resolve().then(()=>{if(!mounted)return;return navigator.locks.request(lease,{ifAvailable:true},async lock=>{if(!mounted)return;if(!lock){setReadOnly(true);setHydrated(true);setNotice('Kuis ini sedang dikerjakan pada tab lain. Tutup sesi di tab itu lalu buka kembali.');return;}await initialize();if(!mounted)return;await new Promise<void>(resolve=>{release=resolve;});});});}
    else { void initialize(); }
    const onHide=()=>{save();release();owner.current=false;};window.addEventListener('pagehide',onHide);
    return()=>{save();mounted=false;active.current=false;ready.current=false;owner.current=false;clearInterval(heartbeat);clearTimeout(saveTimer.current);release();window.removeEventListener('pagehide',onHide);};
  },[]);
  useEffect(()=>{const timer=window.setInterval(tick,250),onVisible=()=>{if(!document.hidden)tick();};window.addEventListener('focus',tick);document.addEventListener('visibilitychange',onVisible);return()=>{clearInterval(timer);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',onVisible);};},[]);
  useEffect(()=>{if(sequential&&currentIndex>0)questionHeading.current?.focus({preventScroll:true});},[currentIndex]);
  const choose=(id:string,answer:AnswerValue)=>{if(!ready.current||!owner.current||submitted.current||tick())return;if(sequential&&id!==quiz.questions[indexRef.current].id)return;answersRef.current={...answersRef.current,[id]:answer};setUserAnswers(answersRef.current);schedule();};
  const toggleBookmark=(id:string)=>{if(!ready.current||!owner.current||submitted.current)return;const next=new Set(bookmarksRef.current);next.has(id)?next.delete(id):next.add(id);bookmarksRef.current=next;setBookmarks(next);save();};
  const advance=()=>{if(!ready.current||!owner.current||submitted.current||tick())return;if(indexRef.current>=total-1){setShowSubmitConfirm(true);return;}indexRef.current++;deadline.current=questionLimit(indexRef.current)?Date.now()+questionLimit(indexRef.current)*1000:0;setCurrentIndex(indexRef.current);setTimeLeft(questionLimit(indexRef.current));setNotice('');save();};
  const navigateTo = (index: number) => {
    if (index < 0 || index >= total || !ready.current || !owner.current || submitted.current || tick()) return;
    if (sequential && !canReviewSequential) return;
    indexRef.current = index;
    setCurrentIndex(index);
    setIsMobileDrawerOpen(false);
    if (sequential) {
      window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    } else {
      document.getElementById('question-' + quiz.questions[index].id)?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
    save();
  };

  useEffect(() => {
    if (sequential || !hydrated || !('IntersectionObserver' in window)) return;
    const visible = new Set<HTMLElement>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const card = entry.target as HTMLElement;
        if (entry.isIntersecting) visible.add(card); else visible.delete(card);
      }
      const closest = [...visible].sort((a, b) => Math.abs(a.getBoundingClientRect().top - 116) - Math.abs(b.getBoundingClientRect().top - 116))[0];
      if (!closest) return;
      const index = Number(closest.dataset.questionIndex);
      if (index !== indexRef.current) {
        indexRef.current = index;
        setCurrentIndex(index);
        schedule();
      }
    }, { rootMargin: '-100px 0px -45% 0px', threshold: 0 });
    quiz.questions.forEach(q => {
      const card = document.getElementById('question-' + q.id);
      if (card) observer.observe(card);
    });
    return () => observer.disconnect();
  }, [sequential, hydrated, quiz.id]);

  useEffect(() => {
    if (!isMobileDrawerOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawerRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const closeOnDesktop = () => { if (window.innerWidth >= 1024) setIsMobileDrawerOpen(false); };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); dismissDrawerRef.current(); }
      if (event.key !== 'Tab') return;
      const controls = drawerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex="0"]');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', closeOnDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', closeOnDesktop);
      previousFocus?.focus();
    };
  }, [isMobileDrawerOpen]);

  const completeness = quiz.questions.map(q => evaluateAnswerCompleteness(q, userAnswers[q.id]));
  const answered = completeness.filter(status => status === 'answered').length;
  const partial = completeness.filter(status => status === 'partial').length;
  const unanswered = total - answered - partial;
  const progressPercent = total ? Math.round(((answered + partial * 0.5) / total) * 100) : 0;
  const critical = !unlimited && timeLeft <= 60, warning = !unlimited && timeLeft <= 180;
  const clockText = String(Math.floor(timeLeft / 60)).padStart(2, '0') + ':' + String(timeLeft % 60).padStart(2, '0');
  const canInteract = hydrated && !readOnly && !isSubmitting;
  const requestSubmit = () => {
    if (!canInteract || tick()) return;
    setIsMobileDrawerOpen(false);
    setShowSubmitConfirm(true);
  };
  const statusLabel = (index: number) => bookmarks.has(quiz.questions[index].id) ? 'Ragu-ragu' : completeness[index] === 'answered' ? 'Terjawab' : completeness[index] === 'partial' ? 'Sebagian terjawab' : 'Belum dijawab';
  const statusClass = (index: number) => bookmarks.has(quiz.questions[index].id) ? 'flagged' : completeness[index];
  const nextQuestion = () => canReviewSequential ? navigateTo(currentIndex + 1) : advance();

  const palette = () => <div className="quiz-palette" aria-label="Nomor soal">
    {quiz.questions.map((question, index) => <button key={question.id} type="button"
      disabled={!canInteract || (sequential && !canReviewSequential && index !== currentIndex)}
      onClick={() => navigateTo(index)}
      aria-label={`Soal ${index + 1}, ${statusLabel(index)}${sequential && !canReviewSequential && index < currentIndex ? ', dikunci' : ''}`}
      aria-current={index === currentIndex ? 'step' : undefined}
      className={`quiz-palette-item ${statusClass(index)} ${index === currentIndex ? 'is-current' : ''}`}>
      {index + 1}{sequential && !canReviewSequential && index < currentIndex && <LockKeyhole size={9} className="quiz-palette-lock" aria-hidden="true" />}
    </button>)}
  </div>;
  const legend = () => <dl className="quiz-legend">
    <div><dt><i className="answered" />Terjawab</dt><dd>{answered}</dd></div>
    <div><dt><i className="partial" />Sebagian terjawab</dt><dd>{partial}</dd></div>
    <div><dt><i className="flagged" />Ragu-ragu</dt><dd>{bookmarks.size}</dd></div>
    <div><dt><i className="unanswered" />Belum dijawab</dt><dd>{unanswered}</dd></div>
  </dl>;
  const submitButton = () => <button type="button" className="quiz-primary-button" disabled={!canInteract} onClick={requestSubmit}>
    {isSubmitting ? 'Mengumpulkan…' : 'Kumpulkan kuis'}<ArrowRight size={17} />
  </button>;
  const renderQuestion = (question: Question, index: number) => {
    const hasAnswer = answerProgress(question, userAnswers[question.id]) !== 'unanswered';
    return <article key={question.id} id={`question-${question.id}`} data-question-index={index} className="quiz-question-card" aria-labelledby={`question-title-${question.id}`}>
      <div className="quiz-card-top"><span className="quiz-question-number">Soal {String(index + 1).padStart(2, '0')} <span>/ {total}</span></span><span className="quiz-question-type">{questionLabels[questionType(question)]}</span></div>
      {question.topicCategory && <p className="quiz-question-category">{question.topicCategory}</p>}
      <h2 id={`question-title-${question.id}`} ref={sequential ? questionHeading : undefined} tabIndex={-1} className="quiz-question-title">{question.question}</h2>
      <fieldset disabled={!canInteract} className="quiz-answer-fieldset"><QuestionInput disabled={!canInteract} seed={attempt.current} question={question} value={userAnswers[question.id]} onChange={answer => choose(question.id, answer)} /></fieldset>
      <div className="quiz-card-statusbar">
        <span role="status" className={`quiz-answer-status animate-quiz-status ${statusClass(index)}`} key={statusClass(index)}><i />{statusLabel(index)}</span>
        <div className="quiz-card-actions">
          {hasAnswer && <button type="button" className="quiz-reset-button" disabled={!canInteract} onClick={() => choose(question.id, emptyQuestionAnswer(question, attempt.current))}>Reset jawaban</button>}
          <button type="button" disabled={!canInteract} onClick={() => toggleBookmark(question.id)} aria-pressed={bookmarks.has(question.id)} className={`quiz-flag-button ${bookmarks.has(question.id) ? 'is-flagged' : ''}`}><Bookmark size={15} /><span>{bookmarks.has(question.id) ? 'Ragu-ragu' : 'Tandai ragu'}</span></button>
        </div>
      </div>
    </article>;
  };

  return <div className={`quiz-exam ${sequential ? 'quiz-sequential' : 'quiz-free'}`}>
    <div className="quiz-exam-content" inert={isMobileDrawerOpen || showSubmitConfirm || showQuitConfirm}>
      <header className="quiz-exam-header">
        <div className="quiz-header-inner">
          <div className="quiz-header-title"><span className="quiz-header-eyebrow">Sesi kuis <span>· {total} soal</span></span><h1>{quiz.title}</h1></div>
          <div className="quiz-header-actions">
            <div className={`quiz-timer ${critical ? 'is-critical' : warning ? 'is-warning' : ''}`} role="timer" aria-label={unlimited ? 'Tanpa batas waktu' : `${sequential ? 'Sisa waktu soal' : 'Sisa waktu total'} ${clockText}`}>
              {unlimited ? <InfinityIcon size={18} /> : <Clock size={18} />}
              <div><span>{unlimited ? 'Tanpa batas' : sequential ? 'Waktu soal' : 'Waktu total'}</span>{!unlimited && <strong>{clockText}</strong>}</div>
            </div>
            <span className="quiz-header-divider" />
            <button type="button" className="quiz-icon-button quiz-export" title="Ekspor jawaban" aria-label="Ekspor jawaban" disabled={!hydrated} onClick={() => exportJSON('quizmind-draft.json', snapshot())}><Download size={18} /></button>
            <button type="button" className="quiz-exit-button" aria-label="Keluar sesi" disabled={isSubmitting} onClick={() => setShowQuitConfirm(true)}><LogOut size={17} /><span>Keluar sesi</span></button>
          </div>
        </div>
        <div className="quiz-edge-progress" role="progressbar" aria-label="Progres pengerjaan" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent} aria-valuetext={`${answered} terjawab, ${partial} sebagian terjawab dari ${total} soal`}><div className="quiz-edge-progress-fill" style={{ width: `${progressPercent}%` }} /></div>
      </header>
      <main className="quiz-exam-main">
        {notice && <div className="quiz-session-notice" role="status">{notice}</div>}
        <div className="quiz-workspace">
          <div ref={questionPresentation} className="quiz-question-column">
            <div className="quiz-section-heading"><span>{sequential ? `Soal ${currentIndex + 1} dari ${total}` : 'Pertanyaan kuis'}</span><span>{answered} / {total} terjawab</span></div>
            {sequential ? renderQuestion(quiz.questions[currentIndex], currentIndex) : quiz.questions.map(renderQuestion)}
            {sequential && <div className="quiz-desktop-controls">
              <button type="button" className="quiz-secondary-button" disabled={!canInteract || currentIndex === 0 || !canReviewSequential} onClick={() => navigateTo(currentIndex - 1)} title={!canReviewSequential ? 'Jawaban sebelumnya dikunci pada sesi dengan waktu per soal' : undefined}><ChevronLeft size={17} />Sebelumnya</button>
              <span>{currentIndex + 1} / {total}</span>
              {currentIndex < total - 1 ? <button type="button" className="quiz-primary-button" disabled={!canInteract} onClick={nextQuestion}>Berikutnya<ChevronRight size={17} /></button> : submitButton()}
            </div>}
          </div>
          <aside className="quiz-sidebar" aria-label="Navigasi soal">
            <div className="quiz-navigation-card"><div className="quiz-navigation-heading"><h2>Navigasi soal</h2><span>{total} soal</span></div>
              {palette()}{legend()}
              {sequential && !canReviewSequential && <p className="quiz-navigation-help"><LockKeyhole size={13} />Jawaban dikunci setelah beralih soal.</p>}
              {submitButton()}
            </div>
            <p className="quiz-sidebar-note"><Check size={14} />Progres tersimpan otomatis</p>
          </aside>
        </div>
      </main>
      <nav className="quiz-mobile-bar" aria-label="Aksi sesi kuis">
        <button type="button" className="quiz-mobile-navigation" aria-haspopup="dialog" aria-expanded={isMobileDrawerOpen} aria-controls="quiz-navigation-drawer" onClick={() => setIsMobileDrawerOpen(true)}><span className="quiz-nav-grid-icon" aria-hidden="true"><i /><i /><i /><i /></span><span>Navigasi <strong>{answered}/{total}</strong></span></button>
        {sequential && <div className="quiz-mobile-step"><button type="button" className="quiz-icon-button" disabled={!canInteract || currentIndex === 0 || !canReviewSequential} aria-label="Soal sebelumnya" onClick={() => navigateTo(currentIndex - 1)}><ChevronLeft size={19} /></button><button type="button" className="quiz-icon-button" disabled={!canInteract || currentIndex >= total - 1} aria-label="Soal berikutnya" onClick={nextQuestion}><ChevronRight size={19} /></button></div>}
        {submitButton()}
      </nav>
    </div>
    {isMobileDrawerOpen && <div className="quiz-drawer-backdrop" onClick={event => { if (event.target === event.currentTarget) dismissDrawer(); }}>
      <div id="quiz-navigation-drawer" ref={drawerRef} className="quiz-navigation-drawer animate-quiz-drawer" role="dialog" aria-modal="true" aria-labelledby="quiz-drawer-title">
        <div className="quiz-drawer-handle" />
        <div className="quiz-navigation-heading"><div><h2 id="quiz-drawer-title">Navigasi soal</h2><p>Soal {currentIndex + 1} dari {total} · {progressPercent}% selesai</p></div><button type="button" className="quiz-icon-button" aria-label="Tutup navigasi" onClick={dismissDrawer}><X size={20} /></button></div>
        {palette()}{legend()}
        {sequential && !canReviewSequential && <p className="quiz-navigation-help"><LockKeyhole size={13} />Jawaban dikunci setelah beralih soal.</p>}
        {submitButton()}
      </div>
    </div>}
    <ConfirmModal isOpen={showSubmitConfirm} title="Kumpulkan kuis sekarang?"
      message={`${answered} dari ${total} soal terjawab lengkap. ${partial ? `${partial} soal sebagian terjawab. ` : ''}${unanswered ? `${unanswered} soal belum dijawab. ` : ''}${bookmarks.size ? `${bookmarks.size} soal ditandai ragu-ragu. ` : ''}Kumpulkan untuk melihat hasil dan pembahasan.`}
      confirmLabel="Ya, kumpulkan kuis" cancelLabel="Tinjau kembali"
      onConfirm={() => { setShowSubmitConfirm(false); if (!tick()) finish(); }} onCancel={() => setShowSubmitConfirm(false)} />
    <ConfirmModal isOpen={showQuitConfirm} title="Keluar dari sesi?" message="Progres yang tersimpan dapat dilanjutkan melalui riwayat. Ekspor jawaban bila penyimpanan perangkat bermasalah."
      confirmLabel="Keluar sesi" cancelLabel="Lanjut mengerjakan" isDestructive
      onConfirm={() => { save(); submitted.current = true; setShowQuitConfirm(false); onQuit(); }} onCancel={() => setShowQuitConfirm(false)} />
  </div>;
};
