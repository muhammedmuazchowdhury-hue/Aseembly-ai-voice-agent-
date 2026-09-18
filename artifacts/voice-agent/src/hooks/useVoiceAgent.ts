import { useEffect, useRef, useState, useCallback } from "react";
import { useAudioPlayback } from "./useAudioPlayback";

export function useVoiceAgent() {
  const socketRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [assistantText, setAssistantText] = useState("");
  const [userText, setUserText] = useState("");

  const { enqueueAudioChunk, stopPlayback, isPlaying } = useAudioPlayback();

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/voice-agent/stream`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "session.started":
            if (data.sessionId) setSessionId(data.sessionId);
            break;

          case "assistant.audio.chunk":
            setIsProcessing(false);
            if (data.audio) {
              enqueueAudioChunk(data.audio);
            }
            break;

          case "assistant.text.delta":
            if (data.text) {
              setAssistantText((prev) => prev + data.text);
            }
            break;

          case "transcript.final":
            if (data.text) {
              setUserText(data.text);
              setAssistantText("");
            }
            break;

          case "turn.completed":
          case "turn.failed":
            setIsProcessing(false);
            break;

          default:
            break;
        }
      } catch (err) {}
    };

    ws.onclose = () => {
      setIsConnected(false);
      setSessionId(null);
    };

    return () => {
      ws.close();
    };
  }, [enqueueAudioChunk]);

  const triggerMockSpeech = useCallback((customText?: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      setIsProcessing(true);
      socketRef.current.send(
        JSON.stringify({
          type: "client.mock_speech",
          text: customText || "Hello! Explain how NeuralEcho delivers ultra low latency response.",
        })
      );
    }
  }, []);

  const sendAudioChunk = useCallback((chunk: ArrayBuffer) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(chunk);
    }
  }, []);

  const handleInterrupt = useCallback(() => {
    stopPlayback();
    setIsProcessing(false);
  }, [stopPlayback]);

  return {
    isConnected,
    sessionId,
    isProcessing,
    isPlaying,
    userText,
    assistantText,
    triggerMockSpeech,
    handleInterrupt,
    sendAudioChunk,
  };
}