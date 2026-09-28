import { experimental_transcribe as transcribe, NoTranscriptGeneratedError } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import { modelIds } from './models';

export async function transcribeAudio(audio: Uint8Array, apiKey: string, abortSignal: AbortSignal): Promise<string> {
  try {
    const result = await transcribe({
      model: createGroq({ apiKey }).transcription(modelIds.transcription),
      audio, abortSignal, maxRetries: 0,
    });
    return result.text.trim();
  } catch (error) {
    if (NoTranscriptGeneratedError.isInstance(error)) return '';
    throw error;
  }
}
