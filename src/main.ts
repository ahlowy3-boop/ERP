import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import helmet from 'helmet';
import * as dns from 'dns';

dns.setDefaultResultOrder('ipv4first');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {
  console.warn('Failed to set custom DNS servers:', e);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');

  // 1. Helmet configuration (allow cross-origin resource sharing)
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // 2. Enable CORS — allow ALL origins (*) unconditionally for testing
  app.enableCors({
    origin: true, // Dynamically allows any origin (*) with credentials support
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: [
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Requested-With',
      'Origin',
      'Access-Control-Allow-Origin',
    ],
    credentials: true,
    optionsSuccessStatus: 204,
  });

  //3. تفعيل جدار الحماية للبيانات (Validation Pipe) عالمياً باستخدام الـ DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // يزيل بأمان أي حقول غير مسجلة في الـ DTO
      forbidNonWhitelisted: false, // لا يرفض الطلب في حال وجود حقول إضافية من الفرونت إند
      transform: true, // يحول القيم للأنواع الصحيحة (مثل تحويل النصوص لأرقام)
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // 4. تفعيل مصيدة الأخطاء الشاملة (لالتقاط أخطاء MongoDB و NestJS وتوحيد شكلها)
  app.useGlobalFilters(new AllExceptionsFilter());

  // 5. تفعيل موحد الاستجابات (لجعل الـ Response دائماً بصيغة {success, statusCode, message, data})
  app.useGlobalInterceptors(new TransformInterceptor());

  // 6. إعدادات وتفعيل التوثيق الآلي (Swagger)
  const config = new DocumentBuilder()
    .setTitle('PetroFlow ERP API')
    .setDescription(
      'The core backend API for PetroFlow Procurement, Inventory, and Auth',
    )
    .setVersion('1.0')
    .addBearerAuth() // يضيف زر إدخال الـ JWT Token في صفحة التوثيق
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // 7. تشغيل السيرفر
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(
    `🚀 PetroFlow ERP is running successfully on: http://localhost:${port}`,
  );
  console.log(
    `📚 Swagger documentation is available at: http://localhost:${port}/api/docs`,
  );
}
bootstrap();
