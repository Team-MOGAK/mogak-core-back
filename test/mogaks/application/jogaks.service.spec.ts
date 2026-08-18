import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import { MogakPersistenceException } from '@core/mogaks/domain/exception/mogakPersistence.exception';
import { jest } from '@jest/globals';
import { testMock } from '../../testMock';
import type { MogakRepositoryPort } from '@core/mogaks/application/port/mogak.repository.port';
import { JogaksService } from '@core/mogaks/application/service/jogaks.service';

function repository(): MogakRepositoryPort {
  return {
    findOwnedMogak: testMock(),
    findOwnedJogak: testMock(),
    countJogaksWithCurrentOrFutureSchedule: testMock(),
    createJogakWithSchedule: testMock(),
    listOccurrenceScheduleRows: testMock(),
    listScheduleRowsForOwnedJogak: testMock(),
    listExecutionsForJogaks: testMock(),
    listSuccessCounts: testMock(),
    insertExecution: testMock(),
    findExecution: testMock(),
    updateExecutionStatus: testMock(),
    patchOwnedJogak: testMock(),
    deleteOwnedJogak: testMock(),
  } as unknown as MogakRepositoryPort;
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

describe('조각 서비스', () => {
  it('일간 조각 행 대신 검증된 일정으로 주간 조각을 생성한다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.findOwnedMogak).mockResolvedValue(ownedMogak);
    jest.mocked(mogaks.countJogaksWithCurrentOrFutureSchedule).mockResolvedValue(0);
    jest.mocked(mogaks.createJogakWithSchedule).mockResolvedValue({
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

  it('요일 없는 주간 일정을 조각 저장 전에 거부한다', async () => {
    const service = new JogaksService(repository(), () => '2026-07-23');

    await expect(
      service.create(7, {
        mogakId: 3,
        title: '루틴',
        schedule: { scheduleType: 'WEEKLY', effectiveFrom: '2026-07-23', weekdays: [] },
      }),
    ).rejects.toEqual(new DomainException(DomainErrorCode.ROUTINE_WEEKDAYS_REQUIRED));
  });

  it('실행 행을 만들지 않고 대기 발생을 조회 결과로 구성한다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.listOccurrenceScheduleRows).mockResolvedValue([
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
    jest.mocked(mogaks.listExecutionsForJogaks).mockResolvedValue([]);
    jest.mocked(mogaks.listSuccessCounts).mockResolvedValue([{ jogakId: 11, achievements: 3 }]);
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

  it('한 번 일정의 실행 응답을 루틴으로 표시하지 않는다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.findOwnedJogak).mockResolvedValue(ownedJogak);
    jest.mocked(mogaks.listOccurrenceScheduleRows).mockResolvedValue([
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
        scheduleType: 'ONCE',
        effectiveFrom: '2026-07-23',
        effectiveTo: null,
        weekday: null,
      },
    ]);
    jest.mocked(mogaks.insertExecution).mockResolvedValue({
      id: 19,
      jogakId: 11,
      scheduledDate: '2026-07-23',
      status: 'IN_PROGRESS',
      jogakTitleSnapshot: '문제 풀이',
    });
    const service = new JogaksService(mogaks, () => '2026-07-23');

    await expect(service.commandExecution(7, 11, '2026-07-23', 'IN_PROGRESS')).resolves.toEqual(
      expect.objectContaining({ execution: expect.objectContaining({ isRoutine: false }) }),
    );
  });

  it('중복 persistence row에 weekday가 있으면 ONCE 일정을 fail-fast 처리한다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.listOccurrenceScheduleRows).mockResolvedValue([
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
        scheduleType: 'ONCE',
        effectiveFrom: '2026-07-23',
        effectiveTo: null,
        weekday: null,
      },
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
        scheduleType: 'ONCE',
        effectiveFrom: '2026-07-23',
        effectiveTo: null,
        weekday: 'MONDAY',
      },
    ]);
    jest.mocked(mogaks.listExecutionsForJogaks).mockResolvedValue([]);
    jest.mocked(mogaks.listSuccessCounts).mockResolvedValue([]);
    const service = new JogaksService(mogaks, () => '2026-07-23');

    await expect(service.listDay(7, '2026-07-23')).rejects.toBeInstanceOf(
      MogakPersistenceException,
    );
  });

  it('유효하지 않은 WEEKLY persistence row는 원인을 보존한 MogakPersistenceException으로 번역한다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.listOccurrenceScheduleRows).mockResolvedValue([
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
        weekday: null,
      },
    ]);
    jest.mocked(mogaks.listExecutionsForJogaks).mockResolvedValue([]);
    jest.mocked(mogaks.listSuccessCounts).mockResolvedValue([]);
    const service = new JogaksService(mogaks, () => '2026-07-23');

    await expect(service.listDay(7, '2026-07-23')).rejects.toMatchObject({
      name: 'MogakPersistenceException',
      cause: expect.any(RangeError),
    });
  });

  it('동시 삽입 충돌 뒤 기존 실행을 멱등하게 반환한다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.findOwnedJogak).mockResolvedValue(ownedJogak);
    jest.mocked(mogaks.listOccurrenceScheduleRows).mockResolvedValue([
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
    jest.mocked(mogaks.insertExecution).mockResolvedValue(null);
    jest.mocked(mogaks.findExecution).mockResolvedValue({
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

  it('실행을 만들거나 바꾸지 않고 게시글용 소유 가상 발생을 해석한다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.findOwnedJogak).mockResolvedValue(ownedJogak);
    jest.mocked(mogaks.listOccurrenceScheduleRows).mockResolvedValue([
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
    const service = new JogaksService(mogaks, () => '2026-07-23');

    await expect(service.resolveOwnedOccurrence(7, 11, '2026-07-23')).resolves.toEqual({
      jogakId: 11,
      mogakId: 3,
      title: '문제 풀이',
    });
    expect(mogaks.insertExecution).not.toHaveBeenCalled();
    expect(mogaks.updateExecutionStatus).not.toHaveBeenCalled();
  });

  it('완료된 실행을 다시 여는 시도를 거부한다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.findOwnedJogak).mockResolvedValue(ownedJogak);
    jest.mocked(mogaks.listOccurrenceScheduleRows).mockResolvedValue([
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
    jest.mocked(mogaks.insertExecution).mockResolvedValue(null);
    jest.mocked(mogaks.findExecution).mockResolvedValue({
      id: 19,
      jogakId: 11,
      scheduledDate: '2026-07-23',
      status: 'SUCCESS',
      jogakTitleSnapshot: '문제 풀이',
    });
    const service = new JogaksService(mogaks, () => '2026-07-23');

    await expect(service.commandExecution(7, 11, '2026-07-23', 'IN_PROGRESS')).rejects.toEqual(
      new DomainException(DomainErrorCode.INVALID_EXECUTION_TRANSITION),
    );
  });

  it('실행 스냅샷을 덮어쓰지 않고 현재 조각 제목만 수정한다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.patchOwnedJogak).mockResolvedValue({
      ...ownedJogak,
      title: '수정된 문제 풀이',
    });
    const service = new JogaksService(mogaks, () => '2026-07-23');

    await expect(service.update(7, 11, { title: '수정된 문제 풀이' })).resolves.toMatchObject({
      jogakId: 11,
      title: '수정된 문제 풀이',
    });
    expect(mogaks.patchOwnedJogak).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, jogakId: 11, title: '수정된 문제 풀이' }),
    );
  });

  it('조각 상세에서 기존 일정 필드를 유지하며 일정 이력을 노출한다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.findOwnedJogak).mockResolvedValue(ownedJogak);
    jest.mocked(mogaks.listScheduleRowsForOwnedJogak).mockResolvedValue([
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
    jest.mocked(mogaks.listSuccessCounts).mockResolvedValue([{ jogakId: 11, achievements: 3 }]);
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

  it('조각 상세 대표 일정은 과거 Once보다 오늘 활성인 루틴을 우선한다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.findOwnedJogak).mockResolvedValue(ownedJogak);
    jest.mocked(mogaks.listScheduleRowsForOwnedJogak).mockResolvedValue([
      {
        scheduleId: 4,
        jogakId: 11,
        mogakId: 3,
        mogakTitle: '여름 목표',
        jogakTitle: '문제 풀이',
        color: 'blue',
        categoryCode: 'CERTIFICATION',
        categoryName: '자격증',
        customCategoryName: null,
        scheduleType: 'ONCE',
        effectiveFrom: '2026-07-22',
        effectiveTo: null,
        weekday: null,
      },
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
    jest.mocked(mogaks.listSuccessCounts).mockResolvedValue([]);
    const service = new JogaksService(mogaks, () => '2026-07-23');

    await expect(service.getDetail(7, 11)).resolves.toMatchObject({
      isRoutine: true,
      days: ['THURSDAY'],
      startDate: '2026-07-20',
      endDate: null,
    });
  });

  it('소유 조건이 맞지 않으면 조각 삭제를 성공으로 반환하지 않는다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.deleteOwnedJogak).mockResolvedValue(false);
    const service = new JogaksService(mogaks, () => '2026-07-23');

    await expect(service.delete(7, 11)).rejects.toEqual(
      new DomainException(DomainErrorCode.JOGAK_NOT_FOUND),
    );
  });

  it('후속 일정이 있으면 KST 오늘 활성인 주간 일정의 생략된 종료일을 전날로 보정한다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.findOwnedJogak).mockResolvedValue(ownedJogak);
    jest.mocked(mogaks.listScheduleRowsForOwnedJogak).mockResolvedValue([
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
        weekday: 'MONDAY',
      },
      {
        scheduleId: 6,
        jogakId: 11,
        mogakId: 3,
        mogakTitle: '여름 목표',
        jogakTitle: '문제 풀이',
        color: 'blue',
        categoryCode: 'CERTIFICATION',
        categoryName: '자격증',
        customCategoryName: null,
        scheduleType: 'WEEKLY',
        effectiveFrom: '2026-08-01',
        effectiveTo: null,
        weekday: 'THURSDAY',
      },
    ]);
    jest.mocked(mogaks.patchOwnedJogak).mockResolvedValue({
      ...ownedJogak,
    });
    const service = new JogaksService(mogaks, () => '2026-07-23');

    await expect(
      service.update(7, 11, {
        schedule: {
          scheduleType: 'WEEKLY',
          weekdays: ['THURSDAY', 'FRIDAY'],
        },
      }),
    ).resolves.toMatchObject({ jogakId: 11, title: '문제 풀이' });
    expect(mogaks.patchOwnedJogak).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        jogakId: 11,
        schedule: {
          scheduleId: 5,
          scheduleType: 'WEEKLY',
          effectiveFrom: '2026-07-20',
          effectiveTo: '2026-07-31',
          weekdays: ['THURSDAY', 'FRIDAY'],
        },
      }),
    );
  });

  it('후속 일정 시작일 이후의 명시적 종료일은 J009으로 거부한다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.findOwnedJogak).mockResolvedValue(ownedJogak);
    jest.mocked(mogaks.listScheduleRowsForOwnedJogak).mockResolvedValue([
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
        weekday: 'MONDAY',
      },
      {
        scheduleId: 6,
        jogakId: 11,
        mogakId: 3,
        mogakTitle: '여름 목표',
        jogakTitle: '문제 풀이',
        color: 'blue',
        categoryCode: 'CERTIFICATION',
        categoryName: '자격증',
        customCategoryName: null,
        scheduleType: 'WEEKLY',
        effectiveFrom: '2026-08-01',
        effectiveTo: null,
        weekday: 'THURSDAY',
      },
    ]);
    const service = new JogaksService(mogaks, () => '2026-07-23');

    await expect(
      service.update(7, 11, {
        schedule: {
          scheduleType: 'WEEKLY',
          effectiveTo: '2026-08-01',
          weekdays: ['THURSDAY'],
        },
      }),
    ).rejects.toEqual(new DomainException(DomainErrorCode.INVALID_SCHEDULE));
    expect(mogaks.patchOwnedJogak).not.toHaveBeenCalled();
  });

  it('요일과 무관하게 KST 오늘의 한 번 일정을 수정 대상으로 선택한다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.findOwnedJogak).mockResolvedValue(ownedJogak);
    jest.mocked(mogaks.listScheduleRowsForOwnedJogak).mockResolvedValue([
      {
        scheduleId: 9,
        jogakId: 11,
        mogakId: 3,
        mogakTitle: '여름 목표',
        jogakTitle: '문제 풀이',
        color: 'blue',
        categoryCode: 'CERTIFICATION',
        categoryName: '자격증',
        customCategoryName: null,
        scheduleType: 'ONCE',
        effectiveFrom: '2026-07-23',
        effectiveTo: null,
        weekday: null,
      },
    ]);
    jest.mocked(mogaks.patchOwnedJogak).mockResolvedValue(ownedJogak);
    const service = new JogaksService(mogaks, () => '2026-07-23');

    await service.update(7, 11, { schedule: { scheduleType: 'ONCE', weekdays: [] } });

    expect(mogaks.patchOwnedJogak).toHaveBeenCalledWith(
      expect.objectContaining({ schedule: expect.objectContaining({ scheduleId: 9 }) }),
    );
  });

  it('KST 오늘 활성 일정이 없으면 J009으로 거부한다', async () => {
    const mogaks = repository();
    jest.mocked(mogaks.findOwnedJogak).mockResolvedValue(ownedJogak);
    jest.mocked(mogaks.listScheduleRowsForOwnedJogak).mockResolvedValue([]);
    const service = new JogaksService(mogaks, () => '2026-07-23');

    await expect(
      service.update(7, 11, { schedule: { scheduleType: 'ONCE', weekdays: [] } }),
    ).rejects.toEqual(new DomainException(DomainErrorCode.INVALID_SCHEDULE));
    expect(mogaks.patchOwnedJogak).not.toHaveBeenCalled();
  });
});
