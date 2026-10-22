import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { BatchNamer } from '../src/main/services/batch-namer.ts';

describe('BatchNamer service', () => {
  it('should format index numbers with padding', () => {
    expect(BatchNamer.padNumber(1, 3)).toBe('001');
    expect(BatchNamer.padNumber(12, 3)).toBe('012');
    expect(BatchNamer.padNumber(105, 3)).toBe('105');
    expect(BatchNamer.padNumber(7, 4)).toBe('0007');
  });

  it('should format filename with prefix_date_index pattern', () => {
    const formatted = BatchNamer.formatFilename({
      config: {
        prefix: 'ChibiArt',
        pattern: 'prefix_date_index',
        startNumber: 1,
        digits: 3,
        separator: '_',
      },
      projectName: 'TestProject',
      index: 0,
      extension: '.png',
    });

    const dateStr = BatchNamer.getFormattedDate();
    expect(formatted).toBe(`ChibiArt_${dateStr}_001.png`);
  });

  it('should format filename with project_index pattern', () => {
    const formatted = BatchNamer.formatFilename({
      config: {
        pattern: 'project_index',
        startNumber: 10,
        digits: 3,
        separator: '-',
      },
      projectName: 'Anime Project',
      index: 2,
      extension: 'webp',
    });

    expect(formatted).toBe('Anime_Project-012.webp');
  });

  it('should avoid duplicate filenames on disk by adding unique suffixes', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-namer-test-'));

    try {
      // First file
      const first = BatchNamer.getUniqueFilePath(tempDir, 'Image_001.png');
      expect(first.filename).toBe('Image_001.png');
      fs.writeFileSync(first.filePath, 'content');

      // Second file with same target name should become Image_001_1.png
      const second = BatchNamer.getUniqueFilePath(tempDir, 'Image_001.png');
      expect(second.filename).toBe('Image_001_1.png');
      fs.writeFileSync(second.filePath, 'content');

      // Third file with same target name should become Image_001_2.png
      const third = BatchNamer.getUniqueFilePath(tempDir, 'Image_001.png');
      expect(third.filename).toBe('Image_001_2.png');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
