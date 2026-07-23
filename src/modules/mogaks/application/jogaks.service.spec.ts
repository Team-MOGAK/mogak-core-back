import { describe, expect, it, vi } from 'vitest';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import type { MogaksRepository } from '../infrastructure/mogaks.repository';
import { JogaksService } from './jogaks.service';

function repository(): MogaksRepository {
  return {
    findOwnedMogak: vi.fn(),
    findOwnedJogak: vi.fn(),
    countJogaksWithCurrentOrFutureSchedule: vi.fn(),
    createJogakWithSchedule: vi.fn(),
    listOccurrenceScheduleRows: vi.fn(),
    listScheduleRowsForOwnedJogak: vi.fn(),
    listExecutionsForJogaks: vi.fn(),
    listSuccessCounts: vi.fn(),
    insertExecution: vi.fn(),
    findExecution: vi.fn(),
    updateExecutionStatus: vi.fn(),
    updateOwnedJogakTitle: vi.fn(),
    replaceOwnedJogakSchedule: vi.fn(),
    deleteOwnedJogak: vi.fn(),
  } as unknown as MogaksRepository;
}

const ownedMogak = {
  id: 3,
  modaratId: 2,
  title: '여름 목표',
  color: 'blue',
  categoryCode: 'CERTIFICATION',
  categoryName: '자격증',
  customCategoryName: null,
};

const ownedJogak = {
  id: 11,
  mogakId: 3,
  title: '문제 풀이',
  mogakTitle: '여름 목표',
  color: 'blue',
  categoryCode: 'CERTIFICATION',
  categoryName: '자격증',
  customCategoryName: null,
};

