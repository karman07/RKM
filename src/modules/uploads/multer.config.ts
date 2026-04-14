import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export function multerConfig(folder: string) {
  return {
    storage: diskStorage({
      destination: (_req: Request, _file: Express.Multer.File, cb: (err: Error | null, dest: string) => void) => {
        const uploadPath = join(process.cwd(), 'uploads', folder);
        if (!existsSync(uploadPath)) {
          mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
      },
      filename: (_req: Request, file: Express.Multer.File, cb: (err: Error | null, name: string) => void) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const ext = extname(file.originalname).toLowerCase();
        cb(null, `${uniqueSuffix}${ext}`);
      },
    }),
    fileFilter: (_req: Request, file: Express.Multer.File, cb: (err: Error | null, accept: boolean) => void) => {
      const ext = extname(file.originalname).toLowerCase();
      if (ALLOWED_EXTENSIONS.includes(ext)) {
        cb(null, true);
      } else {
        cb(new BadRequestException(`File type '${ext}' not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`), false);
      }
    },
    limits: { fileSize: MAX_FILE_SIZE },
  };
}
