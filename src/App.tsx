import { loadHistory, saveHistoryItems, deleteDraft, readData, exportJSON, type HistoryItem } from './quizStorage.js';
import { buildResult } from './scoring.js';
import { connectionSettings } from './api.js';
import { loadEvaluationPreferences, normalizeEvaluationSettings } from './evaluationSettings.js';
import type { QuestionEvaluation } from './types/quiz.js';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { fetchApi, setPersonalApiKey, standalonePages, keyRevision, subscribeKeys, hasSessionKeys, logoutCloud, isCloudActive, safeError, cloudApi, activateCollection, lockKeys } from './api.js';
import { Quiz, QuizConfig, QuizSubmission, QuizResult } from './types/quiz.js';
import { TopBar } from './components/TopBar.js';
import { QuizCreator } from './components/QuizCreator.js';
import { GenerationLoader } from './components/GenerationLoader.js';
import { QuizRunner } from './components/QuizRunner.js';
import { QuizResults } from './components/QuizResults.js';
import { QuizHistoryView } from './components/QuizHistoryView.js';
import { SecurityGuideModal } from './components/SecurityGuideModal.js';
import { AIConnectionsModal } from './components/AIConnectionsModal.js';
import { DEFAULT_MODEL, AIModel, type AIProvider } from './models.js';
import { VAULT_STORAGE_KEY } from './personalKeyVault.js';
import { MULTI_VAULT_KEY } from './multiKeyVault.js';
import { CLIENT_STORAGE_KEY, hasStoredClientKeys, loadStoredClientKeys } from './clientKeyStorage.js';

const STORAGE_KEY = 'quizmind_ai_history_v1';

