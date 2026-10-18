import { describe, it, expect } from 'vitest';
import type { CreateJobInput } from '../src/shared/types.ts';

function parseBatchInput(text: string): CreateJobInput[] {
  if (!text.trim()) return [];

  try {
    if (text.trim().startsWith('[') || text.trim().startsWith('{')) {
      const parsed = JSON.parse(text);
      const array = Array.isArray(parsed) ? parsed : [parsed];
      return array
        .map((item, i) => ({
          name: item.name || `Batch Job #${i + 1}`,
          type: item.type === 'video' ? 'video' : 'image',
          prompt: item.prompt || '',
          aspectRatio: item.aspectRatio || '1:1',
          duration: item.duration || 5,
          model: item.model || '',
        }))
        .filter((item) => item.prompt.trim() !== '');
    }
  } catch {}

  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const items: CreateJobInput[] = [];
  const startIndex = lines[0]?.toLowerCase().includes('prompt') ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
    if (parts.length > 0 && parts[0]) {
      items.push({
        name: `Batch Item #${items.length + 1}`,
        prompt: parts[0],
        type: (parts[1]?.toLowerCase() === 'video' ? 'video' : 'image') as any,
        aspectRatio: parts[2] || '1:1',
        duration: parseInt(parts[3]) || 5,
      });
    }
  }

  return items;
}

describe('Batch Import Parsing', () => {
  it('should parse valid CSV text with headers', () => {
    const csv = `prompt,type,aspectRatio,duration
"A futuristic neon train",video,16:9,10
"Portrait of a cat in royal attire",image,1:1,5`;

    const items = parseBatchInput(csv);
    expect(items.length).toBe(2);
    expect(items[0].prompt).toBe('A futuristic neon train');
    expect(items[0].type).toBe('video');
    expect(items[0].aspectRatio).toBe('16:9');
    expect(items[0].duration).toBe(10);

    expect(items[1].prompt).toBe('Portrait of a cat in royal attire');
    expect(items[1].type).toBe('image');
  });

  it('should parse JSON array of job definitions', () => {
    const json = JSON.stringify([
      { prompt: 'Cyberpunk street', type: 'image', aspectRatio: '16:9' },
      { prompt: 'Drone shot of island', type: 'video', duration: 10 },
    ]);

    const items = parseBatchInput(json);
    expect(items.length).toBe(2);
    expect(items[0].prompt).toBe('Cyberpunk street');
    expect(items[1].duration).toBe(10);
  });
});
