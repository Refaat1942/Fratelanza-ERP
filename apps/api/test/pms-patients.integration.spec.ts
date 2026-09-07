import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import { Prisma } from '../../../packages/database/generated/server';
import { PrismaService } from '../src/database/prisma.service';
import { PatientAccountService } from '../src/modules/pms/ledger/patient-account.service';
import { PatientsService } from '../src/modules/pms/patients/patients.service';
import {
  createIsolatedTenant,
  loadPmsTestContext,
  type PmsTestContext,
} from './pms-test.helpers';
import { createTestApp, loginAdmin, request } from './test-app';

describe('PMS patients (Phase 1c)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let patientsService: PatientsService;
  let patientAccounts: PatientAccountService;
  let ctx: PmsTestContext;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    patientsService = app.get(PatientsService);
    patientAccounts = app.get(PatientAccountService);
    ctx = await loadPmsTestContext(app);
    const auth = await loginAdmin(app);
    token = auth.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  function api() {
    return {
      get: (url: string) =>
        request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`),
      post: (url: string) =>
        request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`),
      patch: (url: string) =>
        request(app.getHttpServer()).patch(url).set('Authorization', `Bearer ${token}`),
      put: (url: string) =>
        request(app.getHttpServer()).put(url).set('Authorization', `Bearer ${token}`),
      delete: (url: string) =>
        request(app.getHttpServer()).delete(url).set('Authorization', `Bearer ${token}`),
    };
  }

  describe('Patient creation', () => {
    it('creates a patient with PAT code and zero-balance account', async () => {
      const res = await api()
        .post('/api/v1/pms/patients')
        .send({
          firstName: 'Amira',
          lastName: 'Hassan',
          branchId: ctx.branchId,
          phone: '+201001112233',
          email: 'amira@example.com',
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.data.patient.code).toMatch(/^PAT-\d{4}-\d{6}$/);
      expect(res.body.data.patient.fullName).toBe('Amira Hassan');
      expect(new Prisma.Decimal(res.body.data.account.cachedBalance).toString()).toBe('0');

      const accountCount = await prisma.patientAccount.count({
        where: { tenantId: ctx.tenantId, patientId: res.body.data.patient.id },
      });
      expect(accountCount).toBe(1);
    });

    it('creates optional profile in the same transaction', async () => {
      const res = await api()
        .post('/api/v1/pms/patients')
        .send({
          firstName: 'Omar',
          lastName: 'Saleh',
          profile: {
            referralSource: 'Walk-in',
            emergencyContactName: 'Sara Saleh',
          },
        });

      expect([200, 201]).toContain(res.status);
      const profile = await prisma.patientProfile.findUnique({
        where: { patientId: res.body.data.patient.id },
      });
      expect(profile?.referralSource).toBe('Walk-in');
    });

    it('prevents duplicate patient codes', async () => {
      const duplicateCode = `PAT-DUP-${Date.now()}`;
      const patient = await prisma.patient.create({
        data: {
          tenantId: ctx.tenantId,
          code: duplicateCode,
          firstName: 'Dup',
          lastName: 'One',
          fullName: 'Dup One',
        },
      });

      await expect(
        prisma.patient.create({
          data: {
            tenantId: ctx.tenantId,
            code: duplicateCode,
            firstName: 'Dup',
            lastName: 'Two',
            fullName: 'Dup Two',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });

      await prisma.patient.delete({ where: { id: patient.id } });
    });

    it('rolls back patient creation when account creation fails', async () => {
      const beforeCount = await prisma.patient.count({ where: { tenantId: ctx.tenantId } });
      const spy = jest
        .spyOn(patientAccounts, 'getOrCreateAccount')
        .mockRejectedValueOnce(new Error('forced account failure'));

      await expect(
        patientsService.create(ctx.tenantId, ctx.adminUserId, {
          firstName: 'Rollback',
          lastName: 'Test',
        }),
      ).rejects.toThrow('forced account failure');

      spy.mockRestore();

      const afterCount = await prisma.patient.count({ where: { tenantId: ctx.tenantId } });
      expect(afterCount).toBe(beforeCount);
    });

    it('rejects invalid branch on create', async () => {
      const res = await api()
        .post('/api/v1/pms/patients')
        .send({
          firstName: 'Bad',
          lastName: 'Branch',
          branchId: randomUUID(),
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Tenant isolation', () => {
    it('blocks cross-tenant read, update, archive, profile, notes, and account access', async () => {
      const isolated = await createIsolatedTenant(prisma, 'patients');

      const read = await api().get(`/api/v1/pms/patients/${isolated.patientId}`);
      expect(read.status).toBe(404);

      const update = await api()
        .patch(`/api/v1/pms/patients/${isolated.patientId}`)
        .send({ firstName: 'Hacked' });
      expect(update.status).toBe(404);

      const archive = await api().post(`/api/v1/pms/patients/${isolated.patientId}/archive`);
      expect(archive.status).toBe(404);

      const profile = await api()
        .put(`/api/v1/pms/patients/${isolated.patientId}/profile`)
        .send({ referralSource: 'X' });
      expect(profile.status).toBe(404);

      const notes = await api()
        .post(`/api/v1/pms/patients/${isolated.patientId}/notes`)
        .send({ content: 'Cross tenant note' });
      expect(notes.status).toBe(404);

      const account = await api().get(`/api/v1/pms/patients/${isolated.patientId}/account`);
      expect(account.status).toBe(404);
    });
  });

  describe('Search and listing', () => {
    let searchPatientId: string;
    const uniquePhone = `+20155${Date.now().toString().slice(-7)}`;

    beforeAll(async () => {
      const res = await api()
        .post('/api/v1/pms/patients')
        .send({
          firstName: 'Searchable',
          lastName: 'Patient',
          phone: uniquePhone,
          email: `search-${Date.now()}@example.com`,
        });
      searchPatientId = res.body.data.patient.id;
    });

    it('finds patients by code, phone, and name', async () => {
      const patient = await prisma.patient.findUnique({ where: { id: searchPatientId } });

      const byCode = await api().get(`/api/v1/pms/patients?search=${patient!.code}`);
      expect(byCode.status).toBe(200);
      expect(byCode.body.data.some((p: { id: string }) => p.id === searchPatientId)).toBe(true);

      const byPhone = await api().get(`/api/v1/pms/patients?search=${encodeURIComponent(uniquePhone)}`);
      expect(byPhone.body.data.some((p: { id: string }) => p.id === searchPatientId)).toBe(true);

      const byName = await api().get('/api/v1/pms/patients?search=Searchable');
      expect(byName.body.data.some((p: { id: string }) => p.id === searchPatientId)).toBe(true);
    });

    it('scopes search to tenant and paginates deterministically', async () => {
      const isolated = await createIsolatedTenant(prisma, 'search-scope');
      const isolatedPatient = await prisma.patient.findUnique({
        where: { id: isolated.patientId },
      });

      const crossTenantSearch = await api().get(
        `/api/v1/pms/patients?search=${encodeURIComponent(isolatedPatient!.firstName)}`,
      );
      expect(
        crossTenantSearch.body.data.every(
          (p: { tenantId: string }) => p.tenantId === ctx.tenantId,
        ),
      ).toBe(true);

      const page1 = await api().get('/api/v1/pms/patients?page=1&limit=2');
      expect(page1.status).toBe(200);
      expect(page1.body.meta.page).toBe(1);
      expect(page1.body.meta.limit).toBe(2);
      expect(page1.body.data.length).toBeLessThanOrEqual(2);

      const page2 = await api().get('/api/v1/pms/patients?page=2&limit=2');
      if (page1.body.meta.total > 2) {
        expect(page2.body.data[0]?.id).not.toBe(page1.body.data[0]?.id);
      }
    });

    it('filters by branch and status', async () => {
      const res = await api()
        .get(`/api/v1/pms/patients?branchId=${ctx.branchId}&status=active&limit=5`);
      expect(res.status).toBe(200);
      expect(
        res.body.data.every(
          (p: { branchId?: string; status: string }) =>
            p.status === 'active' && p.branchId === ctx.branchId,
        ),
      ).toBe(true);
    });
  });

  describe('Profile', () => {
    it('creates, updates, and prevents duplicate profiles', async () => {
      const created = await api()
        .post('/api/v1/pms/patients')
        .send({ firstName: 'Profile', lastName: 'Owner' });
      const patientId = created.body.data.patient.id;

      const upsert = await api()
        .put(`/api/v1/pms/patients/${patientId}/profile`)
        .send({ preferredLocale: 'ar', referralSource: 'Referral A' });
      expect(upsert.status).toBe(200);

      const update = await api()
        .put(`/api/v1/pms/patients/${patientId}/profile`)
        .send({ referralSource: 'Referral B' });
      expect(update.body.data.referralSource).toBe('Referral B');

      const profileCount = await prisma.patientProfile.count({ where: { patientId } });
      expect(profileCount).toBe(1);
    });

    it('blocks cross-tenant profile access', async () => {
      const isolated = await createIsolatedTenant(prisma, 'profile-iso');
      const res = await api().get(`/api/v1/pms/patients/${isolated.patientId}/profile`);
      expect(res.status).toBe(404);
    });
  });

  describe('Notes', () => {
    it('creates and lists patient notes', async () => {
      const created = await api()
        .post('/api/v1/pms/patients')
        .send({ firstName: 'Note', lastName: 'Subject' });
      const patientId = created.body.data.patient.id;

      const note = await api()
        .post(`/api/v1/pms/patients/${patientId}/notes`)
        .send({ content: 'Initial administrative note', noteType: 'administrative' });
      expect(note.status).toBe(201);

      const list = await api().get(`/api/v1/pms/patients/${patientId}/notes`);
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0].content).toBe('Initial administrative note');
    });

    it('blocks cross-tenant and cross-patient note access', async () => {
      const patientA = await api()
        .post('/api/v1/pms/patients')
        .send({ firstName: 'NoteA', lastName: 'Patient' });
      const patientB = await api()
        .post('/api/v1/pms/patients')
        .send({ firstName: 'NoteB', lastName: 'Patient' });

      const note = await api()
        .post(`/api/v1/pms/patients/${patientA.body.data.patient.id}/notes`)
        .send({ content: 'Private note' });

      const wrongPatient = await api().get(
        `/api/v1/pms/patients/${patientB.body.data.patient.id}/notes`,
      );
      expect(
        wrongPatient.body.data.every(
          (n: { id: string }) => n.id !== note.body.data.id,
        ),
      ).toBe(true);

      const isolated = await createIsolatedTenant(prisma, 'notes-iso');
      const crossTenant = await api().get(`/api/v1/pms/patients/${isolated.patientId}/notes`);
      expect(crossTenant.status).toBe(404);
    });
  });

  describe('Account invariant', () => {
    it('maintains exactly one account per patient', async () => {
      const created = await api()
        .post('/api/v1/pms/patients')
        .send({ firstName: 'Account', lastName: 'Invariant' });
      const patientId = created.body.data.patient.id;

      const first = await patientAccounts.getOrCreateAccount(ctx.tenantId, patientId);
      const second = await patientAccounts.getOrCreateAccount(ctx.tenantId, patientId);
      expect(first.id).toBe(second.id);

      const count = await prisma.patientAccount.count({
        where: { tenantId: ctx.tenantId, patientId },
      });
      expect(count).toBe(1);
    });
  });

  describe('Archive and delete policy', () => {
    it('archives patients with transactional history instead of deleting', async () => {
      const created = await api()
        .post('/api/v1/pms/patients')
        .send({ firstName: 'History', lastName: 'Patient' });
      const patientId = created.body.data.patient.id;
      const account = await patientAccounts.getOrCreateAccount(ctx.tenantId, patientId);

      await prisma.ledgerEntry.create({
        data: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          accountId: account.id,
          direction: 'debit',
          amount: new Prisma.Decimal('10.0000'),
          currency: 'EGP',
          entryType: 'adjustment',
          entryDate: new Date(),
          referenceType: 'test',
          referenceId: randomUUID(),
          description: 'history marker',
          runningBalance: new Prisma.Decimal('10.0000'),
        },
      });

      const del = await api().delete(`/api/v1/pms/patients/${patientId}`);
      expect(del.status).toBe(400);

      const archive = await api().post(`/api/v1/pms/patients/${patientId}/archive`);
      expect(archive.status).toBe(201);
      expect(archive.body.data.status).toBe('inactive');
    });

    it('soft-deletes patients without transactional history', async () => {
      const created = await api()
        .post('/api/v1/pms/patients')
        .send({ firstName: 'Deletable', lastName: 'Patient' });
      const patientId = created.body.data.patient.id;

      const del = await api().delete(`/api/v1/pms/patients/${patientId}`);
      expect(del.status).toBe(200);

      const read = await api().get(`/api/v1/pms/patients/${patientId}`);
      expect(read.status).toBe(404);
    });
  });

  describe('Patient foundation (360 prep)', () => {
    it('returns patient, profile, account summary, and notes count', async () => {
      const created = await api()
        .post('/api/v1/pms/patients')
        .send({
          firstName: 'Foundation',
          lastName: 'Patient',
          profile: { referralSource: 'Direct' },
        });
      const patientId = created.body.data.patient.id;

      await api()
        .post(`/api/v1/pms/patients/${patientId}/notes`)
        .send({ content: 'Foundation note' });

      const foundation = await patientsService.getPatientFoundation(ctx.tenantId, patientId);
      expect(foundation.patient.id).toBe(patientId);
      expect(foundation.profile?.referralSource).toBe('Direct');
      expect(new Prisma.Decimal(foundation.account.cachedBalance).toString()).toBe('0');
      expect(foundation.notesCount).toBe(1);
    });
  });
});
