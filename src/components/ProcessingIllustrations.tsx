import { Check, FileText, ListChecks, ScanLine, Sparkles } from 'lucide-react';

function ProcessingScene({ evaluation = false, className = '' }: { evaluation?: boolean; className?: string }) {
  return <div className={`processing-scene-wrap ${evaluation ? 'scene-evaluation' : 'scene-generation'} ${className}`} aria-hidden="true">
    <div className="processing-scene-glow" />
    <div className="processing-pedestal" />
    <div className="processing-ground-shadow" />
    <div className="processing-scene">
      <div className="processing-orbit"><span /></div>
      <div className="processing-sheet sheet-far"><FileText size={23} strokeWidth={1.4} /><i /><i /><i /><i /></div>
      <div className="processing-sheet sheet-near"><span className="sheet-heading" /><i /><i /><i /></div>
      <div className="processing-object">
        <div className="processing-object-face">
          <span className="processing-object-symbol">{evaluation ? <ScanLine size={25} strokeWidth={1.5} /> : <ListChecks size={25} strokeWidth={1.5} />}</span>
          <span className="object-heading" /><span className="object-subheading" />
          {[0, 1, 2].map(row => <div className="processing-object-row" key={row}><span>{evaluation ? <Check size={10} strokeWidth={2.5} /> : row === 0 ? <span className="object-answer-dot" /> : null}</span><i /></div>)}
          {evaluation && <span className="processing-scan" />}
        </div>
        <span className="processing-seal">{evaluation ? <Check size={18} strokeWidth={2.2} /> : <Sparkles size={17} strokeWidth={1.8} />}</span>
      </div>
      <span className="processing-spark spark-one"><Sparkles size={17} strokeWidth={1.4} /></span>
      <span className="processing-spark spark-two" />
    </div>
  </div>;
}

export const GenerateIllustration = ({ className = '' }: { className?: string }) => <ProcessingScene className={className} />;
export const EvaluationIllustration = ({ className = '' }: { className?: string }) => <ProcessingScene evaluation className={className} />;
