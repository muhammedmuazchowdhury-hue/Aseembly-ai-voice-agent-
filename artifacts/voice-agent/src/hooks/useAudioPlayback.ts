import { useState, useRef, useCallback } from 'react';

export function useAudioPlayback() {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const initAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const enqueueAudioChunk = useCallback(async (base64Audio: string) => {
    try {
      const ctx = initAudioContext();

      // Base64 থেকে Uint8Array তৈরি
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Safe ArrayBuffer copy
      const bufferCopy = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      );

      const audioBuffer = await ctx.decodeAudioData(bufferCopy);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const currentTime = ctx.currentTime;
      const startTime = Math.max(currentTime, nextStartTimeRef.current);

      source.start(startTime);
      nextStartTimeRef.current = startTime + audioBuffer.duration;

      activeSourcesRef.current.push(source);
      setIsPlaying(true);

      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
        // কিউতে আর কোনো অডিও বাকি না থাকলে isPlaying বন্ধ হবে
        if (activeSourcesRef.current.length === 0) {
          setIsPlaying(false);
        }
      };
    } catch (err) {
      console.error('Failed to process or play audio chunk:', err);
    }
  }, [initAudioContext]);

  const stopPlayback = useCallback(() => {
    // সব চালু থাকা অডিও থামানো
    activeSourcesRef.current.forEach((source) => {
      try {
        source.stop();
        source.disconnect();
      } catch (err) {
        // ইতোমধ্যে বন্ধ হয়ে গিয়ে থাকলে এরর ইগনোর করবে
      }
    });

    activeSourcesRef.current = [];
    nextStartTimeRef.current = 0;

    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch((err) => {
        console.error('Error closing AudioContext:', err);
      });
      audioCtxRef.current = null;
    }

    setIsPlaying(false);
  }, []);

  return {
    isPlaying,
    enqueueAudioChunk,
    stopPlayback,
  };
}