import React from 'react';

interface TranscriptViewProps {
  partialTranscript: string;
  finalTranscript: string;
  aiResponseText: string;
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({
  partialTranscript,
  finalTranscript,
  aiResponseText,
}) => {
  return (
    <div className="w-full max-w-2xl mx-auto p-4 space-y-4 bg-slate-900/50 rounded-xl border border-slate-800 backdrop-blur-sm">
      <div className="flex flex-col space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">User Transcript</span>
        <div className="p-3 bg-slate-800/60 rounded-lg text-slate-200 min-h-[40px]">
          {finalTranscript || partialTranscript || <span className="text-slate-500 italic">Listening for speech...</span>}
          {partialTranscript && <span className="text-blue-400 ml-1 animate-pulse">{partialTranscript}</span>}
        </div>
      </div>

      <div className="flex flex-col space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Assistant Response</span>
        <div className="p-3 bg-slate-800/60 rounded-lg text-emerald-300 min-h-[60px] whitespace-pre-wrap">
          {aiResponseText || <span className="text-slate-500 italic">Waiting for AI response...</span>}
        </div>
      </div>
    </div>
  );
};