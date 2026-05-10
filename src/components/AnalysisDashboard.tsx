import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import {
  Shield,
  FileText,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Calendar,
  Clock,
  AlertCircle,
  Lock,
  MessageSquare,
  Send,
  RefreshCcw,
  Receipt,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, cleanExportText, isContractValueMissing } from '../lib/utils';
import { ContractAnalysis, FileData } from '../types';
import { askContract } from '../services/api';

interface AnalysisDashboardProps {
  analysis: ContractAnalysis;
  file: FileData;
  onReset: () => void;
}

type TabType = 'RISK ALERTS' | 'CONFLICTS & WARNINGS' | 'DATA QUALITY';

function displayContractValue(raw: string | undefined): string {
  if (raw == null || !String(raw).trim()) return '—';
  if (isContractValueMissing(raw)) return 'Not found in contract';
  return String(raw).trim();
}

function AnalysisPrintReport({
  analysis,
  fileName,
}: {
  analysis: ContractAnalysis;
  fileName: string;
}) {
  const cf = analysis.contract_fields;
  const generated = new Date().toLocaleString(undefined, {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  const rec = (analysis.recommendation || '—').toString().toUpperCase();
  const conf =
    typeof analysis.confidence_score === 'number' ? `${analysis.confidence_score}%` : '—';

  return (
    <article className="analysis-print-report hidden print:block max-w-[190mm] mx-auto px-1 text-slate-900">
      <header className="print-avoid-break border-b-2 border-slate-900 pb-3 mb-4">
        <h1>Rental contract — AI analysis report</h1>
        <p className="print-meta m-0">
          <strong>Source file:</strong> {fileName || '—'}
          {' · '}
          <strong>Generated:</strong> {generated}
          {analysis.session_id ? (
            <>
              {' · '}
              <strong>Session:</strong> <span className="font-mono text-[8.5pt]">{analysis.session_id}</span>
            </>
          ) : null}
        </p>
        <p className="m-0 text-[11pt] font-bold text-slate-800">
          Overall recommendation: <span className="text-blue-800">{rec}</span>
          {' · '}
          Confidence: <span>{conf}</span>
        </p>
      </header>

      <h2>Extracted key terms</h2>
      <p className="text-[9.5pt] text-slate-600 m-0 mb-2">
        Values below are taken from the contract excerpts used for this run. Long fields are shown in full for this
        report.
      </p>
      <table className="print-table">
        <tbody>
          {[
            ['Monthly rent', displayContractValue(cf?.rent), cf?.rent_quote],
            ['Security deposit', displayContractValue(cf?.deposit), cf?.deposit_quote],
            ['Lease start', displayContractValue(cf?.start_date), cf?.start_date_quote],
            ['Lease end', displayContractValue(cf?.end_date), cf?.end_date_quote],
            ['Notice period', displayContractValue(cf?.notice_period), cf?.notice_period_quote],
            ['Renewal terms', displayContractValue(cf?.renewal_terms), cf?.renewal_terms_quote],
            ['Late payment penalty', displayContractValue(cf?.late_payment_penalties), cf?.late_payment_penalties_quote],
          ].map(([label, val, quote]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td className="whitespace-pre-wrap">
                <span>{val}</span>
                {quote && <span className="block text-[8.5pt] text-slate-500 italic mt-1">"{quote}"</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {analysis.missing_fields?.length ? (
        <p className="text-[9pt] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1 print-avoid-break">
          <strong>Missing / low-confidence fields:</strong> {analysis.missing_fields.join(', ')}
        </p>
      ) : null}

      <h2>Executive summary</h2>
      <div className="prose-print print-avoid-break border border-slate-200 rounded-md p-3 bg-slate-50/80">
        {analysis.final_summary?.trim() ? (
          <ReactMarkdown>{cleanExportText(analysis.final_summary)}</ReactMarkdown>
        ) : (
          <p className="m-0 text-slate-500">No summary was returned for this document.</p>
        )}
      </div>

      <h2>Risk alerts ({analysis.risks?.length ?? 0})</h2>
      {analysis.risks?.length ? (
        analysis.risks.map((risk, i) => (
          <div key={i} className="print-risk print-avoid-break">
            <div
              className="print-risk-sev"
              style={{
                background:
                  risk.severity?.toUpperCase() === 'HIGH'
                    ? '#fee2e2'
                    : risk.severity?.toUpperCase() === 'MEDIUM'
                      ? '#fef3c7'
                      : '#d1fae5',
                color:
                  risk.severity?.toUpperCase() === 'HIGH'
                    ? '#991b1b'
                    : risk.severity?.toUpperCase() === 'MEDIUM'
                      ? '#92400e'
                      : '#065f46',
              }}
            >
              {risk.severity || '—'} · {risk.risk_type || 'Risk'}
            </div>
            <p className="m-0 mb-1 font-bold text-slate-900 text-[10pt]">{risk.clause_reference || 'Clause'}</p>
            <div className="prose-print mb-2">
              <ReactMarkdown>{cleanExportText(risk.explanation || '')}</ReactMarkdown>
            </div>
            <p className="m-0 text-[8.5pt] font-bold uppercase tracking-wide text-slate-500">Why it matters</p>
            <div className="prose-print">
              <ReactMarkdown>{cleanExportText(risk.why_it_matters || '')}</ReactMarkdown>
            </div>
          </div>
        ))
      ) : (
        <p className="text-slate-600 m-0">No discrete risks were listed for this analysis.</p>
      )}

      <h2>Potential conflicts & warnings</h2>
      <h3 className="text-[9.5pt] font-bold text-slate-700 m-0 mb-1 mt-2">Clause conflicts</h3>
      {analysis.conflicts?.length ? (
        analysis.conflicts.map((c, i) => (
          <div key={i} className="print-risk print-avoid-break mb-3">
            <p className="m-0 mb-2 font-bold text-slate-900">Topic: {c.topic || '—'}</p>
            <table className="print-table">
              <tbody>
                <tr>
                  <th scope="row">Clause A</th>
                  <td className="whitespace-pre-wrap text-[9pt]">{c.clause_a || '—'}</td>
                </tr>
                <tr>
                  <th scope="row">Clause B</th>
                  <td className="whitespace-pre-wrap text-[9pt]">{c.clause_b || '—'}</td>
                </tr>
              </tbody>
            </table>
            <div className="prose-print mt-2">
              <ReactMarkdown>{cleanExportText(c.explanation || '')}</ReactMarkdown>
            </div>
          </div>
        ))
      ) : (
        <p className="text-slate-600 m-0 mb-3">No clause conflicts were flagged.</p>
      )}
      <h3 className="text-[9.5pt] font-bold text-slate-700 m-0 mb-1">System warnings</h3>
      {analysis.warnings?.length ? (
        <ul className="m-0 pl-5 text-[9.5pt]">
          {analysis.warnings.map((w, i) => (
            <li key={i} className="mb-1">
              {w}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-slate-600 m-0">No system warnings.</p>
      )}

      <h2>Data quality</h2>
      <table className="print-table print-avoid-break">
        <tbody>
          <tr>
            <th scope="row">OCR confidence</th>
            <td>{analysis.data_quality?.ocr_confidence ?? '—'}</td>
          </tr>
          <tr>
            <th scope="row">Extraction confidence</th>
            <td>{analysis.data_quality?.extraction_confidence ?? '—'}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-[9pt] font-bold text-slate-600 m-0 mb-1">Technical notes</p>
      {analysis.data_quality?.issues_detected?.length ? (
        <ul className="m-0 pl-5 text-[9.5pt] mb-0">
          {analysis.data_quality.issues_detected.map((issue, i) => (
            <li key={i} className="mb-1">
              {issue}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-slate-600 m-0 text-[9.5pt]">No technical issues listed.</p>
      )}

      <footer className="print-footer print-avoid-break">
        This report was produced automatically for informational purposes only. It is not legal advice. Review the
        original lease and consult a qualified attorney before signing, terminating, or relying on these findings.
      </footer>
    </article>
  );
}

export default function AnalysisDashboard({ analysis, file: _file, onReset }: AnalysisDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('RISK ALERTS');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);

  const cf = analysis.contract_fields;
  const confidenceDisplay =
    typeof analysis.confidence_score === 'number'
      ? `${analysis.confidence_score}%`
      : '—';

  const dashboardCards = [
    { label: 'Monthly Rent', value: cf?.rent, quote: cf?.rent_quote, icon: <DollarSign className="w-5 h-5" /> },
    { label: 'Security Deposit', value: cf?.deposit, quote: cf?.deposit_quote, icon: <Lock className="w-5 h-5" /> },
    { label: 'Lease Start', value: cf?.start_date, quote: cf?.start_date_quote, icon: <Calendar className="w-5 h-5" /> },
    { label: 'Lease End', value: cf?.end_date, quote: cf?.end_date_quote, icon: <Calendar className="w-5 h-5" /> },
    { label: 'Notice Period', value: cf?.notice_period, quote: cf?.notice_period_quote, icon: <Clock className="w-5 h-5" /> },
    { label: 'Renewal Terms', value: cf?.renewal_terms, quote: cf?.renewal_terms_quote, icon: <RefreshCcw className="w-5 h-5" /> },
    { label: 'Late Payment Penalty', value: cf?.late_payment_penalties, quote: cf?.late_payment_penalties_quote, icon: <Receipt className="w-5 h-5" /> },
    { label: 'Confidence', value: confidenceDisplay, quote: undefined, icon: <CheckCircle2 className="w-5 h-5" /> },
  ];

  const sendChat = async () => {
    const q = chatInput.trim();
    if (!q || !analysis.session_id) return;
    setChatInput('');
    setChatMessages((m) => [...m, { role: 'user', text: q }]);
    setChatLoading(true);
    try {
      const answer = await askContract(analysis.session_id, q);
      setChatMessages((m) => [...m, { role: 'assistant', text: answer ?? '' }]);
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'Unknown error';
      setChatMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: `Could not get an answer (${detail}). Check the backend and Ollama, then try again.`,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity.toUpperCase()) {
      case 'HIGH': return 'bg-red-600 text-white';
      case 'MEDIUM': return 'bg-amber-600 text-white';
      case 'LOW': return 'bg-emerald-600 text-white';
      default: return 'bg-slate-600 text-white';
    }
  };

  const getRiskBorder = (severity: string) => {
    switch (severity.toUpperCase()) {
      case 'HIGH': return 'border-red-100 bg-red-50';
      case 'MEDIUM': return 'border-amber-100 bg-amber-50';
      case 'LOW': return 'border-emerald-100 bg-emerald-50';
      default: return 'border-slate-100 bg-slate-50';
    }
  };

  const isLowConfidence = (analysis.confidence_score || 0) < 60 || 
    analysis.data_quality?.extraction_confidence?.toUpperCase().includes('LOW') || 
    analysis.data_quality?.ocr_confidence?.toUpperCase().includes('LOW');

  return (
    <div className="flex flex-col min-h-screen w-full bg-[#F3F4F6] font-sans text-slate-800 overflow-hidden print:bg-white print:overflow-visible">
      <div className="print:hidden flex flex-col h-screen w-full min-h-0 overflow-hidden">
      {/* Low Confidence Banner */}
      {isLowConfidence && (
        <div className="bg-amber-500 text-white py-2 px-6 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest z-50 animate-pulse">
          <AlertTriangle className="w-4 h-4" />
          Low Confidence Analysis Detected — Please Review Manually
        </div>
      )}

      {/* Top Navigation */}
      <nav className="no-print flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight text-slate-800 uppercase">Rental AI</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button 
            type="button"
            onClick={onReset}
            className="px-4 py-1.5 text-xs font-bold text-slate-500 uppercase tracking-widest border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors"
          >
            New Scan
          </button>
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            disabled={!analysis.session_id}
            title={!analysis.session_id ? 'Re-upload with the API running to enable chat' : 'Ask questions about this contract'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-45"
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            Ask AI
          </button>
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/50">
        <div className="max-w-7xl mx-auto space-y-8">
          
          {/* Section 1: Contract Snapshot */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <FileText className="w-3 h-3" /> Section 1 — Extraction Summary
              </h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
              {dashboardCards.map((card, i) => {
                const isConfidence = card.label === 'Confidence';
                const isLongTextCard = ['Notice Period', 'Renewal Terms', 'Late Payment Penalty'].includes(card.label);
                const displayValue =
                  isConfidence
                    ? card.value
                    : isContractValueMissing(card.value)
                      ? 'Not Found in Contract'
                      : String(card.value);
                const highlightMissing = !isConfidence && isContractValueMissing(card.value);
                const hasQuote = !isConfidence && card.quote && card.quote.trim().length > 0;
                return (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  key={i}
                  className={cn(
                    "bg-white p-6 rounded-2xl border shadow-sm flex flex-col",
                    highlightMissing ? "border-red-200 bg-red-50/30" : "border-slate-100"
                  )}
                >
                  <div className={cn("mb-3 w-8 h-8 rounded-lg flex items-center justify-center shrink-0", highlightMissing ? "text-red-500 bg-red-50" : "text-blue-600 bg-blue-50")}>
                    {card.icon}
                  </div>
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{card.label}</div>
                  <div
                    title={isLongTextCard && !highlightMissing && displayValue.length > 80 ? displayValue : undefined}
                    className={cn(
                      isLongTextCard ? "text-sm font-bold leading-snug line-clamp-4" : "text-lg font-black leading-tight",
                      highlightMissing ? "text-red-600" : "text-slate-900"
                    )}
                  >
                    {displayValue}
                  </div>
                  {hasQuote && (
                    <p className="mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-400 italic leading-relaxed line-clamp-2" title={card.quote}>
                      "{card.quote}"
                    </p>
                  )}
                </motion.div>
              );
              })}
            </div>
          </section>

          {/* Section: Recommendation & Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-900 text-white p-8 rounded-[2rem] shadow-xl relative overflow-hidden flex flex-col justify-center min-h-[220px]">
               <div className="relative z-10">
                 <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Final Recommendation</div>
                 <h2 className={cn(
                   "text-4xl font-black mb-4 leading-tight",
                   analysis.recommendation?.toUpperCase().includes('SAFE') ? "text-emerald-400" : 
                   analysis.recommendation?.toUpperCase().includes('CAUTION') ? "text-amber-400" : "text-red-400"
                 )}>
                   {analysis.recommendation}
                 </h2>
                 <div className="prose prose-invert prose-sm max-w-none text-slate-400 [&_h3]:text-white [&_h3]:text-sm [&_h3]:font-black [&_h3]:uppercase [&_h3]:tracking-widest [&_h3]:mt-6 [&_h3]:mb-2 [&_li]:mb-1 [&_ul]:mb-4">
                   <ReactMarkdown>{cleanExportText(analysis.final_summary || '')}</ReactMarkdown>
                 </div>
               </div>
               <div className="absolute right-0 top-0 w-64 h-64 bg-blue-600/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2" />
            </div>

            <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col justify-between">
               <div>
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 decoration-blue-500 underline decoration-2">Risk Distribution</div>
                  <div className="space-y-4">
                    {['HIGH', 'MEDIUM', 'LOW'].map(sev => {
                      const count = analysis.risks?.filter(r => r.severity === sev).length || 0;
                      return (
                        <div key={sev} className="flex items-center justify-between">
                           <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{sev}</span>
                           <div className="flex-1 mx-4 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${(count / (analysis.risks?.length || 1)) * 100}%` }}
                                className={cn(
                                  "h-full rounded-full",
                                  sev === 'HIGH' ? "bg-red-500" : sev === 'MEDIUM' ? "bg-amber-500" : "bg-emerald-500"
                                )}
                              />
                           </div>
                           <span className="text-xs font-bold text-slate-900">{count}</span>
                        </div>
                      )
                    })}
                  </div>
               </div>
               <div className="mt-8 pt-8 border-t border-slate-50 text-center">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total risks detected</span>
                  <div className="text-3xl font-black text-slate-900">{analysis.risks?.length || 0}</div>
               </div>
            </div>
          </div>

          {/* Detailed Content with Tabs */}
          <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
             <div className="flex border-b border-slate-100 overflow-x-auto scrollbar-hide">
               {(['RISK ALERTS', 'CONFLICTS & WARNINGS', 'DATA QUALITY'] as TabType[]).map((tab) => (
                 <button 
                   type="button"
                   key={tab}
                   onClick={() => setActiveTab(tab)}
                   className={cn(
                     "px-10 py-5 text-[11px] font-black tracking-widest transition-all border-b-2",
                     activeTab === tab 
                       ? "border-blue-600 text-blue-600" 
                       : "border-transparent text-slate-400 hover:text-slate-600"
                   )}
                 >
                   {tab}
                 </button>
               ))}
             </div>

             <div className="p-8">
                <AnimatePresence mode="wait">
                  {activeTab === 'RISK ALERTS' && (
                    <motion.div 
                      key="risks"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="grid grid-cols-1 md:grid-cols-2 gap-4"
                    >
                      {analysis.risks?.length ? analysis.risks.map((risk, i) => (
                        <div key={i} className={cn("p-6 rounded-2xl border transition-all hover:shadow-md", getRiskBorder(risk.severity))}>
                          <div className="flex justify-between items-start mb-4">
                            <span className={cn("text-[9px] font-black px-2 py-0.5 rounded tracking-tighter uppercase", getSeverityBadge(risk.severity))}>
                              {risk.severity} SEVERITY
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">{risk.risk_type}</span>
                          </div>
                          <h4 className="font-bold text-slate-900 text-lg mb-2">{risk.clause_reference}</h4>
                          <div className="prose prose-sm max-w-none text-slate-600 mb-6 [&_h3]:text-slate-900 [&_h3]:text-[11px] [&_h3]:font-black [&_h3]:uppercase [&_h3]:tracking-widest [&_h3]:mt-4 [&_h3]:mb-1 [&_li]:mb-0.5 [&_ul]:mb-2 leading-relaxed">
                            <ReactMarkdown>{cleanExportText(risk.explanation || '')}</ReactMarkdown>
                          </div>
                          <div className="p-4 bg-white/50 rounded-xl">
                             <div className="prose prose-sm max-w-none text-slate-500 italic [&_h3]:text-slate-800 [&_h3]:text-[11px] [&_h3]:font-black [&_h3]:uppercase [&_h3]:tracking-widest [&_h3]:not-italic [&_h3]:mt-2 [&_h3]:mb-1 [&_li]:mb-0.5 [&_ul]:mb-2">
                               <ReactMarkdown>{cleanExportText(risk.why_it_matters || '')}</ReactMarkdown>
                             </div>
                          </div>
                        </div>
                      )) : (
                        <div className="col-span-full py-20 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">No major risks identified in this agreement</p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {activeTab === 'CONFLICTS & WARNINGS' && (
                    <motion.div 
                      key="conflicts"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-8"
                    >
                      {/* Conflicts Section */}
                      <div>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <AlertTriangle className="w-3 h-3" /> Potential Clause Conflicts
                        </h4>
                        <div className="grid grid-cols-1 gap-4">
                          {analysis.conflicts?.length ? analysis.conflicts.map((conflict, i) => (
                            <div key={i} className="bg-white border-2 border-amber-100 rounded-3xl p-8 relative overflow-hidden shadow-sm">
                              <div className="relative z-10">
                                <div className="flex items-center gap-3 mb-6">
                                  <div className="bg-amber-100 text-amber-600 p-2 rounded-xl">
                                    <Shield className="w-5 h-5" />
                                  </div>
                                  <h5 className="font-black text-lg text-slate-900 uppercase">Topic: {conflict.topic}</h5>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                   <div className="space-y-2">
                                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Clause A</span>
                                      <p className="text-sm font-serif italic text-slate-600 p-4 bg-slate-50 rounded-xl">{conflict.clause_a}</p>
                                   </div>
                                   <div className="space-y-2">
                                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Clause B</span>
                                      <p className="text-sm font-serif italic text-slate-600 p-4 bg-slate-50 rounded-xl">{conflict.clause_b}</p>
                                   </div>
                                </div>
                                  <div className="prose prose-sm max-w-none text-amber-800 font-medium [&_h3]:text-amber-900 [&_h3]:text-[11px] [&_h3]:font-black [&_h3]:uppercase [&_h3]:tracking-widest [&_h3]:mt-4 [&_h3]:mb-1 [&_li]:mb-0.5 [&_ul]:mb-2 leading-relaxed">
                                    <ReactMarkdown>{cleanExportText(conflict.explanation || '')}</ReactMarkdown>
                                  </div>
                              </div>
                              <div className="absolute right-0 bottom-0 translate-y-1/4 translate-x-1/4 opacity-5">
                                <AlertTriangle className="w-40 h-40 text-amber-600" />
                              </div>
                            </div>
                          )) : (
                            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                              <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">No contradictory clauses detected</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Warnings Section */}
                      <div>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <AlertCircle className="w-3 h-3" /> System Warnings
                        </h4>
                        <div className="space-y-2">
                          {analysis.warnings?.length ? analysis.warnings.map((warning, i) => (
                            <div key={i} className="flex items-center gap-4 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700">
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              <p className="text-xs font-bold uppercase tracking-wide">{warning}</p>
                            </div>
                          )) : (
                            <p className="text-slate-400 text-xs italic">No specific warnings for this document.</p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'DATA QUALITY' && (
                    <motion.div 
                      key="quality"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="max-w-3xl mx-auto space-y-8"
                    >
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">OCR Confidence</h4>
                            <div className="text-4xl font-black text-slate-900 mb-2">{analysis.data_quality?.ocr_confidence}</div>
                            <p className="text-xs text-slate-500">How clearly the AI could read the text from the document image/PDF.</p>
                          </div>
                          <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Extraction Score</h4>
                            <div className="text-4xl font-black text-slate-900 mb-2">{analysis.data_quality?.extraction_confidence}</div>
                            <p className="text-xs text-slate-500">The AI's internal confidence in mapping the text correctly to rental fields.</p>
                          </div>
                       </div>

                       <div className="bg-white border border-slate-200 rounded-[2rem] p-8">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Technical Issues Detected</h4>
                          <div className="space-y-3">
                            {analysis.data_quality?.issues_detected?.length ? analysis.data_quality.issues_detected.map((issue, i) => (
                              <div key={i} className="flex items-start gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100">
                                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                                <div>
                                   <p className="font-bold text-slate-800 text-sm leading-snug">{issue}</p>
                                </div>
                              </div>
                            )) : (
                              <div className="text-center py-10 opacity-50">
                                <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-500" />
                                <p className="text-[10px] font-black uppercase tracking-widest">No technical issues found in file structure</p>
                              </div>
                            )}
                          </div>
                       </div>
                    </motion.div>
                  )}
                </AnimatePresence>
             </div>

             <div className="no-print p-8 border-t border-slate-100 bg-slate-50/30 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                   <AlertCircle className="w-4 h-4 text-slate-400" />
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Disclaimer: AI analysis is for informational use only. Not legal advice. Confidence score: {typeof analysis.confidence_score === 'number' ? `${analysis.confidence_score}%` : '—'}</p>
                </div>
                <button 
                  type="button"
                  onClick={() => window.print()}
                  className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-xl active:scale-[0.98]"
                >
                  Download Analysis PDF
                </button>
             </div>
          </div>
        </div>
        
        <div className="h-20" />
      </div>
      {typeof document !== 'undefined' &&
        chatOpen &&
        createPortal(
          <div className="no-print fixed bottom-6 right-6 z-[100] max-w-full pointer-events-auto">
            <div className="w-[min(100vw-2rem,380px)] h-[min(70vh,420px)] bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
                <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-widest">Ask AI</span>
                  <button
                    type="button"
                    onClick={() => setChatOpen(false)}
                    className="text-[10px] font-bold uppercase text-slate-400 hover:text-white"
                  >
                    Close
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 text-sm bg-slate-50">
                  {!analysis.session_id && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3">
                      Session unavailable. Re-upload your PDF with the API running to enable chat.
                    </p>
                  )}
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "rounded-xl px-3 py-2 max-w-[95%] break-words",
                        msg.role === "user"
                          ? "ml-auto bg-blue-600 text-white"
                          : "mr-auto bg-white border border-slate-200 text-slate-800"
                      )}
                    >
                      {msg.text}
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex items-center gap-2 text-slate-500 text-xs">
                      <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
                    </div>
                  )}
                </div>
                <div className="p-3 border-t border-slate-100 bg-white flex gap-2 shrink-0">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void sendChat();
                      }
                    }}
                    placeholder={analysis.session_id ? "Ask about rent, deposit, notice…" : "Upload with API enabled"}
                    disabled={!analysis.session_id || chatLoading}
                    className="flex-1 text-sm rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                  <button
                    type="button"
                    onClick={() => void sendChat()}
                    disabled={!analysis.session_id || chatLoading || !chatInput.trim()}
                    className="shrink-0 p-2 rounded-xl bg-blue-600 text-white disabled:opacity-40"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
          </div>,
          document.body
        )}
      </div>
      <AnalysisPrintReport analysis={analysis} fileName={_file.name} />
    </div>
  );
}
