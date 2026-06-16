// Spraak→meting via Anthropic. Bouwt de 3-lagen system-prompt (VoicePromptService) en laat Claude
// de transcript naar gestructureerde meet-JSON omzetten.
//
// Dep: @anthropic-ai/sdk
// Env: ANTHROPIC_API_KEY (vereist; zonder → voice-parsing uitgeschakeld), ANTHROPIC_MODEL (optioneel).
// NB: het model is CONFIGUREERBAAR — geen hardcoded versie (de App had 'claude-sonnet-4-5' vast).

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { VoicePromptService } from './voice-prompt.service';

export interface ParsedMeasurementRow {
  componentName: string;
  componentType: 'group' | 'rcd' | 'main_distribution' | 'sub_distribution' | 'other';
  measurements: Array<{ type: string; value: number; unit: string; phase?: string | null; assessment?: 'PASS' | 'FAIL' | null; uncertain?: boolean }>;
  notes?: string | null;
  corrections?: string[];
  [k: string]: unknown;
}
export interface ParseMeasurementResult {
  success: boolean;
  data?: ParsedMeasurementRow;
  error?: string;
  confidence: number;
  rawTranscript: string;
}
export interface ParseMeasurementInput {
  transcript: string;
  templateId?: string;
  normTypeCode?: string;
  userId: string;
  orgId: string | null;
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';

@Injectable()
export class VoiceParseService {
  private readonly logger = new Logger(VoiceParseService.name);
  private anthropic?: Anthropic;
  private readonly configured: boolean;
  private readonly model: string;

  constructor(
    private config: ConfigService,
    private prompts: VoicePromptService,
  ) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    this.configured = !!apiKey;
    this.model = this.config.get<string>('ANTHROPIC_MODEL', DEFAULT_MODEL);
    if (this.configured) this.anthropic = new Anthropic({ apiKey });
    else this.logger.warn('ANTHROPIC_API_KEY niet gezet — voice-parsing uitgeschakeld');
  }

  isAvailable(): boolean { return this.configured; }

  async parseMeasurement(input: ParseMeasurementInput): Promise<ParseMeasurementResult> {
    if (!this.configured || !this.anthropic) {
      return { success: false, error: 'Voice-parsing niet geconfigureerd (ANTHROPIC_API_KEY)', confidence: 0, rawTranscript: input.transcript };
    }
    if (!input.transcript?.trim()) {
      return { success: false, error: 'Geen transcript ontvangen', confidence: 0, rawTranscript: input.transcript || '' };
    }
    try {
      const system = await this.prompts.buildCombinedPrompt(input.templateId, input.userId, input.orgId, input.normTypeCode);
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: `Parseer deze gesproken meting naar JSON:\n\n"${input.transcript}"` }],
      });
      const textBlock = response.content.find((c) => c.type === 'text');
      if (!textBlock || textBlock.type !== 'text') throw new Error('Geen tekst in respons');

      let json = textBlock.text.trim();
      if (json.startsWith('```json')) json = json.slice(7);
      else if (json.startsWith('```')) json = json.slice(3);
      if (json.endsWith('```')) json = json.slice(0, -3);

      const parsed = JSON.parse(json.trim()) as ParsedMeasurementRow;
      if (!parsed.componentName || !parsed.measurements) throw new Error('Verplichte velden ontbreken');

      const uncertain = parsed.measurements.filter((m) => m.uncertain).length;
      const confidence = parsed.measurements.length > 0 ? 1 - (uncertain / parsed.measurements.length) * 0.5 : 0.5;
      return { success: true, data: parsed, confidence, rawTranscript: input.transcript };
    } catch (e: any) {
      this.logger.error(`Voice-parse mislukt: ${e?.message}`, e?.stack);
      return { success: false, error: `Kon de meting niet verwerken: ${e?.message}`, confidence: 0, rawTranscript: input.transcript };
    }
  }
}
