import { useEffect, useRef, useState, useCallback } from "react";
import { useAudioPlayback } from "./useAudioPlayback";

export function useVoiceAgent() {
  const socketRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
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
          case "assistant.audio.chunk":
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
            break;

          default:
            break;
        }
      } catch (err) {}
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [enqueueAudioChunk]);

  const triggerMockSpeech = useCallback((customText?: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: "client.mock_speech",
          text: customText || "Hello! Explain how NeuralEcho delivers ultra low latency response.",
        })
      );
    }
  }, []);

  const handleInterrupt = useCallback(() => {
    stopPlayback();
  }, [stopPlayback]);

  return {
    isConnected,
    isPlaying,
    userText,
    assistantText,
    triggerMockSpeech,
    handleInterrupt,
  };
}