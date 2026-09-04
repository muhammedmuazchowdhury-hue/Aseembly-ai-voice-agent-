import React from 'react';
import { LatencyMetrics } from '../hooks/useVoiceSession';

interface LatencyPanelProps {
  metrics: LatencyMetrics | null;
}

export const LatencyPanel: React.FC<LatencyPanelProps> = ({ metrics }) => {
  if (!metrics) return null;

  return (
    <div className="w-full max-w-2xl mx-auto p-4 bg-slate-900/40 rounded-xl border border-slate-800 text-xs text-slate-300">
      <h3 className="font-semibold text-slate-400 mb-2 uppercase tracking-wider">Pipeline Latency Metrics</h3>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="p-2 bg-slate-800/60 rounded">
          <div className="text-slate-400">STT</div>
          <div className="font-bold text-blue-400 mt-1">{metrics.transcriptionMs}ms</div>
        </div>
        <div className="p-2 bg-slate-800/60 rounded">
          <div className="text-slate-400">LLM First</div>
          <div className="font-bold text-amber-400 mt-1">{metrics.llmFirstTokenMs}ms</div>
        </div>
        <div className="p-2 bg-slate-800/60 rounded">
          <div className="text-slate-400">TTS First</div>
          <div className="font-bold text-emerald-400 mt-1">{metrics.ttsFirstAudioMs}ms</div>
        </div>
        <div className="p-2 bg-slate-800/60 rounded">
          <div className="text-slate-400">Total</div>
          <div className="font-bold text-purple-400 mt-1">{metrics.totalMs}ms</div>
        </div>
      </div>
    </div>
  );
};