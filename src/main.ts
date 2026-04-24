import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { AppModule } from './app.module';
import { UsersService } from './users/users.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Enable extremely permissive CORS allowing access from anywhere
  app.enableCors({
    origin: true, // Reflects the requesting origin (allows all)
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: '*',
    credentials: true,
  });

  // Enable validation globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Serve uploaded files as static assets at /static/*
  const uploadsDir = join(process.cwd(), 'uploads');
  for (const folder of ['products', 'inventory', 'barcodes']) {
    const path = join(uploadsDir, folder);
    if (!existsSync(path)) mkdirSync(path, { recursive: true });
  }
  app.useStaticAssets(uploadsDir, { prefix: '/static' });

  // Seed default admin
  const usersService = app.get(UsersService);
  await usersService.seedAdmin();

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`Backend running on port ${port}`);
  console.log(`Static files served at http://localhost:${port}/static/`);
}
bootstrap();
