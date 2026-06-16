import { ConfigService } from '@nestjs/config';
import { VoiceParseService, ParseMeasurementInput } from './voice-parse.service';
import { VoicePromptService } from './voice-prompt.service';

// Mock de Anthropic-client: de geconstrueerde instance heeft messages.create → mockAnthropicCreate.
const mockAnthropicCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn(() => ({ messages: { create: mockAnthropicCreate } })),
}));

describe('VoiceParseService', () => {
  let prompts: { buildCombinedPrompt: jest.Mock };

  const makeConfig = (apiKey?: string, model?: string) =>
    ({
      get: jest.fn((key: string, def?: string) => {
        if (key === 'ANTHROPIC_API_KEY') return apiKey;
        if (key === 'ANTHROPIC_MODEL') return model ?? def;
        return def;
      }),
    }) as unknown as ConfigService;

  const build = (apiKey?: string, model?: string) =>
    new VoiceParseService(makeConfig(apiKey, model), prompts as unknown as VoicePromptService);

  const input: ParseMeasurementInput = {
    transcript: 'Groep 1 isolatie 500 megaohm',
    userId: 'u1',
    orgId: 'o1',
  };

  const textResponse = (text: string) => ({ content: [{ type: 'text', text }] });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAnthropicCreate.mockReset();
    prompts = { buildCombinedPrompt: jest.fn().mockResolvedValue('SYSTEM_PROMPT') };
  });

  describe('isAvailable (status)', () => {
    it('is false zonder ANTHROPIC_API_KEY', () => {
      expect(build(undefined).isAvailable()).toBe(false);
    });
    it('is true met ANTHROPIC_API_KEY', () => {
      expect(build('test-key').isAvailable()).toBe(true);
    });
  });

  describe('parseMeasurement', () => {
    it('geeft success:false en roept Anthropic niet aan zonder API-key', async () => {
      const res = await build(undefined).parseMeasurement(input);
      expect(res.success).toBe(false);
      expect(res.error).toContain('niet geconfigureerd');
      expect(res.rawTranscript).toBe(input.transcript);
      expect(mockAnthropicCreate).not.toHaveBeenCalled();
    });

    it('geeft success:false bij een lege transcript', async () => {
      const res = await build('test-key').parseMeasurement({ ...input, transcript: '   ' });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Geen transcript');
      expect(mockAnthropicCreate).not.toHaveBeenCalled();
    });

    it('parseert geldige JSON → success, data en confidence 1 (geen uncertain)', async () => {
      mockAnthropicCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({
            componentName: 'Groep 1',
            componentType: 'group',
            measurements: [{ type: 'insulation_resistance', value: 500, unit: 'MΩ', uncertain: false }],
          }),
        ),
      );

      const res = await build('test-key').parseMeasurement(input);

      expect(res.success).toBe(true);
      expect(res.data?.componentName).toBe('Groep 1');
      expect(res.data?.measurements[0].value).toBe(500);
      expect(res.confidence).toBe(1);
      expect(res.rawTranscript).toBe(input.transcript);

      // 3-lagen prompt wordt als system meegestuurd; default-model is configureerbaar
      expect(prompts.buildCombinedPrompt).toHaveBeenCalledWith(undefined, 'u1', 'o1', undefined);
      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({ system: 'SYSTEM_PROMPT', model: 'claude-sonnet-4-6', max_tokens: 1024 }),
      );
    });

    it('strip ```json-codeblokken voordat het JSON parset', async () => {
      mockAnthropicCreate.mockResolvedValue(
        textResponse('```json\n{"componentName":"Groep 2","componentType":"group","measurements":[]}\n```'),
      );
      const res = await build('test-key').parseMeasurement(input);
      expect(res.success).toBe(true);
      expect(res.data?.componentName).toBe('Groep 2');
      // geen metingen → neutrale confidence 0.5
      expect(res.confidence).toBe(0.5);
    });

    it('verlaagt confidence naar rato van uncertain-vlaggen', async () => {
      mockAnthropicCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({
            componentName: 'Groep 3',
            componentType: 'group',
            measurements: [
              { type: 'loop_impedance', value: 1, unit: 'Ω', uncertain: true },
              { type: 'continuity', value: 2, unit: 'Ω', uncertain: false },
            ],
          }),
        ),
      );
      const res = await build('test-key').parseMeasurement(input);
      // 1 van 2 uncertain → 1 - (1/2)*0.5 = 0.75
      expect(res.confidence).toBe(0.75);
    });

    it('geeft success:false bij ongeldige JSON', async () => {
      mockAnthropicCreate.mockResolvedValue(textResponse('dit is geen json'));
      const res = await build('test-key').parseMeasurement(input);
      expect(res.success).toBe(false);
      expect(res.error).toContain('Kon de meting niet verwerken');
    });

    it('geeft success:false bij ontbrekende verplichte velden', async () => {
      mockAnthropicCreate.mockResolvedValue(textResponse(JSON.stringify({ foo: 'bar' })));
      const res = await build('test-key').parseMeasurement(input);
      expect(res.success).toBe(false);
    });

    it('gebruikt het model uit ANTHROPIC_MODEL (geen hardcoded versie)', async () => {
      mockAnthropicCreate.mockResolvedValue(
        textResponse(JSON.stringify({ componentName: 'G', componentType: 'group', measurements: [] })),
      );
      await build('test-key', 'claude-opus-4-8').parseMeasurement(input);
      expect(mockAnthropicCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-opus-4-8' }));
    });

    it('geeft template- en norm-context door aan de prompt-builder', async () => {
      mockAnthropicCreate.mockResolvedValue(
        textResponse(JSON.stringify({ componentName: 'G', componentType: 'group', measurements: [] })),
      );
      await build('test-key').parseMeasurement({ ...input, templateId: 'tmpl-9', normTypeCode: 'NEN3140' });
      expect(prompts.buildCombinedPrompt).toHaveBeenCalledWith('tmpl-9', 'u1', 'o1', 'NEN3140');
    });
  });
});
