import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AiRunStatus, AiToolStatus, Role } from '@prisma/client';
import request from 'supertest';
import { AdminAiEnabledGuard } from '../src/admin-ai/admin-ai-enabled.guard';
import { ModelGatewayService } from '../src/admin-ai/providers/model-gateway.service';
import { AiProviderError, type AiModelRequest, type AiModelResponse } from '../src/admin-ai/providers/model-provider.interface';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Admin AI Copilot through the real HTTP stack: guards, validation, SSE
 * streaming, persistence and a real domain tool (beds) against the test
 * database. Only the model provider is faked -- no network, no real patient data.
 */
describe('Admin AI Copilot (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const generate = jest.fn<Promise<AiModelResponse>, [AiModelRequest, { signal: AbortSignal; onTextDelta?: (d: string) => void }]>();
  const fakeGateway = { providerName: 'fake', isConfigured: () => true, generate };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(AdminAiEnabledGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(ModelGatewayService)
      .useValue(fakeGateway)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await resetDb();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb();
    generate.mockReset();
  });

  async function resetDb(): Promise<void> {
    await prisma.auditLog.deleteMany();
    // AI rows cascade from their owning user.
    await prisma.user.deleteMany({ where: { email: { endsWith: '@ai.test' } } });
  }

  async function createUser(email: string, role: Role) {
    const user = await prisma.user.create({
      data: { email, firstName: 'Test', lastName: role, role, roleSelected: true, emailVerified: true },
    });
    return `Bearer ${jwt.sign({ sub: user.id, email: user.email, role: user.role, tokenVersion: 0 })}`;
  }

  const server = () => app.getHttpServer();

  async function createConversation(token: string): Promise<string> {
    const res = await request(server()).post('/api/admin-ai/conversations').set('Authorization', token).send({ activeModule: 'beds' }).expect(201);
    return res.body.data.id as string;
  }

  function parseEvents(text: string): Array<Record<string, unknown>> {
    return text
      .split('\n\n')
      .map((block) => block.split('\n').find((line) => line.startsWith('data: ')))
      .filter((line): line is string => Boolean(line))
      .map((line) => JSON.parse(line.slice(6)));
  }

  function sendMessage(token: string, conversationId: string, body: Record<string, unknown>) {
    return request(server())
      .post(`/api/admin-ai/conversations/${conversationId}/messages`)
      .set('Authorization', token)
      .send(body)
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => callback(null, data));
      });
  }

  it('requires authentication and the ADMIN role', async () => {
    await request(server()).get('/api/admin-ai/status').expect(401);
    const doctor = await createUser('doctor@ai.test', Role.DOCTOR);
    await request(server()).get('/api/admin-ai/status').set('Authorization', doctor).expect(403);
    await request(server()).post('/api/admin-ai/conversations').set('Authorization', doctor).send({}).expect(403);

    const admin = await createUser('admin@ai.test', Role.ADMIN);
    const status = await request(server()).get('/api/admin-ai/status').set('Authorization', admin).expect(200);
    expect(status.body.data).toMatchObject({ enabled: true, writesEnabled: false, phiAllowed: false });
    expect(JSON.stringify(status.body.data)).not.toMatch(/key|secret/i);
  });

  it('keeps conversations private to their owner', async () => {
    const admin = await createUser('admin@ai.test', Role.ADMIN);
    const other = await createUser('other@ai.test', Role.ADMIN);
    const id = await createConversation(admin);

    await request(server()).get(`/api/admin-ai/conversations/${id}/messages`).set('Authorization', other).expect(404);
    await request(server()).delete(`/api/admin-ai/conversations/${id}`).set('Authorization', other).expect(404);
    const res = await sendMessage(other, id, { message: 'hi', requestKey: 'other-key-0001' });
    expect(res.status).toBe(404);
    expect(generate).not.toHaveBeenCalled();

    const list = await request(server()).get('/api/admin-ai/conversations').set('Authorization', other).expect(200);
    expect(list.body.data.items).toEqual([]);
  });

  it('validates request payloads', async () => {
    const admin = await createUser('admin@ai.test', Role.ADMIN);
    const id = await createConversation(admin);

    expect((await sendMessage(admin, id, { message: 'hi' })).status).toBe(400);
    expect((await sendMessage(admin, id, { message: '', requestKey: 'valid-key-0001' })).status).toBe(400);
    expect((await sendMessage(admin, id, { message: 'hi', requestKey: 'valid-key-0001', activeModule: 'root' })).status).toBe(400);
    expect((await sendMessage(admin, id, { message: 'hi', requestKey: 'valid-key-0001', role: 'ADMIN', userId: 'x' })).status).toBe(400);
    await request(server()).post('/api/admin-ai/proposals/p1/approve').set('Authorization', admin).send({ paramsHash: 'nope' }).expect(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it('streams an answer over SSE using a real domain tool, persists it, and replays a duplicate request', async () => {
    const admin = await createUser('admin@ai.test', Role.ADMIN);
    const id = await createConversation(admin);

    generate
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [{ id: 'call-1', name: 'beds__getOccupancy', input: {} }],
        stopReason: 'tool_use',
        usage: { inputTokens: 50, outputTokens: 10 },
        model: 'fake-model',
        providerContent: [],
      })
      .mockImplementationOnce(async (req, options) => {
        options.onTextDelta?.('Occupancy checked.');
        const toolResult = req.messages.at(-1)?.content as Array<{ type: string; content: string }>;
        expect(JSON.parse(toolResult[0].content)).toHaveProperty('occupancyRate');
        return { text: 'Occupancy checked.', toolCalls: [], stopReason: 'end_turn', usage: { inputTokens: 80, outputTokens: 5 }, model: 'fake-model', providerContent: [] };
      });

    const res = await sendMessage(admin, id, { message: 'Bed occupancy?', requestKey: 'stream-key-0001', activeModule: 'beds' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const events = parseEvents(res.body as string);
    expect(events.map((e) => e.type)).toEqual(['run', 'tool', 'tool', 'text', 'done']);
    expect(events[2]).toMatchObject({ name: 'beds.getOccupancy', status: 'succeeded' });
    expect(events.at(-1)).toMatchObject({ status: 'succeeded', message: { role: 'assistant', content: 'Occupancy checked.' } });

    const run = await prisma.aiRun.findFirstOrThrow({ where: { conversationId: id }, include: { toolInvocations: true } });
    expect(run).toMatchObject({ status: AiRunStatus.SUCCEEDED, inputTokens: 130, outputTokens: 15, toolCalls: 1, activeModule: 'beds' });
    expect(run.toolInvocations).toEqual([expect.objectContaining({ toolName: 'beds.getOccupancy', status: AiToolStatus.SUCCEEDED })]);

    const messages = await request(server()).get(`/api/admin-ai/conversations/${id}/messages`).set('Authorization', admin).expect(200);
    expect(messages.body.data.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);

    // Same idempotency key: the stored answer is replayed, the model is not called again.
    const replay = await sendMessage(admin, id, { message: 'Bed occupancy?', requestKey: 'stream-key-0001' });
    expect(parseEvents(replay.body as string)).toEqual([expect.objectContaining({ type: 'done', replayed: true })]);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(await prisma.aiRun.count({ where: { conversationId: id } })).toBe(1);

    // Feedback: owner only.
    const assistantId = messages.body.data.messages[1].id as string;
    await request(server()).post(`/api/admin-ai/messages/${assistantId}/feedback`).set('Authorization', admin).send({ rating: 'up' }).expect(204);
    const other = await createUser('other@ai.test', Role.ADMIN);
    await request(server()).post(`/api/admin-ai/messages/${assistantId}/feedback`).set('Authorization', other).send({ rating: 'down' }).expect(404);

    const usage = await request(server()).get('/api/admin-ai/usage?days=1').set('Authorization', admin).expect(200);
    expect(usage.body.data).toMatchObject({ requests: 1, inputTokens: 130, outputTokens: 15, toolCalls: 1, feedback: { up: 1, down: 0 } });
  });

  it('reports a provider failure as an SSE error event and records the failed run', async () => {
    const admin = await createUser('admin@ai.test', Role.ADMIN);
    const id = await createConversation(admin);
    generate.mockRejectedValueOnce(new AiProviderError('unavailable', 'The AI provider is unavailable right now.'));

    const res = await sendMessage(admin, id, { message: 'Hello', requestKey: 'fail-key-0001' });
    expect(res.status).toBe(200);
    expect(parseEvents(res.body as string).at(-1)).toEqual({ type: 'error', code: 'unavailable', message: 'The AI provider is unavailable right now.' });
    expect(await prisma.aiRun.findFirst({ where: { conversationId: id } })).toMatchObject({ status: AiRunStatus.FAILED, errorCode: 'unavailable' });
  });

  it('refuses to approve AI proposals while writes are disabled', async () => {
    const admin = await createUser('admin@ai.test', Role.ADMIN);
    await request(server())
      .post('/api/admin-ai/proposals/does-not-matter/approve')
      .set('Authorization', admin)
      .send({ paramsHash: 'a'.repeat(64) })
      .expect(403);
  });
});
