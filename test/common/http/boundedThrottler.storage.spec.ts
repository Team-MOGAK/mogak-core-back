import { jest } from '@jest/globals';

import { BoundedThrottlerStorage } from '../../../src/common/http/boundedThrottler.storage';

describe('BoundedThrottlerStorage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('한 키의 차단 만료가 다른 키의 만료와 차단 상태를 바꾸지 않는다', async () => {
    const storage = new BoundedThrottlerStorage();

    await storage.increment('ip-a', 60_000, 1, 60_000, 'default');
    jest.advanceTimersByTime(1);
    expect(await storage.increment('ip-a', 60_000, 1, 60_000, 'default')).toMatchObject({
      totalHits: 2,
      isBlocked: true,
    });

    jest.advanceTimersByTime(1);
    await storage.increment('ip-b', 60_000, 1, 60_000, 'default');

    jest.advanceTimersByTime(59_999);
    expect(await storage.increment('ip-a', 60_000, 1, 60_000, 'default')).toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });

    jest.advanceTimersByTime(1);
    expect(await storage.increment('ip-b', 60_000, 1, 60_000, 'default')).toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });
  });

  it('윈도우가 끝난 키는 메모리에서 제거한다', async () => {
    const storage = new BoundedThrottlerStorage();

    await storage.increment('ip-a', 1_000, 1, 1_000, 'default');
    expect(storage.entryCount).toBe(1);

    jest.advanceTimersByTime(1_000);

    expect(storage.entryCount).toBe(0);
  });

  it('서로 다른 키가 많아도 지정한 메모리 상한을 넘지 않는다', async () => {
    const storage = new BoundedThrottlerStorage({ maxEntries: 2 });

    await storage.increment('oldest', 60_000, 1, 60_000, 'default');
    await storage.increment('middle', 60_000, 1, 60_000, 'default');
    await storage.increment('newest', 60_000, 1, 60_000, 'default');

    expect(storage.entryCount).toBe(2);
    expect(await storage.increment('oldest', 60_000, 1, 60_000, 'default')).toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });
  });
});
