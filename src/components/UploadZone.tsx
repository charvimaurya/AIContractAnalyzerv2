import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, X, AlertCircle, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { FileData } from '../types';

interface UploadZoneProps {
  onFileSelect: (file: FileData) => void;
  className?: string;
}

const MAX_SIZE = 20 * 1024 * 1024; // 20MB
/** PDF-only: RAG backend extracts text with pdfplumber */
const ALLOWED_TYPES = {
  'application/pdf': ['.pdf'],
};

export default function UploadZone({ onFileSelect, className }: UploadZoneProps) {
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    if (rejectedFiles.length > 0) {
      const rejr = rejectedFiles[0];
      if (rejr.errors[0]?.code === 'file-too-large') {
        setError('File is too large. Max size is 20MB.');
      } else {
        setError('Invalid file type. Supported format: PDF.');
      }
      return;
    }

    const file = acceptedFiles[0];
    if (file) {
      setError(null);
      setSelectedFile(file);
      
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        onFileSelect({
          name: file.name,
          type: file.type,
          size: file.size,
          data: base64,
          file,
        });
      };
      
      reader.readAsDataURL(file);
    }
  }, [onFileSelect]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ALLOWED_TYPES,
    maxSize: MAX_SIZE,
    multiple: false,
  } as any);

  return (
    <div className={cn("w-full max-w-2xl mx-auto", className)}>
      <div
        {...getRootProps()}
        className={cn(
          "relative group cursor-pointer rounded-[2rem] border-2 border-dashed transition-all duration-500 p-20 flex flex-col items-center justify-center text-center bg-white shadow-xl shadow-slate-200/50",
          isDragActive 
            ? "border-blue-500 bg-blue-50/30 scale-[0.99]" 
            : "border-slate-200 hover:border-blue-400",
          error ? "border-red-200 bg-red-50/30" : ""
        )}
      >
        <input {...getInputProps()} />
        
        <div className={cn(
          "w-16 h-16 rounded-2xl flex items-center justify-center mb-8 transition-all duration-500 shadow-sm",
          isDragActive ? "bg-blue-600 text-white scale-110 shadow-blue-200" : "bg-slate-100 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600"
        )}>
          {isDragActive ? <Shield className="w-8 h-8" /> : <Upload className="w-8 h-8" />}
        </div>

        <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">
          Drop your contract
        </h3>
        <p className="text-slate-400 mb-10 max-w-sm text-sm font-medium leading-relaxed">
          Residential lease or rental agreement. <br/>
          (PDF)
        </p>

        {selectedFile && !error && (
          <div className="flex items-center gap-3 px-6 py-3 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200 animate-in zoom-in-95">
            <FileText className="w-5 h-5" />
            <span className="text-xs font-black uppercase tracking-widest truncate max-w-[200px]">{selectedFile.name}</span>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
              }}
              className="hover:scale-110 transition-transform bg-white/20 p-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="mt-6 flex items-center gap-2 text-red-600 bg-red-50 px-5 py-3 rounded-xl border border-red-100"
            >
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs font-black uppercase tracking-widest">{error}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      <div className="mt-8 flex items-center justify-center gap-8 opacity-50 grayscale">
         <div className="flex items-center gap-2">
           <Shield className="w-4 h-4" />
           <span className="text-[10px] font-black uppercase tracking-widest">End-to-End Encryption</span>
         </div>
         <div className="flex items-center gap-2">
           <FileText className="w-4 h-4" />
           <span className="text-[10px] font-black uppercase tracking-widest">OCR Supported</span>
         </div>
      </div>
    </div>
  );
}
