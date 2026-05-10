/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import UploadZone from './components/UploadZone';
import AnalysisDashboard from './components/AnalysisDashboard';
import { analyzeContract } from './services/api';
import { ContractAnalysis, FileData } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, AlertCircle } from 'lucide-react';

type AppState = 'LANDING' | 'UPLOAD' | 'ANALYZING' | 'RESULT' | 'ERROR';

function initialAppState(): AppState {
  if (typeof window === 'undefined') return 'LANDING';
  return window.location.pathname === '/upload' ? 'UPLOAD' : 'LANDING';
}

const LOADING_STATES = [
  "Reading contract...",
  "Extracting clauses...",
  "Analyzing risks...",
  "Generating explanations..."
];

export default function App() {
  const [state, setState] = useState<AppState>(initialAppState);
  const [fileData, setFileData] = useState<FileData | null>(null);
  const [analysis, setAnalysis] = useState<ContractAnalysis | null>(null);
  const [loadingTextIndex, setLoadingTextIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rejectionDetails, setRejectionDetails] = useState<{ supported_inputs?: string[], next_step?: string } | null>(null);

  useEffect(() => {
    let interval: number;
    if (state === 'ANALYZING') {
      interval = window.setInterval(() => {
        setLoadingTextIndex((prev) => (prev + 1) % LOADING_STATES.length);
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [state]);

  useEffect(() => {
    const onPop = () => {
      if (window.location.pathname === '/upload') setState('UPLOAD');
      else setState('LANDING');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const handleStart = () => {
    window.history.pushState({}, '', '/upload');
    setState('UPLOAD');
  };

  const goLanding = () => {
    window.history.pushState({}, '', '/');
    setState('LANDING');
  };

  const handleFileSelect = async (file: FileData) => {
    setFileData(file);
    setState('ANALYZING');
    setErrorMsg(null);
    
    try {
      const result = await analyzeContract(file);
      
      if (result.status === 'rejected') {
        setErrorMsg(result.reason || "This document does not appear to be a rental agreement.");
        setRejectionDetails({
          supported_inputs: result.supported_inputs,
          next_step: result.next_step
        });
        setState('ERROR');
      } else {
        setAnalysis(result);
        setState('RESULT');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to analyze the contract. Please try again with a clear document.");
      setState('ERROR');
    }
  };

  const reset = () => {
    setFileData(null);
    setAnalysis(null);
    setRejectionDetails(null);
    window.history.pushState({}, '', '/upload');
    setState('UPLOAD');
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] font-sans selection:bg-blue-100 selection:text-blue-900">
      <AnimatePresence mode="wait">
        {state === 'LANDING' && (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <LandingPage onStart={handleStart} />
          </motion.div>
        )}

        {state === 'UPLOAD' && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="container mx-auto px-6 py-20 flex flex-col items-center justify-center min-h-screen"
          >
            <div className="text-center mb-12">
               <h1 className="text-4xl font-black text-slate-900 mb-4">Analyze Your Document</h1>
               <p className="text-slate-500">Your file is processed securely using end-to-end encryption.</p>
            </div>
            <UploadZone onFileSelect={handleFileSelect} />
            <button 
              onClick={goLanding}
              className="mt-8 text-slate-400 hover:text-slate-600 font-medium transition-colors"
            >
              Back to home
            </button>
          </motion.div>
        )}

        {state === 'ANALYZING' && (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="relative mb-8">
               <div className="w-24 h-24 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
               <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-pulse" />
               </div>
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">Analyzing Your Contract</h2>
            <p className="text-blue-600 font-medium text-lg h-8">
              {LOADING_STATES[loadingTextIndex]}
            </p>
            <div className="mt-12 max-w-xs w-full bg-slate-200 h-1 rounded-full overflow-hidden">
               <motion.div 
                 initial={{ width: 0 }}
                 animate={{ width: "100%" }}
                 transition={{ duration: 15, ease: "linear" }}
                 className="h-full bg-blue-600"
               />
            </div>
            <p className="mt-4 text-xs text-slate-400 uppercase tracking-widest font-bold">Heads up: Complex contracts may take a minute</p>
          </motion.div>
        )}

        {state === 'RESULT' && analysis && fileData && (
          <motion.div
            key="result"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <AnalysisDashboard 
              analysis={analysis} 
              file={fileData}
              onReset={reset}
            />
          </motion.div>
        )}

        {state === 'ERROR' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="min-h-screen flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-6 border border-red-100">
               <AlertCircle className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-4">Something went wrong</h2>
            <p className="text-slate-600 max-w-md mb-8">{errorMsg}</p>
            
            {rejectionDetails && (
              <div className="mb-8 w-full max-w-sm text-left bg-slate-100 p-6 rounded-2xl border border-slate-200">
                {rejectionDetails.supported_inputs && (
                  <div className="mb-4">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1 text-slate-400">Supported Documents</span>
                    <p className="text-slate-600 text-sm">{rejectionDetails.supported_inputs.join(', ')}</p>
                  </div>
                )}
                {rejectionDetails.next_step && (
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1 text-slate-400">Next Step</span>
                    <p className="font-bold text-slate-800 text-sm">{rejectionDetails.next_step}</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-4">
              <button 
                onClick={reset}
                className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg"
              >
                Try Again
              </button>
              <button 
                onClick={goLanding}
                className="px-8 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all"
              >
                Home
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

