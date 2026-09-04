import { useState, useRef, useCallback } from 'react';

export function useAudioRecorder(onAudioChunk: (chunk: ArrayBuffer) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          const buffer = await event.data.arrayBuffer();
          onAudioChunk(buffer);
        }
      };

      mediaRecorder.start(250); // Send audio chunks every 250ms
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start audio recording:', err);
      setIsRecording(false);
    }
  }, [onAudioChunk]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setIsRecording(false);
  }, [isRecording]);

  return {
    isRecording,
    startRecording,
    stopRecording,
  };
}