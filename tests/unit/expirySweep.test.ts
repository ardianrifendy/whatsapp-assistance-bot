import { describe, it, expect, vi } from 'vitest';
import { sweepExpiredSessions, startExpirySweep } from '../../src/conversation-session/expirySweep.js';
import type { SessionService } from '../../src/types/session.js';

function fakeService(sweepExpired: () => Promise<number>): SessionService {
  return {
    createConfirmation: vi.fn(),
    getSession: vi.fn(),
    resolveByQuotedReply: vi.fn(),
    getActiveSessionForUser: vi.fn(),
    completeSession: vi.fn(),
    cancelSession: vi.fn(),
    attachAnchor: vi.fn(),
    sweepExpired,
  };
}

describe('sweepExpiredSessions', () => {
  it('delegates to SessionService.sweepExpired and returns its count', async () => {
    const sweepExpired = vi.fn(async () => 3);
    const count = await sweepExpiredSessions(fakeService(sweepExpired));
    expect(sweepExpired).toHaveBeenCalledTimes(1);
    expect(count).toBe(3);
  });
});

describe('startExpirySweep', () => {
  it('does nothing until the interval elapses, then calls sweepExpired on tick, and stops cleanly', async () => {
    vi.useFakeTimers();
    try {
      const sweepExpired = vi.fn(async () => 0);
      const stop = startExpirySweep(fakeService(sweepExpired), 1000);

      expect(sweepExpired).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1000);
      expect(sweepExpired).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(2000);
      expect(sweepExpired).toHaveBeenCalledTimes(3);

      stop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(sweepExpired).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not throw the process down when sweepExpired rejects', async () => {
    vi.useFakeTimers();
    try {
      const sweepExpired = vi.fn(async () => {
        throw new Error('db unavailable');
      });
      const stop = startExpirySweep(fakeService(sweepExpired), 1000);
      await vi.advanceTimersByTimeAsync(1000);
      expect(sweepExpired).toHaveBeenCalledTimes(1);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
