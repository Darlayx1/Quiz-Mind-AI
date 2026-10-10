import type { QuizProgress } from '../workspace/types.js';
import { exportJSON, type Draft } from '../quizStorage.js';
import { validateAnswer } from '../questionState.js';
import { QuestionInput } from './QuestionInput.js';
import { answerProgress, questionLabels, questionType } from '../questionState.js';
import React, { useState, useEffect, useRef } from "react";
import { difficultyName, modelName } from "../models.js";
import { quizTimerSeconds, durationLabel } from "../quizConfig.js";
import type { Quiz, QuizSubmission, Question, StoredAnswer, AnswerValue } from "../types/quiz.js";
import { Button } from "./Button.js";
import { ConfirmModal } from "./ConfirmModal.js";
import {
  Clock,
  Bookmark,
  ChevronRight,
  Send,
  Infinity as InfinityIcon,
  LayoutGrid,
  ListOrdered,
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

export const QuizRunner: React.FC<QuizRunnerProps> = ({quiz,onSubmit,onQuit,attemptKey,initialProgress,onProgress}) => {
  const progressCallback=useRef(onProgress);progressCallback.current=onProgress;
  const readData=async<T,>(_key:string):Promise<T|undefined>=>initialProgress?.quizId===quiz.id?({...initialProgress,index:initialProgress.currentIndex,attemptId:initialProgress.attemptId??crypto.randomUUID()} as T):undefined;
  const writeData=async(_key:string,draft:Draft)=>{if(draft.submitted)return;await progressCallback.current?.({quizId:quiz.id,currentIndex:draft.index,answers:draft.answers,bookmarks:draft.bookmarks,startedAt:draft.startedAt,deadline:draft.deadline,attemptId:draft.attemptId});};
  const sequential=quiz.displayMode==='sequential',total=quiz.questions.length;
  const questionLimit=(index:number)=>sequential?(quiz.timePerQuestionByType?.[questionType(quiz.questions[index])]??quizTimerSeconds(quiz)):quizTimerSeconds(quiz);
  const [currentIndex,setCurrentIndex]=useState(0),[userAnswers,setUserAnswers]=useState<Record<string,StoredAnswer>>({}),[bookmarks,setBookmarks]=useState<Set<string>>(new Set());
  const [timeLeft,setTimeLeft]=useState(questionLimit(0)),[notice,setNotice]=useState(''),[showSubmitConfirm,setShowSubmitConfirm]=useState(false),[showQuitConfirm,setShowQuitConfirm]=useState(false),[hydrated,setHydrated]=useState(false),[readOnly,setReadOnly]=useState(false);
  const submitted=useRef(false),startedAt=useRef(Date.now()),deadline=useRef(0),indexRef=useRef(0),answersRef=useRef(userAnswers),bookmarksRef=useRef(bookmarks),submitRef=useRef(onSubmit),attempt=useRef(attemptKey??crypto.randomUUID()),ready=useRef(false),owner=useRef(false),questionHeading=useRef<HTMLHeadingElement>(null),saveTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  submitRef.current=onSubmit;
  const active=useRef(true);
  const limit=questionLimit(currentIndex),unlimited=limit===0;
  const snapshot=():Draft=>({quizId:quiz.id,attemptId:attempt.current,answers:answersRef.current,bookmarks:Array.from(bookmarksRef.current),index:indexRef.current,startedAt:startedAt.current,deadline:deadline.current});
  const save=()=>{if(!ready.current||!owner.current||submitted.current)return;clearTimeout(saveTimer.current);void writeData('draft:'+quiz.id,snapshot()).catch(()=>setNotice('Belum tersimpan pada ruang aktif. Ekspor jawaban sebelum menutup halaman.'));};
  const schedule=()=>{clearTimeout(saveTimer.current);saveTimer.current=setTimeout(save,500);};
  const finish=(finishedAt=Date.now(),reason:'manual'|'timer'='manual')=>{
    if(submitted.current||!ready.current||!owner.current)return;submitted.current=true;clearTimeout(saveTimer.current);
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
    if(navigator.locks){void navigator.locks.request(lease,{ifAvailable:true},async lock=>{if(!lock){if(mounted){setReadOnly(true);setHydrated(true);setNotice('Kuis ini sedang dikerjakan pada tab lain. Tutup sesi di tab itu lalu buka kembali.');}return;}await initialize();if(!mounted)return;await new Promise<void>(resolve=>{release=resolve;});});}
    else { void initialize(); }
    const onHide=()=>{save();release();owner.current=false;};window.addEventListener('pagehide',onHide);
    return()=>{save();mounted=false;active.current=false;ready.current=false;owner.current=false;clearInterval(heartbeat);clearTimeout(saveTimer.current);release();window.removeEventListener('pagehide',onHide);};
  },[]);
  useEffect(()=>{const timer=window.setInterval(tick,250),onVisible=()=>{if(!document.hidden)tick();};window.addEventListener('focus',tick);document.addEventListener('visibilitychange',onVisible);return()=>{clearInterval(timer);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',onVisible);};},[]);
  useEffect(()=>{if(sequential&&currentIndex>0)questionHeading.current?.focus({preventScroll:true});},[currentIndex]);
  const choose=(id:string,answer:AnswerValue)=>{if(!ready.current||!owner.current||submitted.current||tick())return;if(sequential&&id!==quiz.questions[indexRef.current].id)return;answersRef.current={...answersRef.current,[id]:answer};setUserAnswers(answersRef.current);schedule();};
  const toggleBookmark=(id:string)=>{if(!ready.current||!owner.current||submitted.current)return;const next=new Set(bookmarksRef.current);next.has(id)?next.delete(id):next.add(id);bookmarksRef.current=next;setBookmarks(next);save();};
  const advance=()=>{if(!ready.current||!owner.current||submitted.current||tick())return;if(indexRef.current>=total-1){setShowSubmitConfirm(true);return;}indexRef.current++;deadline.current=questionLimit(indexRef.current)?Date.now()+questionLimit(indexRef.current)*1000:0;setCurrentIndex(indexRef.current);setTimeLeft(questionLimit(indexRef.current));setNotice('');save();};
  const jumpTo=(index:number)=>{if(sequential)return;setCurrentIndex(index);document.getElementById('question-'+quiz.questions[index].id)?.scrollIntoView({block:'start',behavior:'smooth'});};
  const answered=quiz.questions.filter(q=>answerProgress(q,userAnswers[q.id])==='complete').length,partial=quiz.questions.filter(q=>answerProgress(q,userAnswers[q.id])==='partial').length,unanswered=total-answered-partial;
  const critical=!unlimited&&timeLeft<=(sequential?Math.min(15,limit/4):60),clockText=String(Math.floor(timeLeft/60)).padStart(2,'0')+':'+String(timeLeft%60).padStart(2,'0');
  const renderQuestion = (question: Question, index: number) => (
    <article
      key={question.id}
      id={`question-${question.id}`}
      className="surface question-stage section-pad"
    >
      <div className="question-card-heading">
        <span className="question-counter">
          SOAL {String(index + 1).padStart(2, "0")} <span>/ {total}</span>
        </span>
        <button
          type="button"
          onClick={() => toggleBookmark(question.id)}
          aria-pressed={bookmarks.has(question.id)}
          className={`bookmark-button ${bookmarks.has(question.id) ? "is-bookmarked" : ""}`}
        >
          <Bookmark size={15} />
          <span>
            {bookmarks.has(question.id) ? "Ditandai ragu" : "Tandai ragu"}
          </span>
        </button>
      </div>
      {question.topicCategory && (
        <div className="question-category">{question.topicCategory}</div>
      )}
      <h2
        ref={sequential ? questionHeading : undefined}
        tabIndex={-1}
        className="question-title"
      >
        {question.question}
      </h2>
      <p className="field-help mb-4">{questionLabels[questionType(question)]} · {question.maxPoints??1} poin</p>
      <fieldset disabled={!hydrated||readOnly}><QuestionInput seed={attempt.current} question={question} value={userAnswers[question.id]} onChange={answer=>choose(question.id,answer)}/></fieldset>
      {!sequential && answerProgress(question,userAnswers[question.id]) !== 'unanswered' && (
        <div className="answer-saved">
          <Check size={13} /> Jawaban tercatat · Anda dapat mengubahnya sebelum
          mengumpulkan.
        </div>
      )}
    </article>
  );

  return (
    <div
      className={`page-shell runner-page ${sequential ? "sequential-runner" : "free-runner"}`}
    >
      {quiz.generationWarnings?.map(message => <div key={message} className="settings-alert" role="status">{message}</div>)}
      {quiz.usedGrounding && quiz.webCheckedAt && <div className="settings-alert" role="status">Pencarian web dilakukan pada {new Date(quiz.webCheckedAt).toLocaleString('id-ID')}. Sumber tersedia pada pembahasan soal; periksa tanggal sumber untuk fakta yang dapat berubah.</div>}
      <div className="runner-heading">
        <div>
          <div className="eyebrow">
            {sequential ? <ListOrdered size={15} /> : <LayoutGrid size={15} />}{" "}
            {sequential ? "SESI SEKUENSIAL" : "SESI NON SEKUENSIAL"}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-3">
            {quiz.title}
          </h1>
          <p className="text-xs text-slate-500 mt-2">
            {difficultyName(quiz.difficulty)} · {total} soal ·{" "}
            {modelName(quiz.model)}
          </p>
        </div>
        <div className="runner-header-actions">
          <div
            className={`session-timer ${critical ? "is-critical" : ""}`}
            role="timer"
            aria-label={
              unlimited
                ? "Tanpa batas waktu"
                : `${sequential ? "Sisa waktu soal" : "Sisa waktu total"} ${clockText}`
            }
          >
            <span>
              {unlimited ? <InfinityIcon size={17} /> : <Clock size={17} />}
              {unlimited
                ? "Tanpa batas"
                : sequential
                  ? "Waktu soal"
                  : "Waktu total"}
            </span>
            {!unlimited && <strong>{clockText}</strong>}
          </div>
          <button
            onClick={() => setShowQuitConfirm(true)}
            className="exit-session"
          >
            Keluar sesi
          </button>
        </div>
      </div>
      <div className="runner-progress">
        <div>
          <span>Progres pengerjaan</span>
          <strong>
            {answered} dari {total} terjawab
          </strong>
        </div>
        <progress value={answered} max={total} aria-label="Progres jawaban" />
      </div>
      <div className="session-guidance">
        {sequential ? <ListOrdered size={17} /> : <LayoutGrid size={17} />}
        <p>
          {sequential
            ? `Jawab satu soal, lalu lanjut. Jawaban dikunci setelah Anda beralih.${unlimited ? "" : ` Setiap soal memiliki waktu ${durationLabel(limit)}.`}`
            : `Semua soal tersedia di bawah. Jawab dengan urutan bebas dan tinjau sebelum mengumpulkan.${unlimited ? "" : " Timer berlaku untuk seluruh kuis."}`}
        </p>
      </div>
      <div className="session-notice" role="status" aria-live="polite">
        {notice}
        <button type="button" className="topic-chip" onClick={()=>exportJSON('quizmind-draft.json',snapshot())}>Ekspor jawaban</button>
      </div>
      <div className="runner-layout">
        <div className="min-w-0 space-y-5">
          {sequential
            ? renderQuestion(quiz.questions[currentIndex], currentIndex)
            : quiz.questions.map(renderQuestion)}
          <div className="question-controls session-controls">
            <span className="field-help">
              {sequential
                ? `Langkah ${currentIndex + 1} dari ${total}`
                : `${unanswered === 0 ? "Semua soal sudah terjawab." : `${unanswered} soal belum dijawab.`}`}
            </span>
            {sequential && currentIndex < total - 1 ? (
              <Button
                label={
                  answerProgress(quiz.questions[currentIndex],userAnswers[quiz.questions[currentIndex].id])==='unanswered'
                    ? "Lewati soal"
                    : "Simpan & lanjut"
                }
                icon={<ChevronRight size={17} />}
                iconPosition="trailing"
                onClick={advance}
              />
            ) : (
              <Button
                label="Kumpulkan kuis"
                icon={<Send size={17} />}
                iconPosition="trailing"
                onClick={() => {
                  if (!tick()) setShowSubmitConfirm(true);
                }}
              />
            )}
          </div>
        </div>
        <aside className="runner-sidebar">
          <div className="surface section-pad">
            <div className="sidebar-heading">
              <strong>{sequential ? "Peta progres" : "Navigasi soal"}</strong>
              <span>{total} soal</span>
            </div>
            <div className="question-palette">
              {quiz.questions.map((question, index) => (
                <button
                  key={question.id}
                  type="button"
                  disabled={sequential}
                  onClick={() => jumpTo(index)}
                  aria-label={`Soal ${index + 1}, ${answerProgress(question,userAnswers[question.id])==='partial'?"sebagian terjawab":answerProgress(question,userAnswers[question.id])==='complete'?"terjawab":"belum dijawab"}${bookmarks.has(question.id) ? ", ditandai ragu" : ""}${sequential && index < currentIndex ? ", dikunci" : ""}`}
                  aria-current={index === currentIndex ? "step" : undefined}
                  className={`palette-item ${answerProgress(question,userAnswers[question.id])==='complete'?"answered":answerProgress(question,userAnswers[question.id])==='partial'?"partial":""} ${bookmarks.has(question.id) ? "bookmarked" : ""} ${index === currentIndex ? "current" : ""}`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
            <div className="palette-legend"><span>Sebagian terjawab <strong>{partial}</strong></span>
              <span>
                <i className="legend-answered" />
                Terjawab <strong>{answered}</strong>
              </span>
              <span>
                <i className="legend-bookmarked" />
                Ragu-ragu <strong>{bookmarks.size}</strong>
              </span>
              <span>
                <i />
                Belum dijawab <strong>{unanswered}</strong>
              </span>
            </div>
            {sequential && (
              <p className="field-help mt-4">
                Peta ini menunjukkan progres. Soal dikerjakan berurutan dan
                tidak dapat dikunjungi kembali.
              </p>
            )}
            <div className="sidebar-submit">
              <Button
                label="Selesaikan sesi"
                variant="secondary"
                className="w-full"
                icon={<ArrowRight size={16} />}
                iconPosition="trailing"
                onClick={() => {
                  if (!tick()) setShowSubmitConfirm(true);
                }}
              />
            </div>
          </div>
        </aside>
      </div>
      <ConfirmModal
        isOpen={showSubmitConfirm}
        title="Selesaikan sesi belajar?"
        message={`Anda telah menjawab lengkap ${answered} dari ${total} soal; ${partial} jawaban parsial. ${unanswered > 0 ? `${unanswered} soal belum dijawab dan akan dihitung tanpa jawaban.` : "Semua soal sudah terjawab."} Kumpulkan untuk melihat hasil dan pembahasan.`}
        confirmLabel="Kumpulkan & lihat hasil"
        cancelLabel="Lanjut mengerjakan"
        onConfirm={() => {
          setShowSubmitConfirm(false);
          if (!tick()) finish();
        }}
        onCancel={() => setShowSubmitConfirm(false)}
      />
      <ConfirmModal
        isOpen={showQuitConfirm}
        title="Keluar dari sesi?"
        message="Progres yang tersimpan dapat dilanjutkan melalui riwayat. Ekspor jawaban bila penyimpanan perangkat bermasalah."
        confirmLabel="Keluar sesi"
        cancelLabel="Lanjut mengerjakan"
        isDestructive
        onConfirm={() => {
          save();
          submitted.current = true;
          setShowQuitConfirm(false);
          onQuit();
        }}
        onCancel={() => setShowQuitConfirm(false)}
      />
    </div>
  );
};
