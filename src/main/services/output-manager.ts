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

            if (fs.existsSync(metaPath)) {
              try {
                const metaContent = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                prompt = metaContent.prompt || '';
              } catch {}
            } else {
              metaPath = '';
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
            });
          } catch {}
        }
      };

      processFolder(imgDir, 'image');
      processFolder(vidDir, 'video');
    }

    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
}