describe('JogaksService', () => {
  it('creates a WEEKLY Jogak from a validated schedule instead of DailyJogak rows', async () => {
    const mogaks = repository();
    vi.mocked(mogaks.findOwnedMogak).mockResolvedValue(ownedMogak);
    vi.mocked(mogaks.countJogaksWithCurrentOrFutureSchedule).mockResolvedValue(0);
    vi.mocked(mogaks.createJogakWithSchedule).mockResolvedValue({
      jogakId: 11,
      mogakId: 3,
      mogakTitle: '여름 목표',
      title: '정보처리기사 문제 풀이',
      color: 'blue',
      categoryCode: 'CERTIFICATION',
      categoryName: '자격증',
      customCategoryName: null,
      scheduleType: 'WEEKLY',
      effectiveFrom: '2026-07-20',
      effectiveTo: '2026-08-31',
      weekdays: ['MONDAY', 'WEDNESDAY'],
    });
    const service = new JogaksService(mogaks, () => '2026-07-23');

    await expect(
      service.create(7, {
        mogakId: 3,
        title: '정보처리기사 문제 풀이',
        schedule: {
          scheduleType: 'WEEKLY',
          effectiveFrom: '2026-07-20',
          effectiveTo: '2026-08-31',
          weekdays: ['MONDAY', 'WEDNESDAY'],
        },
      }),
    ).resolves.toMatchObject({
      jogakId: 11,
      schedule: { scheduleType: 'WEEKLY', weekdays: ['MONDAY', 'WEDNESDAY'] },
    });
    expect(mogaks.createJogakWithSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        mogak: expect.objectContaining({ id: 3 }),
        title: '정보처리기사 문제 풀이',
      }),
    );
  });

  it('rejects a weekly schedule without weekdays before writing a Jogak', async () => {
    const service = new JogaksService(repository(), () => '2026-07-23');

    await expect(
      service.create(7, {
        mogakId: 3,
        title: '루틴',
        schedule: { scheduleType: 'WEEKLY', effectiveFrom: '2026-07-23', weekdays: [] },
      }),
    ).rejects.toEqual(new AppException(AppErrorCode.ROUTINE_WEEKDAYS_REQUIRED));
  });

  it('projects a PENDING occurrence without creating an execution row', async () => {
    const mogaks = repository();
    vi.mocked(mogaks.listOccurrenceScheduleRows).mockResolvedValue([
      {
        scheduleId: 5,
        jogakId: 11,
        mogakId: 3,
        mogakTitle: '여름 목표',
        jogakTitle: '문제 풀이',
        color: 'blue',
        categoryCode: 'CERTIFICATION',
        categoryName: '자격증',
        customCategoryName: null,
        scheduleType: 'WEEKLY',
        effectiveFrom: '2026-07-20',
        effectiveTo: null,
        weekday: 'THURSDAY',
      },
    ]);
    vi.mocked(mogaks.listExecutionsForJogaks).mockResolvedValue([]);
    vi.mocked(mogaks.listSuccessCounts).mockResolvedValue([{ jogakId: 11, achievements: 3 }]);
    const service = new JogaksService(mogaks, () => '2026-07-23');

    await expect(service.listDay(7, '2026-07-23')).resolves.toEqual({
      size: 1,
      jogaks: [
        expect.objectContaining({
          jogakId: 11,
          scheduledDate: '2026-07-23',
          status: 'PENDING',
          achievements: 3,
        }),
      ],
    });
    expect(mogaks.insertExecution).not.toHaveBeenCalled();
  });

  it('returns an idempotent existing execution after a concurrent insert conflict', async () => {
    const mogaks = repository();
    vi.mocked(mogaks.findOwnedJogak).mockResolvedValue(ownedJogak);
    vi.mocked(mogaks.listOccurrenceScheduleRows).mockResolvedValue([
      {
        scheduleId: 5,
        jogakId: 11,
        mogakId: 3,
        mogakTitle: '여름 목표',
        jogakTitle: '문제 풀이',
        color: 'blue',
        categoryCode: 'CERTIFICATION',
        categoryName: '자격증',
        customCategoryName: null,
        scheduleType: 'WEEKLY',
        effectiveFrom: '2026-07-20',
        effectiveTo: null,
        weekday: 'THURSDAY',
      },
    ]);
    vi.mocked(mogaks.insertExecution).mockResolvedValue(null);
    vi.mocked(mogaks.findExecution).mockResolvedValue({
      id: 19,
      jogakId: 11,
      scheduledDate: '2026-07-23',
      status: 'IN_PROGRESS',
      jogakTitleSnapshot: '문제 풀이',
    });
    const service = new JogaksService(mogaks, () => '2026-07-23');

    await expect(service.commandExecution(7, 11, '2026-07-23', 'IN_PROGRESS')).resolves.toEqual({
      created: false,
      execution: expect.objectContaining({ status: 'IN_PROGRESS', jogakId: 11 }),
    });
    expect(mogaks.updateExecutionStatus).not.toHaveBeenCalled();
  });

  it('rejects an attempt to reopen a completed execution', async () => {
    const mogaks = repository();
    vi.mocked(mogaks.findOwnedJogak).mockResolvedValue(ownedJogak);
    vi.mocked(mogaks.listOccurrenceScheduleRows).mockResolvedValue([
      {
        scheduleId: 5,
        jogakId: 11,
        mogakId: 3,
        mogakTitle: '여름 목표',
        jogakTitle: '문제 풀이',
        color: 'blue',
        categoryCode: 'CERTIFICATION',
        categoryName: '자격증',
        customCategoryName: null,
        scheduleType: 'WEEKLY',
        effectiveFrom: '2026-07-20',
        effectiveTo: null,
        weekday: 'THURSDAY',
      },
    ]);
    vi.mocked(mogaks.insertExecution).mockResolvedValue(null);
    vi.mocked(mogaks.findExecution).mockResolvedValue({
      id: 19,
      jogakId: 11,
      scheduledDate: '2026-07-23',
      status: 'SUCCESS',
      jogakTitleSnapshot: '문제 풀이',
    });
    const service = new JogaksService(mogaks, () => '2026-07-23');

    await expect(service.commandExecution(7, 11, '2026-07-23', 'IN_PROGRESS')).rejects.toEqual(
      new AppException(AppErrorCode.INVALID_EXECUTION_TRANSITION),
    );
  });

  it('updates only the current Jogak title without rewriting execution snapshots', async () => {
    const mogaks = repository();
    vi.mocked(mogaks.updateOwnedJogakTitle).mockResolvedValue({
      ...ownedJogak,
      title: '수정된 문제 풀이',
    });
    const service = new JogaksService(mogaks, () => '2026-07-23');

    await expect(service.update(7, 11, { title: '수정된 문제 풀이' })).resolves.toMatchObject({
      jogakId: 11,
      title: '수정된 문제 풀이',
    });
    expect(mogaks.updateOwnedJogakTitle).toHaveBeenCalledWith(
      7,
      11,
      '수정된 문제 풀이',
      expect.any(Date),
    );
  });

  it('keeps legacy schedule fields in Jogak detail while exposing schedule history', async () => {
    const mogaks = repository();
    vi.mocked(mogaks.findOwnedJogak).mockResolvedValue(ownedJogak);
    vi.mocked(mogaks.listScheduleRowsForOwnedJogak).mockResolvedValue([
      {
        scheduleId: 5,
        jogakId: 11,
        mogakId: 3,
        mogakTitle: '여름 목표',
        jogakTitle: '문제 풀이',
        color: 'blue',
        categoryCode: 'CERTIFICATION',
        categoryName: '자격증',
        customCategoryName: null,
        scheduleType: 'WEEKLY',
        effectiveFrom: '2026-07-20',
        effectiveTo: '2026-08-31',
        weekday: 'MONDAY',
      },
    ]);
    vi.mocked(mogaks.listSuccessCounts).mockResolvedValue([{ jogakId: 11, achievements: 3 }]);
    const service = new JogaksService(mogaks, () => '2026-07-23');

    await expect(service.getDetail(7, 11)).resolves.toMatchObject({
      jogakId: 11,
      isRoutine: true,
      days: ['MONDAY'],
      startDate: '2026-07-20',
      endDate: '2026-08-31',
      achievements: 3,
      schedules: [
        {
          scheduleType: 'WEEKLY',
          effectiveFrom: '2026-07-20',
          effectiveTo: '2026-08-31',
          weekdays: ['MONDAY'],
        },
      ],
    });
  });

  it('does not report a successful Jogak delete when the owner predicate does not match', async () => {
    const mogaks = repository();
    vi.mocked(mogaks.deleteOwnedJogak).mockResolvedValue(false);
    const service = new JogaksService(mogaks, () => '2026-07-23');

    await expect(service.delete(7, 11)).rejects.toEqual(
      new AppException(AppErrorCode.JOGAK_NOT_FOUND),
    );
  });

  it('replaces a future schedule without rewriting an existing execution snapshot', async () => {
    const mogaks = repository();
    vi.mocked(mogaks.replaceOwnedJogakSchedule).mockResolvedValue({
      ...ownedJogak,
      title: '수정된 문제 풀이',
    });
    const service = new JogaksService(mogaks, () => '2026-07-23');

    await expect(
      service.update(7, 11, {
        title: '수정된 문제 풀이',
        schedule: {
          scheduleType: 'WEEKLY',
          effectiveFrom: '2026-07-24',
          weekdays: ['THURSDAY', 'FRIDAY'],
        },
      }),
    ).resolves.toMatchObject({ jogakId: 11, title: '수정된 문제 풀이' });
    expect(mogaks.replaceOwnedJogakSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        jogakId: 11,
        title: '수정된 문제 풀이',
        schedule: {
          scheduleType: 'WEEKLY',
          effectiveFrom: '2026-07-24',
          effectiveTo: null,
          weekdays: ['THURSDAY', 'FRIDAY'],
        },
      }),
    );
  });
});
