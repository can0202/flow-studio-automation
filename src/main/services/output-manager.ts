import path from 'path';
import fs from 'fs';
import { shell } from 'electron';
import type { OutputFileItem, Job } from '../../shared/types.ts';

export class OutputManager {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(process.cwd(), 'output');
    this.ensureDir(this.baseDir);
  }

  public setBaseDir(newDir: string) {
    this.baseDir = newDir;
    this.ensureDir(this.baseDir);
  }

  public getBaseDir(): string {
    return this.baseDir;
  }

  private ensureDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  public getProjectDirs(projectName: string = 'FlowStudioProject') {
    const projectDir = path.join(this.baseDir, projectName);
    const imagesDir = path.join(projectDir, 'images');
    const videosDir = path.join(projectDir, 'videos');
    const metadataDir = path.join(projectDir, 'metadata');

    this.ensureDir(imagesDir);
    this.ensureDir(videosDir);
    this.ensureDir(metadataDir);

    return { projectDir, imagesDir, videosDir, metadataDir };
  }

  public saveMetadata(job: Job, outputFile: string, projectName: string = 'FlowStudioProject'): string {
    const { metadataDir } = this.getProjectDirs(projectName);
    const metaPath = path.join(metadataDir, `${job.id}.json`);

    const data = {
      jobId: job.id,
      name: job.name,
      type: job.type,
      provider: job.provider,
      prompt: job.prompt,
      model: job.model,
      aspectRatio: job.aspectRatio,
      duration: job.duration,
      outputFile,
      referenceImageUrl: job.referenceImageUrl,
      dependencyJobId: job.dependencyJobId,
      createdAt: job.createdAt,
      completedAt: new Date().toISOString(),
      metadata: job.metadata,
    };

    fs.writeFileSync(metaPath, JSON.stringify(data, null, 2), 'utf-8');

    // Also write metadata keyed to the actual output filename if it differs from job.id
    const fileBase = path.parse(outputFile).name;
    const fileMetaPath = path.join(metadataDir, `${fileBase}.json`);
    if (fileMetaPath !== metaPath) {
      try {
        fs.writeFileSync(fileMetaPath, JSON.stringify(data, null, 2), 'utf-8');
      } catch {}
    }

    return metaPath;
  }

  public listOutputs(projectName?: string): OutputFileItem[] {
    const results: OutputFileItem[] = [];
    if (!fs.existsSync(this.baseDir)) return results;

    const projectFolders = projectName
      ? [projectName]
      : fs.readdirSync(this.baseDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name);

    for (const proj of projectFolders) {
      const projPath = path.join(this.baseDir, proj);
      const imgDir = path.join(projPath, 'images');
      const vidDir = path.join(projPath, 'videos');
      const metaDir = path.join(projPath, 'metadata');

      const processFolder = (dir: string, type: 'image' | 'video') => {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          try {
            const stats = fs.statSync(filePath);
            if (!stats.isFile()) continue;

            const baseName = path.parse(file).name;
            let prompt = '';
            let metaPath = path.join(metaDir, `${baseName}.json`);

            // If not found by file base name, attempt lookup via embedded job_ ID
            if (!fs.existsSync(metaPath)) {
              const jobMatch = baseName.match(/(job_[a-zA-Z0-9_]+)/);
              if (jobMatch) {
                const altPath = path.join(metaDir, `${jobMatch[1]}.json`);
                if (fs.existsSync(altPath)) {
                  metaPath = altPath;
                }
              }
            }

            let batchIndex: number | undefined = undefined;
            let originalCreatedAt = stats.mtime.toISOString();

            if (fs.existsSync(metaPath)) {
              try {
                const metaContent = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                prompt = metaContent.prompt || '';
                if (metaContent.metadata?.batchIndex !== undefined) {
                  batchIndex = Number(metaContent.metadata.batchIndex);
                } else if (metaContent.name) {
                  const m = metaContent.name.match(/\(#?(\d+)\)/);
                  if (m) batchIndex = parseInt(m[1], 10);
                }
                if (metaContent.createdAt) {
                  originalCreatedAt = metaContent.createdAt;
                }
              } catch {}
            }

            // Fallback: extract index from filename, e.g. "0070_job_..." or "Image_070"
            if (batchIndex === undefined) {
              const leadMatch = baseName.match(/^0*(\d+)(?:[_\-\s]|$)/);
              if (leadMatch) {
                batchIndex = parseInt(leadMatch[1], 10);
              } else {
                const anyNumMatch = baseName.match(/(?:[_\-\s])0*(\d+)(?:[_\-\s]|$)/);
                if (anyNumMatch) {
                  batchIndex = parseInt(anyNumMatch[1], 10);
                }
              }
            }

            results.push({
              id: `${proj}_${file}`,
              jobId: baseName,
              name: file,
              path: filePath,
              type,
              size: stats.size,
              createdAt: stats.mtime.toISOString(),
              projectName: proj,
              prompt,
              metadataPath: metaPath || undefined,
              batchIndex,
              originalCreatedAt,
            });
          } catch {}
        }
      };

      processFolder(imgDir, 'image');
      processFolder(vidDir, 'video');
    }

    return results.sort((a, b) => {
      // 1. Sort by batchIndex ascending if present
      if (a.batchIndex !== undefined && b.batchIndex !== undefined) {
        if (a.projectName === b.projectName) {
          return a.batchIndex - b.batchIndex;
        }
      }
      if (a.batchIndex !== undefined && a.projectName === b.projectName) return -1;
      if (b.batchIndex !== undefined && a.projectName === b.projectName) return 1;

      // 2. Sort by original job creation time ascending
      const timeA = new Date(a.originalCreatedAt || a.createdAt).getTime();
      const timeB = new Date(b.originalCreatedAt || b.createdAt).getTime();
      if (timeA !== timeB) return timeA - timeB;

      // 3. Natural alphanumeric sort by filename
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
  }

  public openFile(filePath: string) {
    if (fs.existsSync(filePath)) {
      shell.openPath(filePath);
    }
  }

  public revealInExplorer(filePath: string) {
    if (fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
    } else {
      const dir = path.dirname(filePath);
      if (fs.existsSync(dir)) {
        shell.openPath(dir);
      }
    }
  }

  public deleteOutput(filePath: string): boolean {
    try {
      // Normalize path separators for cross-platform compatibility
      const normalizedPath = path.resolve(filePath);

      if (fs.existsSync(normalizedPath)) {
        fs.unlinkSync(normalizedPath);
        console.log(`[OutputManager] Deleted file: ${normalizedPath}`);
      } else {
        console.warn(`[OutputManager] File not found (already deleted?): ${normalizedPath}`);
      }

      // Also delete associated metadata
      const ext = path.extname(normalizedPath);
      const baseName = path.basename(normalizedPath, ext);
      const dir = path.dirname(normalizedPath);
      const projDir = path.dirname(dir);
      const metaPath = path.join(projDir, 'metadata', `${baseName}.json`);
      if (fs.existsSync(metaPath)) {
        fs.unlinkSync(metaPath);
        console.log(`[OutputManager] Deleted metadata: ${metaPath}`);
      }
      return true;
    } catch (err) {
      console.error('[OutputManager] Failed to delete output file:', filePath, err);
      return false;
    }
  }

  public deleteOutputs(filePaths: string[]): { success: boolean; deletedCount: number } {
    let deletedCount = 0;
    for (const fp of filePaths) {
      if (this.deleteOutput(fp)) {
        deletedCount++;
      }
    }
    return { success: true, deletedCount };
  }
}
