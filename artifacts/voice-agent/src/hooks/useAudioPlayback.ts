import { useState, useRef, useCallback } from 'react';

export function useAudioPlayback() {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioQueueRef = useRef<string[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const playNext = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      setIsPlaying(false);
      currentAudioRef.current = null;
      return;
    }

    setIsPlaying(true);
    const base64Chunk = audioQueueRef.current.shift()!;
    
    try {
      const binaryString = atob(base64Chunk);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const blob = new Blob([bytes], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        playNext();
      };

      audio.onerror = (err) => {
        console.error('Audio playback chunk error:', err);
        URL.revokeObjectURL(url);
        playNext();
      };

      audio.play().catch(err => {
        console.error('Audio play promise rejected:', err);
        playNext();
      });
    } catch (err) {
      console.error('Failed to process audio chunk:', err);
      playNext();
    }
  }, []);

  const enqueueAudioChunk = useCallback((base64Audio: string) => {
    audioQueueRef.current.push(base64Audio);
    if (!isPlaying) {
      playNext();
    }
  }, [isPlaying, playNext]);

  const stopPlayback = useCallback(() => {
    audioQueueRef.current = [];
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  return {
    isPlaying,
    enqueueAudioChunk,
    stopPlayback,
  };
}