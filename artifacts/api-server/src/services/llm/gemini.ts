import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../../lib/config';
import { ConversationMessage, LlmProvider } from './types';

export class GeminiProvider implements LlmProvider {
  public readonly name = 'gemini';
  private ai: GoogleGenerativeAI;

  constructor() {
    this.ai = new GoogleGenerativeAI(config.geminiApiKey);
  }

  async *streamResponse(
    messages: ConversationMessage[],
    systemPrompt: string,
    signal: AbortSignal
  ): AsyncIterable<string> {
    const model = this.ai.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemPrompt,
    });

    // Convert internal message format to Gemini's chat history
    const history = messages.slice(0, -1).map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const lastMessage = messages[messages.length - 1]?.content || '';
    const chat = model.startChat({ history });

    const resultStream = await chat.sendMessageStream(lastMessage);

    for await (const chunk of resultStream.stream) {
      // Handle Barge-in (Interruption)
      if (signal.aborted) {
        break;
      }

      const text = chunk.text();
      if (text) {
        yield text;
      }
    }
  }
}