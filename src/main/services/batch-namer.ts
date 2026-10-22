import path from 'path';
import fs from 'fs';
import type { BatchNamingConfig, BatchRenameOptions } from '../../shared/types.ts';
import type { OutputManager } from './output-manager.ts';

export class BatchNamer {
  /**
   * Format an index number with zero padding (e.g. 1 with 3 digits -> "001")
   */
  public static padNumber(num: number, digits: number): string {
    return String(num).padStart(Math.max(1, digits), '0');
  }

  /**
   * Get current date in YYYYMMDD format
   */
  public static getFormattedDate(d: Date = new Date()): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  }

  /**
   * Clean string for safe filename
   */
  public static sanitize(name: string): string {
    return name
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .trim();
  }

  /**
   * Generate filename based on BatchNamingConfig
   */
  public static formatFilename(params: {
    config: BatchNamingConfig;
    projectName: string;
    index: number;
    extension: string;
    originalName?: string;
  }): string {
    const { config, projectName, index, extension } = params;
    const sep = config.separator || '_';
    const numStr = this.padNumber(config.startNumber + index, config.digits || 3);
    const dateStr = this.getFormattedDate();
    const cleanPrefix = config.prefix ? this.sanitize(config.prefix) : '';
    const cleanProject = this.sanitize(projectName || 'Project');
    const ext = extension.startsWith('.') ? extension : `.${extension}`;

    let baseName = '';

    switch (config.pattern) {
      case 'prefix_index':
        baseName = cleanPrefix ? `${cleanPrefix}${sep}${numStr}` : `Image${sep}${numStr}`;
        break;
      case 'project_index':
        baseName = `${cleanProject}${sep}${numStr}`;
        break;
      case 'prefix_date_index':
        baseName = cleanPrefix
          ? `${cleanPrefix}${sep}${dateStr}${sep}${numStr}`
          : `${cleanProject}${sep}${dateStr}${sep}${numStr}`;
        break;
      case 'date_index':
        baseName = `${dateStr}${sep}${numStr}`;
        break;
      case 'custom':
        if (config.customPattern) {
          baseName = config.customPattern
            .replace(/{prefix}/gi, cleanPrefix || 'Image')
            .replace(/{project}/gi, cleanProject)
            .replace(/{date}/gi, dateStr)
            .replace(/{index}/gi, numStr);
        } else {
          baseName = `${cleanProject}${sep}${numStr}`;
        }
        break;
      default:
        baseName = cleanPrefix ? `${cleanPrefix}${sep}${numStr}` : `${cleanProject}${sep}${numStr}`;
    }

    return `${baseName}${ext}`;
  }

  /**
   * Checks target directory and appends suffix if a file with the same name already exists
   */
  public static getUniqueFilePath(dir: string, initialFilename: string): { filePath: string; filename: string } {
    const parsed = path.parse(initialFilename);
    let candidate = initialFilename;
    let counter = 1;

    while (fs.existsSync(path.join(dir, candidate))) {
      candidate = `${parsed.name}_${counter}${parsed.ext}`;
      counter++;
    }

    return {
      filePath: path.join(dir, candidate),
      filename: candidate,
    };
  }

  /**
   * Batch rename existing outputs on disk and update their metadata
   */
  public static async renameOutputs(
    outputManager: OutputManager,
    options: BatchRenameOptions
  ): Promise<{ success: boolean; renamedCount: number; message: string }> {
    try {
      const allOutputs = outputManager.listOutputs(options.projectName);
      const targetItems = options.fileIds && options.fileIds.length > 0
        ? allOutputs.filter((item) => options.fileIds!.includes(item.id))
        : allOutputs;

      if (targetItems.length === 0) {
        return { success: true, renamedCount: 0, message: 'Không có file nào cần đổi tên' };
      }

      // Sort items chronologically (oldest first) so index 001 is assigned to first created
      targetItems.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      let renamed = 0;
      for (let i = 0; i < targetItems.length; i++) {
        const item = targetItems[i];
        if (!fs.existsSync(item.path)) continue;

        const ext = path.extname(item.path);
        const dir = path.dirname(item.path);
        const newTargetName = this.formatFilename({
          config: options.namingConfig,
          projectName: item.projectName,
          index: i,
          extension: ext,
          originalName: item.name,
        });

        // Don't rename if name hasn't changed
        if (newTargetName === item.name) continue;

        const { filePath: newFilePath, filename: uniqueName } = this.getUniqueFilePath(dir, newTargetName);

        // Rename file on disk
        fs.renameSync(item.path, newFilePath);
        renamed++;

        // Update metadata file if exists
        if (item.metadataPath && fs.existsSync(item.metadataPath)) {
          try {
            const metaDir = path.dirname(item.metadataPath);
            const oldMetaContent = JSON.parse(fs.readFileSync(item.metadataPath, 'utf-8'));
            oldMetaContent.outputFile = newFilePath;
            oldMetaContent.renamedFrom = item.name;

            const newMetaBase = path.parse(uniqueName).name;
            const newMetaPath = path.join(metaDir, `${newMetaBase}.json`);

            fs.writeFileSync(newMetaPath, JSON.stringify(oldMetaContent, null, 2), 'utf-8');
            if (newMetaPath !== item.metadataPath && fs.existsSync(item.metadataPath)) {
              fs.unlinkSync(item.metadataPath);
            }
          } catch (metaErr) {
            console.warn('[BatchNamer] Failed to update metadata for renamed file:', metaErr);
          }
        }
      }

      return {
        success: true,
        renamedCount: renamed,
        message: `Đã đổi tên thành công ${renamed} file`,
      };
    } catch (err: any) {
      console.error('[BatchNamer] Error during batch rename:', err);
      return {
        success: false,
        renamedCount: 0,
        message: `Lỗi đổi tên: ${err.message || String(err)}`,
      };
    }
  }
}
