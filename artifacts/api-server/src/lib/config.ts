import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // API Credentials
  assemblyAiApiKey: process.env.ASSEMBLYAI_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || '',
  elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM',
  
  // Strategy & Limits
  llmProvider: (process.env.LLM_PROVIDER || 'gemini') as 'gemini' | 'grok',
  maxSessionIdleMs: 10 * 60 * 1000, // 10 Minutes
};

export function validateEnv(): void {
  const requiredKeys = ['ASSEMBLYAI_API_KEY', 'GEMINI_API_KEY', 'ELEVENLABS_API_KEY'];
  const missingKeys = requiredKeys.filter((key) => !process.env[key]);

  if (missingKeys.length > 0) {
    console.error(`❌ CRITICAL ERROR: Missing required environment variables: ${missingKeys.join(', ')}`);
    console.error(`Please update your .env file in GitHub Codespaces.`);
    process.exit(1);
  }
}