export default function App() {
  const keysRevision = useSyncExternalStore(subscribeKeys, keyRevision);
  const evaluationController=useRef<AbortController|null>(null);
  const [isEvaluating,setIsEvaluating]=useState(false);
  const [runnerKey,setRunnerKey]=useState<string>();
  const requestController = useRef<AbortController | null>(null);
  const [keyMessage,setKeyMessage] = useState('');
  useEffect(() => {
    const notice = (event: Event) => setKeyMessage((event as CustomEvent<string>).detail);
    window.addEventListener('key-notice',notice);
    return () => { window.removeEventListener('key-notice',notice); requestController.current?.abort(); evaluationController.current?.abort(); };
  }, []);
  const [activeView, setActiveView] = useState<'creator' | 'runner' | 'results' | 'history'>('creator');
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null);
  const [currentResult, setCurrentResult] = useState<QuizResult | null>(null);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [activeView]);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingTopic, setLoadingTopic] = useState('');
  const [loadingGrounding, setLoadingGrounding] = useState(true);
  const [loadingModel, setLoadingModel] = useState<AIModel>(DEFAULT_MODEL);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState(() => (hasStoredClientKeys() ? '__pool__' : ''));
  const personalMode = standalonePages || Boolean(apiKey.trim());
  const handleApiKeyChange = useCallback((value: string) => {
    setPersonalApiKey(value);
    setApiKey(value);
    setErrorMessage(null);
  }, []);
  useEffect(() => { if (apiKey === '__cloud__' && !isCloudActive()) setApiKey(hasStoredClientKeys() ? '__pool__' : ''); }, [keysRevision, apiKey]);

  // Sync client storage and legacy vaults across tabs
  useEffect(() => {
    const syncVault = (event: StorageEvent) => {
      if (event.key === CLIENT_STORAGE_KEY) {
        if (event.newValue) {
          const loaded = loadStoredClientKeys();
          if (loaded && loaded.keys.length > 0) {
            activateCollection(loaded, false);
            setApiKey('__pool__');
            setErrorMessage(null);
            return;
          }
        }
        lockKeys(false);
        setApiKey('');
        return;
      }
      if (event.key === VAULT_STORAGE_KEY || event.key === MULTI_VAULT_KEY || event.key === null) {
        if (!hasStoredClientKeys()) handleApiKeyChange('');
      }
    };
    window.addEventListener('storage', syncVault);
    return () => window.removeEventListener('storage', syncVault);
  }, [handleApiKeyChange]);

  // Expire plaintext using a deadline only for cloud/temporary sessions (persisted client keys do not expire)
  useEffect(() => {
    if (!apiKey) return;
    if (!isCloudActive() && hasStoredClientKeys()) {
      const onUnload = () => { requestController.current?.abort(); };
      window.addEventListener('pagehide', onUnload);
      return () => window.removeEventListener('pagehide', onUnload);
    }
    let timer: ReturnType<typeof setTimeout>;
    let deadline = 0;
    let lastPing = 0;
    const lock = () => { requestController.current?.abort(); if (isCloudActive()) void logoutCloud().catch(() => {}); handleApiKeyChange(''); };
    const reset = () => {
      if (deadline && Date.now() >= deadline) { lock(); return; }
      clearTimeout(timer);
      deadline = Date.now() + 15 * 60 * 1000;
      timer = setTimeout(lock, 15 * 60 * 1000);
      if (isCloudActive() && Date.now() - lastPing > 60_000) {
        lastPing = Date.now();
        void cloudApi('session').catch(lock);
      }
    };
    const check = () => { if (Date.now() >= deadline) lock(); };
    reset();
    window.addEventListener('pointerdown', reset);
    window.addEventListener('keydown', reset);
    window.addEventListener('focus', check);
    window.addEventListener('pagehide', lock);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('keydown', reset);
      window.removeEventListener('focus', check);
      window.removeEventListener('pagehide', lock);
      document.removeEventListener('visibilitychange', check);
    };
  }, [apiKey, handleApiKeyChange]);

  const [historyItems,setHistoryItems]=useState<HistoryItem[]>([]);
  const historyRef=useRef(historyItems);historyRef.current=historyItems;
  const visibleResult=useRef(currentResult);visibleResult.current=currentResult;

  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [connectionsOpen,setConnectionsOpen] = useState(false);
  const [connectionsSection,setConnectionsSection]=useState<'overview'|'models'|'evaluation'>('overview');
  const openEvaluation=()=>{setConnectionsSection('evaluation');setConnectionsOpen(true);};
  const [historyRecovery,setHistoryRecovery]=useState(false);
  const [serverSecurity, setServerSecurity] = useState({
    hasApiKey: false,
    providers: [] as AIProvider[],
    maskedKey: 'Memuat...',
  });

  useEffect(()=>{let mounted=true;loadHistory().then(items=>{if(mounted){setHistoryItems(old=>[...old,...items.filter(i=>!old.some(v=>v.quiz.id===i.quiz.id))]);}}).catch(()=>{if(mounted){setHistoryRecovery(true);setKeyMessage('Riwayat belum dapat dibaca. Data asli dipertahankan; ekspor data sebelum menghapus penyimpanan.');}});return()=>{mounted=false;};},[]);
  const saveHistory=(items:HistoryItem[])=>{historyRef.current=items;setHistoryItems(items);void saveHistoryItems(items).catch(()=>setKeyMessage('Data belum tersimpan pada perangkat. Gunakan Ekspor jawaban & hasil sebelum menutup halaman.'));};
  const storeResult=(result:QuizResult)=>{
    const id=result.submission.attemptId??result.submission.completedAt;
    const next=historyRef.current.map(item=>item.quiz.id===result.quiz.id?{...item,lastResult:result,results:[...(item.results??(item.lastResult?[item.lastResult]:[])).filter(r=>(r.submission.attemptId??r.submission.completedAt)!==id),result],savedAt:new Date().toISOString()}:item);
    saveHistory(next);
    if((visibleResult.current?.submission.attemptId??visibleResult.current?.submission.completedAt)===id){visibleResult.current=result;setCurrentResult(result);}
  };
  // Fetch server health & security status
  useEffect(() => {
    fetchApi('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (data.security) {
          setServerSecurity({
            hasApiKey: Boolean(data.security.hasApiKey),
            providers: data.security.providers || [],
            maskedKey: data.security.maskedKey || 'Tidak terdeteksi',
          });
        }
      })
      .catch((err) => {
        console.warn('Gagal menghubungi /api/health:', err);
      });
  }, [apiKey, keysRevision]);

  // Handle Quiz Generation
  const handleGenerateQuiz = async (config: QuizConfig) => {
    if (requestController.current) return;
    const controller = new AbortController();
    requestController.current = controller;
    setKeyMessage('');
    setLoadingModel(config.model ?? DEFAULT_MODEL);
    setIsLoading(true);
    setLoadingTopic(config.topic);
    setLoadingGrounding(config.enableGrounding);
    setErrorMessage(null);

    try {
      const response = await fetchApi('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {

        throw new Error(
          response.status === 404
            ? 'Endpoint API tidak ditemukan (404). Server backend sedang sinkronisasi, silakan ulangi.'
            : `Respons server bukan format JSON valid (${response.status}). Silakan coba kembali.`
        );
      }

      const data = await response.json();
      if (data.notices?.length) setKeyMessage(data.notices.join(' '));

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Gagal memproses kuis dengan penyedia AI yang dipilih.');
      }

      const generatedQuiz: Quiz = data.quiz;
      setRunnerKey(crypto.randomUUID());
      setCurrentQuiz(generatedQuiz);
      setCurrentResult(null);

      // Simpan ke riwayat kuis
      const updatedHistory = [
        {
          quiz: generatedQuiz,
          savedAt: new Date().toISOString(),
        },
        ...historyItems.filter((item) => item.quiz.id !== generatedQuiz.id),
      ];
      saveHistory(updatedHistory);

      // Pindah ke tampilan runner kuis
      setActiveView('runner');
    } catch (err: any) {
      setErrorMessage(err?.name === 'AbortError' ? 'Pembuatan kuis dibatalkan. Pengaturan Anda tetap tersedia.' : safeError(err));
    } finally {
      setIsLoading(false);
      requestController.current = null;
    }
  };

  const runEvaluation=async(base:QuizResult,targets?:string[],useCurrent=false)=>{
    if(evaluationController.current)return;
    const controller=new AbortController();evaluationController.current=controller;setIsEvaluating(true);setKeyMessage('');
    const settings=targets||useCurrent?normalizeEvaluationSettings(connectionSettings().evaluation??loadEvaluationPreferences()):base.evaluationSettings??normalizeEvaluationSettings(connectionSettings().evaluation??loadEvaluationPreferences());
    let evaluations={...(base.evaluations??buildResult(base.quiz,base.submission,undefined,settings).evaluations!)};
    const ids=targets??base.quiz.questions.filter(q=>['pending','failed','cancelled','evaluating'].includes(evaluations[q.id]?.status)).map(q=>q.id);
    if(JSON.stringify(settings)!==JSON.stringify(base.evaluationSettings))for(const id of ids)evaluations[id]={...evaluations[id],status:'pending',earnedPoints:null,attemptCount:0};
    if(targets)for(const id of targets)if(evaluations[id]?.status==='graded'||evaluations[id]?.status==='needs_review')evaluations[id]={...evaluations[id],status:'pending',earnedPoints:null,attemptCount:0};
    const snapshot={...base,evaluationSettings:settings};
    try{
      if(!settings.enabled){setKeyMessage('Aktifkan Evaluasi AI atau gunakan penilaian manual.');return;}
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(600000)]);
      // One question per request checkpoints every answer and remains compatible with short-lived runtimes.
      for(const id of ids){
        if((evaluations[id]?.attemptCount??0)>=3){setKeyMessage('Batas tiga percobaan tercapai. Ubah pengaturan evaluator atau tinjau jawaban secara manual.');continue;}
        signal.throwIfAborted();const prior=evaluations[id];evaluations[id]={...evaluations[id],status:'evaluating'};
        storeResult({...buildResult(base.quiz,base.submission,evaluations,settings),status:'evaluating'});
        try{
          const response=await fetchApi('/api/evaluate-quiz',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({quiz:base.quiz,submission:base.submission,settings,targetQuestionIds:[id],previous:{[id]:evaluations[id]}}),signal});
          const data=await response.json();signal.throwIfAborted();if(!response.ok||!data.success||!data.evaluations?.[id])throw new Error(data.error??'Evaluator belum menghasilkan nilai.');
          const {previous,...oldEvaluation}=prior;
          evaluations[id]={...data.evaluations[id],previous:[...(previous??[]),oldEvaluation]};
        }catch(error:any){if(signal.aborted)throw error;evaluations[id]={...evaluations[id],status:'failed',earnedPoints:null,feedback:safeError(error),errorCode:error?.code??'EVALUATION_FAILED'};}
        storeResult(buildResult(base.quiz,base.submission,evaluations,settings));
      }
    }catch(error:any){for(const id of ids)if(evaluations[id]?.status==='evaluating'||evaluations[id]?.status==='pending')evaluations[id]={...evaluations[id],status:'cancelled',earnedPoints:null,feedback:'Evaluasi dihentikan; jawaban tersimpan.'};storeResult(buildResult(base.quiz,base.submission,evaluations,settings));setKeyMessage(error?.name==='TimeoutError'?'Batas waktu evaluasi tercapai. Jawaban tetap tersimpan.':'Evaluasi dihentikan. Jawaban tetap tersimpan.');}
    finally{setIsEvaluating(false);evaluationController.current=null;}
  };
  const handleSubmitQuiz=(submission:QuizSubmission)=>{
    if(!currentQuiz)return;
    const existing=historyRef.current.find(item=>item.quiz.id===currentQuiz.id);
    const previous=(existing?.results??(existing?.lastResult?[existing.lastResult]:[])).find(r=>submission.attemptId&&(r.submission.attemptId===submission.attemptId));
    if(previous){visibleResult.current=previous;setCurrentResult(previous);setActiveView('results');return;}
    const settings=normalizeEvaluationSettings(currentQuiz.evaluationSettings??connectionSettings().evaluation??loadEvaluationPreferences());
    const result=buildResult(currentQuiz,submission,undefined,settings);
    visibleResult.current=result;setCurrentResult(result);storeResult(result);setActiveView('results');
    if(result.pendingCount&&settings.enabled)void runEvaluation(result);
  };
  const handleManualReview=(id:string,points:number,reason:string)=>{
    if(!currentResult||isEvaluating||!Number.isFinite(points)||!reason.trim())return;
    const evaluations={...(currentResult.evaluations??buildResult(currentResult.quiz,currentResult.submission).evaluations!)};const old=evaluations[id];if(!old||points<0||points>old.maxPoints)return;
    const {previous,...snapshot}=old;
    evaluations[id]={...old,status:'graded',method:'manual',feedback:'Nilai ditetapkan setelah tinjauan manual.',earnedPoints:points,manualReason:reason,evaluatedAt:new Date().toISOString(),previous:[...(previous??[]),snapshot],revision:(old.revision??0)+1};
    storeResult(buildResult(currentResult.quiz,currentResult.submission,evaluations,currentResult.evaluationSettings));
  };

  // Retake current quiz
  const handleRetakeQuiz = () => {
    if (currentQuiz) {
      evaluationController.current?.abort(); setRunnerKey(crypto.randomUUID());
      setCurrentResult(null);
      setActiveView('runner');
    }
  };

  // Start fresh quiz
  const handleNewQuiz = () => {
    evaluationController.current?.abort();
    setCurrentQuiz(null);
    setCurrentResult(null);
    setErrorMessage(null);
    setActiveView('creator');
  };

  // Select quiz from history
  const handleSelectHistoryQuiz = (quiz: Quiz) => {
    setRunnerKey(undefined);
    setCurrentQuiz(quiz);
    setCurrentResult(null);
    setActiveView('runner');
  };

  // Delete single history item
  const handleDeleteHistoryItem = (quizId: string) => {
    const updated = historyItems.filter((item) => item.quiz.id !== quizId);
    saveHistory(updated);
    void deleteDraft(quizId).catch(()=>setKeyMessage('Draft belum berhasil dihapus dari perangkat.'));
  };

  // Clear all history
  const handleClearAllHistory = () => {
    for(const item of historyItems)void deleteDraft(item.quiz.id).catch(()=>setKeyMessage('Sebagian draft belum berhasil dihapus dari perangkat.'));
    saveHistory([]);
  };

  return (
    <div className="app-frame min-h-screen text-slate-900 flex flex-col font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* TopBar 3-zone standard navigation */}
      <TopBar
        activeView={activeView}
        isBusy={isLoading || isEvaluating}
        onNavigate={(view) => setActiveView(view)}
        onOpenSecurityModal={() => setIsSecurityModalOpen(true)}
        onOpenConnections={() => {setConnectionsSection('overview');setConnectionsOpen(true);}}
        isKeyConfigured={hasSessionKeys() || (!apiKey && !standalonePages && serverSecurity.hasApiKey)}
        onNewQuizClick={handleNewQuiz}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full" aria-busy={isLoading}>
        {keyMessage && <p className="key-notice" role="status">{keyMessage}</p>}
        {historyRecovery&&<button type="button" className="topic-chip" onClick={()=>void readData('history-recovery').then(data=>exportJSON('quizmind-riwayat-pemulihan.json',data??localStorage.getItem(STORAGE_KEY))).catch(()=>exportJSON('quizmind-riwayat-pemulihan.json',localStorage.getItem(STORAGE_KEY)))}>Ekspor salinan asli riwayat</button>}
        {isLoading && (
          <div><GenerationLoader
            topic={loadingTopic}
            enableGrounding={loadingGrounding}
            model={loadingModel}
          /><div className="generation-cancel"><button type="button" className="topic-chip" onClick={() => requestController.current?.abort()}>Batalkan pembuatan kuis</button><p className="field-help">Permintaan yang sudah diterima penyedia AI dapat tetap memakai kuota.</p></div></div>
        )}
        {activeView === 'creator' ? (
          <div hidden={isLoading}>
          <QuizCreator
            onGenerate={handleGenerateQuiz}
            isLoading={isLoading}
            errorMessage={errorMessage}
            apiKey={apiKey}
            onApiKeyChange={handleApiKeyChange}
            requiresApiKey={standalonePages} onOpenEvaluation={openEvaluation}
            onOpenConnections={(section='overview') => {setConnectionsSection(section);setConnectionsOpen(true);}}
            serverProviders={serverSecurity.providers}
          />
          </div>
        ) : activeView === 'runner' && currentQuiz ? (
          <QuizRunner
            quiz={currentQuiz}
            key={runnerKey??currentQuiz.id} attemptKey={runnerKey}
            onSubmit={handleSubmitQuiz}
            onQuit={handleNewQuiz}
          />
        ) : activeView === 'results' && currentResult ? (
          <QuizResults
            result={currentResult} isEvaluating={isEvaluating} onEvaluate={ids=>void runEvaluation(currentResult,ids,true)} onCancelEvaluation={()=>evaluationController.current?.abort()} onOpenConnections={openEvaluation} onReview={handleManualReview}
            onRetake={handleRetakeQuiz}
            onNewQuiz={handleNewQuiz}
          />
        ) : activeView === 'history' ? (
          <QuizHistoryView
            historyItems={historyItems}
            onSelectQuiz={handleSelectHistoryQuiz} onViewResult={result=>{setCurrentQuiz(result.quiz);setCurrentResult(result);setActiveView('results');}}
            onClearHistory={handleClearAllHistory}
            onDeleteItem={handleDeleteHistoryItem}
            onNewQuiz={handleNewQuiz}
          />
        ) : (
          <div className="py-20 text-center">
            <p className="text-slate-500 text-sm">Tidak ada kuis yang sedang aktif.</p>
            <button
              onClick={handleNewQuiz}
              className="mt-3 text-blue-600 font-semibold text-sm hover:underline cursor-pointer"
            >
              Mulai Buat Kuis
            </button>
          </div>
        )}
      </main>

      {/* Subtle modern footer */}
      <footer className="w-full border-t border-slate-200/80 py-6 px-4 bg-white text-xs text-slate-500 text-center print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">QuizMind AI</span>
            <span>·</span>
            <span>Belajar dengan rasa ingin tahu.</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSecurityModalOpen(true)}
              className="hover:text-slate-800 transition-colors cursor-pointer"
            >
              Privasi API Key
            </button>
            <span>·</span>
            <span>{personalMode ? 'Vault pribadi · key aktif di memori' : 'Privasi terjaga'}</span>
          </div>
        </div>
      </footer>

      {/* Security Guide Modal */}
      <AIConnectionsModal initialSection={connectionsSection} open={connectionsOpen} onClose={() => setConnectionsOpen(false)} apiKey={apiKey} onApiKeyChange={handleApiKeyChange} serverProviders={serverSecurity.providers}/>
      <SecurityGuideModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
        maskedKey={serverSecurity.maskedKey}
        personalMode={personalMode}
      />
    </div>
  );
}
