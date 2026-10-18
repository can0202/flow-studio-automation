import type { Job, Session } from '../../../shared/types.ts';

export interface GenerationProgress {
  progress: number;
  stage: 'starting' | 'submitting' | 'generating' | 'downloading' | 'completed';
  message?: string;
}

export interface GenerationResult {
  success: boolean;
  outputFile?: string;
  thumbnailFile?: string;
  error?: string;
  isTransient?: boolean;
  isQuotaExhausted?: boolean;
  isAuthRequired?: boolean;
  metadata?: Record<string, any>;
}

export interface FlowProvider {
  name: string;
  generate(
    job: Job,
    session: Session,
    onProgress: (progress: GenerationProgress) => void
  ): Promise<GenerationResult>;
}
