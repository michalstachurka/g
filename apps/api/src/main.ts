import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { BadRequestException } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { ZodError } from 'zod';
import { AppModule } from './app.module';

/** Uzupełnia adresy z hostingu (np. Render fromService podaje host bez schematu). */
function normalizeUrlEnv(key: string) {
  const value = process.env[key];
  if (value && !/^https?:\/\//.test(value)) process.env[key] = `https://${value}`;
}

async function bootstrap() {
  normalizeUrlEnv('CONFIGURATOR_URL');
  normalizeUrlEnv('ADMIN_URL');
  normalizeUrlEnv('API_PUBLIC_URL');

  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });

  app.use(cookieParser());
  const allowList = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3001')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    // Dozwolone: skonfigurowane originy oraz domeny *.onrender.com (wdrożenie demo).
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      const ok =
        !origin ||
        allowList.includes(origin) ||
        /\.(onrender\.com|railway\.app|up\.railway\.app)$/.test(new URL(origin).hostname);
      callback(null, ok);
    },
    credentials: true,
  });
  // Walidacja wejścia odbywa się schematami Zod w kontrolerach.
  // Zod -> czytelny 400 zamiast 500.
  const httpAdapter = app.getHttpAdapter().getInstance();
  httpAdapter.set('trust proxy', 1);
  app.useGlobalFilters({
    catch(exception: unknown, host: import('@nestjs/common').ArgumentsHost) {
      const ctx = host.switchToHttp();
      const res = ctx.getResponse();
      if (exception instanceof ZodError) {
        res.status(400).json({
          statusCode: 400,
          message: exception.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
          error: 'Walidacja nie powiodła się',
        });
        return;
      }
      if (exception instanceof BadRequestException) {
        const body = exception.getResponse();
        res.status(400).json(typeof body === 'string' ? { statusCode: 400, message: body } : body);
        return;
      }
      const status =
        typeof (exception as { getStatus?: () => number })?.getStatus === 'function'
          ? (exception as { getStatus: () => number }).getStatus()
          : 500;
      const message =
        status === 500
          ? 'Wystąpił błąd serwera.'
          : ((exception as { message?: string })?.message ?? 'Błąd');
      if (status === 500) console.error(exception);
      res.status(status).json({ statusCode: status, message });
    },
  } as never);

  // Nagłówki bezpieczeństwa (bez zewnętrznych zależności).
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  const config = new DocumentBuilder()
    .setTitle('Door Configurator API')
    .setDescription('Publiczne i administracyjne API konfiguratora drzwi (white-label).')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  // W jednym kontenerze (proxy) API musi wziąć swój port (API_PORT=4000), a nie
  // globalne PORT hostingu, które należy do bramy - inaczej konflikt portów.
  // Standalone (bez API_PORT) używa PORT hostingu.
  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`API działa na porcie ${port} (OpenAPI: /docs)`);
}

bootstrap();
