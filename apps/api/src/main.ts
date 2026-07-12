import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { BadRequestException } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { ZodError } from 'zod';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });

  app.use(cookieParser());
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3001').split(','),
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

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  console.log(`API działa na http://localhost:${port} (OpenAPI: /docs)`);
}

bootstrap();
