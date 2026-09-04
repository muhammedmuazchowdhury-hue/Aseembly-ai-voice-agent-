import React from 'react';
import { AgentState } from '../hooks/useVoiceSession';

interface VoiceOrbProps {
  state: AgentState;
  onClick: () => void;
}

export const VoiceOrb: React.FC<VoiceOrbProps> = ({ state, onClick }) => {
  const getStateColor = () => {
    switch (state) {
      case 'listening':
        return 'bg-blue-500 shadow-blue-500/50 animate-pulse';
      case 'thinking':
        return 'bg-amber-500 shadow-amber-500/50 animate-spin';
      case 'speaking':
        return 'bg-emerald-500 shadow-emerald-500/50 animate-bounce';
      case 'transcribing':
        return 'bg-purple-500 shadow-purple-500/50 animate-pulse';
      default:
        return 'bg-slate-600 shadow-slate-600/30';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <button
        onClick={onClick}
        className={`relative w-32 h-32 rounded-full shadow-2xl transition-all duration-300 flex items-center justify-center focus:outline-none ${getStateColor()}`}
      >
        <span className="absolute inset-0 rounded-full border-4 border-white/20 animate-ping"></span>
        <span className="text-white font-bold uppercase tracking-wider text-xs z-10">
          {state}
        </span>
      </button>
      <p className="mt-4 text-sm text-slate-400">Click to toggle session or interact</p>
    </div>
  );
};