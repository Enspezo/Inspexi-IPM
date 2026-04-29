import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Allow requests from the main API
  app.enableCors();

  const port = process.env.CONVERT_API_PORT || 3002;
  await app.listen(port);
  console.log(`🔄 Convert API running on http://localhost:${port}`);
}
bootstrap();
