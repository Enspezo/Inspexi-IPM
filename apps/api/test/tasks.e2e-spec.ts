import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('Tasks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: string;
  let testOrgId: string;
  let testContactId: string;
  let accessToken: string;
  const createdTaskIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    // Create test org
    const org = await prisma.organization.create({
      data: { name: 'E2E Tasks Org', slug: 'e2etaskorg' },
    });
    testOrgId = org.id;

    // Create test user
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-tasks@test.nl',
        passwordHash,
        firstName: 'Task',
        lastName: 'Tester',
        role: 'ORG_ADMIN',
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    testUserId = user.id;

    // Create test contact
    const contact = await prisma.contact.create({
      data: {
        orgId: org.id,
        type: 'COMPANY',
        companyName: 'E2E Task Test Contact',
        email: 'e2e-task-contact@test.nl',
        ownerId: user.id,
      },
    });
    testContactId = contact.id;

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-tasks@test.nl', password: 'TestPass123!' });
    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    // Cleanup in dependency order
    await prisma.task.deleteMany({
      where: { id: { in: createdTaskIds } },
    });
    await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
    await prisma.contact.deleteMany({ where: { id: testContactId } });
    await prisma.refreshToken.deleteMany({ where: { userId: testUserId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.organization.deleteMany({ where: { id: testOrgId } });
    await app.close();
  });

  describe('POST /api/v1/tasks', () => {
    it('should create a task', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'E2E Test Task',
          description: 'Created in E2E test',
          entityType: 'CONTACT',
          entityId: testContactId,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.title).toBe('E2E Test Task');
      expect(res.body.data.status).toBe('TE_DOEN');
      createdTaskIds.push(res.body.data.id);
    });

    it('should create a task with assignment', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Assigned Task',
          entityType: 'CONTACT',
          entityId: testContactId,
          assigneeId: testUserId,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.assigneeId).toBe(testUserId);
      createdTaskIds.push(res.body.data.id);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .send({ title: 'Test', entityType: 'CONTACT', entityId: testContactId })
        .expect(401);
    });

    it('should return 400 for missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'No entity type' })
        .expect(400);
    });
  });

  describe('GET /api/v1/tasks', () => {
    it('should list tasks', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tasks')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toBeDefined();
      expect(Array.isArray(res.body.data.data)).toBe(true);
      expect(res.body.data.total).toBeGreaterThanOrEqual(createdTaskIds.length);
    });

    it('should filter by entity type and entity id', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tasks')
        .query({ entityType: 'CONTACT', entityId: testContactId })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const tasks = res.body.data.data;
      for (const task of tasks) {
        expect(task.entityType).toBe('CONTACT');
        expect(task.entityId).toBe(testContactId);
      }
    });

    it('should filter by status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tasks')
        .query({ status: 'TE_DOEN' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should support onlyMine filter', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tasks')
        .query({ onlyMine: 'true' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should search by title', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tasks')
        .query({ search: 'E2E Test' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/v1/tasks/:id', () => {
    it('should return task details', async () => {
      const taskId = createdTaskIds[0];
      if (!taskId) return;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(taskId);
      expect(res.body.data.createdBy).toBeDefined();
    });

    it('should return 404 for non-existent task', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/tasks/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/tasks/:id', () => {
    it('should update task title', async () => {
      const taskId = createdTaskIds[0];
      if (!taskId) return;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Updated Task Title' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Updated Task Title');
    });

    it('should update task status', async () => {
      const taskId = createdTaskIds[0];
      if (!taskId) return;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'MEE_BEZIG' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('MEE_BEZIG');
    });
  });

  describe('DELETE /api/v1/tasks/:id', () => {
    it('should delete a task', async () => {
      // Create a task to delete
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Task to Delete',
          entityType: 'CONTACT',
          entityId: testContactId,
        });

      const taskId = createRes.body.data.id;
      createdTaskIds.push(taskId);

      await request(app.getHttpServer())
        .delete(`/api/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Verify it's gone
      await request(app.getHttpServer())
        .get(`/api/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
