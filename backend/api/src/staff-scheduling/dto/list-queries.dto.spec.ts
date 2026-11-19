import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  ListAttendanceQueryDto,
  ListShiftApplicationsQueryDto,
  ListShiftOpeningsQueryDto,
  ListShiftsQueryDto,
  ListStaffQueryDto,
  ListTasksQueryDto,
} from './list-queries.dto';
import { MyShiftsQueryDto, MyTasksQueryDto } from '../../staff-portal/dto/list-queries.dto';
import { ChatThreadQueryDto } from '../../chat/dto/thread-query.dto';

// Same options as the global pipe in main.ts.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

function validate(metatype: new () => object, query: Record<string, unknown>): Promise<unknown> {
  const metadata: ArgumentMetadata = { type: 'query', metatype, data: undefined };
  return pipe.transform(query, metadata);
}

async function expectRejected(metatype: new () => object, query: Record<string, unknown>): Promise<void> {
  await expect(validate(metatype, query)).rejects.toBeInstanceOf(BadRequestException);
}

const CUID = 'cm3x9k2ab0001qz8f7h6g5d4c';

describe('list query DTOs', () => {
  describe('ListShiftsQueryDto', () => {
    it('accepts no filters and every filter the frontend sends', async () => {
      await expect(validate(ListShiftsQueryDto, {})).resolves.toEqual({});
      await expect(
        validate(ListShiftsQueryDto, {
          staffId: CUID,
          department: 'Emergency Medicine',
          status: 'in_progress',
          dateFrom: '2026-11-01',
          dateTo: '2026-11-30T23:59:59.999Z',
        }),
      ).resolves.toEqual({
        staffId: CUID,
        department: 'Emergency Medicine',
        status: 'in_progress',
        dateFrom: '2026-11-01',
        dateTo: '2026-11-30T23:59:59.999Z',
      });
    });

    it.each([
      [{ status: 'running' }],
      [{ dateFrom: 'yesterday' }],
      [{ dateTo: '2026-02-30' }],
      [{ staffId: "x' OR 1=1" }],
      [{ staffId: 'a'.repeat(65) }],
      [{ department: 'd'.repeat(201) }],
      [{ unexpected: '1' }],
      [{ status: ['scheduled', 'completed'] }],
    ])('rejects %j', async (query) => {
      await expectRejected(ListShiftsQueryDto, query);
    });
  });

  describe('ListStaffQueryDto', () => {
    it('accepts a valid staff type and department', async () => {
      await expect(validate(ListStaffQueryDto, { staffType: 'lab_technician', department: 'Pathology' })).resolves.toEqual({
        staffType: 'lab_technician',
        department: 'Pathology',
      });
    });

    it('rejects an unknown staff type', async () => {
      await expectRejected(ListStaffQueryDto, { staffType: 'janitor' });
    });
  });

  describe('ListAttendanceQueryDto', () => {
    it('accepts staffId and a date range', async () => {
      await expect(
        validate(ListAttendanceQueryDto, { staffId: CUID, dateFrom: '2026-11-01', dateTo: '2026-11-07' }),
      ).resolves.toEqual({ staffId: CUID, dateFrom: '2026-11-01', dateTo: '2026-11-07' });
    });

    it('rejects a malformed date', async () => {
      await expectRejected(ListAttendanceQueryDto, { dateFrom: '11/01/2026' });
    });
  });

  describe('ListShiftOpeningsQueryDto', () => {
    it('keeps isOpen as the raw "true"/"false" string the controller converts', async () => {
      await expect(validate(ListShiftOpeningsQueryDto, { isOpen: 'false', requiredStaffType: 'nurse' })).resolves.toEqual({
        isOpen: 'false',
        requiredStaffType: 'nurse',
      });
    });

    it.each([[{ isOpen: 'yes' }], [{ requiredStaffType: 'surgeon' }]])('rejects %j', async (query) => {
      await expectRejected(ListShiftOpeningsQueryDto, query);
    });
  });

  describe('ListShiftApplicationsQueryDto', () => {
    it('accepts ids and a status', async () => {
      await expect(
        validate(ListShiftApplicationsQueryDto, { openingId: CUID, staffId: CUID, status: 'withdrawn' }),
      ).resolves.toEqual({ openingId: CUID, staffId: CUID, status: 'withdrawn' });
    });

    it.each([[{ status: 'accepted' }], [{ openingId: '../etc' }]])('rejects %j', async (query) => {
      await expectRejected(ListShiftApplicationsQueryDto, query);
    });
  });

  describe('ListTasksQueryDto', () => {
    it('accepts the derived "overdue" status', async () => {
      await expect(validate(ListTasksQueryDto, { assignedToId: CUID, status: 'overdue' })).resolves.toEqual({
        assignedToId: CUID,
        status: 'overdue',
      });
    });

    it('rejects an unknown status', async () => {
      await expectRejected(ListTasksQueryDto, { status: 'done' });
    });
  });

  describe('staff-portal MyShiftsQueryDto / MyTasksQueryDto', () => {
    it('accepts the filters the frontend sends', async () => {
      await expect(
        validate(MyShiftsQueryDto, { status: 'scheduled', dateFrom: '2026-11-18', dateTo: '2026-11-25' }),
      ).resolves.toEqual({ status: 'scheduled', dateFrom: '2026-11-18', dateTo: '2026-11-25' });
      await expect(validate(MyTasksQueryDto, { status: 'pending' })).resolves.toEqual({ status: 'pending' });
    });

    it('never accepts a client-supplied staffId', async () => {
      await expectRejected(MyShiftsQueryDto, { staffId: CUID });
    });

    it.each([
      [MyShiftsQueryDto, { dateTo: 'not-a-date' }],
      [MyTasksQueryDto, { status: 'archived' }],
    ])('rejects invalid input (%#)', async (metatype, query) => {
      await expectRejected(metatype, query);
    });
  });

  describe('ChatThreadQueryDto', () => {
    it('accepts no cursor or a message id', async () => {
      await expect(validate(ChatThreadQueryDto, {})).resolves.toEqual({});
      await expect(validate(ChatThreadQueryDto, { before: CUID })).resolves.toEqual({ before: CUID });
    });

    it.each([[{ before: 'not an id!' }], [{ before: '' }], [{ limit: '50' }]])('rejects %j', async (query) => {
      await expectRejected(ChatThreadQueryDto, query);
    });
  });
});
