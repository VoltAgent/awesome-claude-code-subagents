import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WitnessAuditWorker } from '../../src/workers/witness-audit-worker.js';
import type { IoTCoordinator } from '../../src/application/iot-coordinator.js';

function makeCoordinator(overrides: Partial<IoTCoordinator> = {}): IoTCoordinator {
  return {
    listDevices: vi.fn().mockReturnValue([
      { deviceId: 'dev-001' },
    ]),
    getDeviceWitnessChain: vi.fn().mockResolvedValue({
      length: 3,
      entries: [
        { epoch: 1 },
        { epoch: 2 },
        { epoch: 3 },
      ],
    }),
    ...overrides,
  } as unknown as IoTCoordinator;
}

describe('WitnessAuditWorker', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('starts and stops cleanly', () => {
    const worker = new WitnessAuditWorker(makeCoordinator());
    expect(worker.isRunning()).toBe(false);
    worker.start();
    expect(worker.isRunning()).toBe(true);
    worker.stop();
    expect(worker.isRunning()).toBe(false);
  });

  it('does not start twice', () => {
    const worker = new WitnessAuditWorker(makeCoordinator());
    worker.start();
    worker.start();
    expect(worker.isRunning()).toBe(true);
    worker.stop();
  });

  it('calls onAuditComplete for contiguous chain', async () => {
    const onAuditComplete = vi.fn();
    const onGapDetected = vi.fn();
    const coord = makeCoordinator();
    const worker = new WitnessAuditWorker(coord, {
      intervalMs: 1000,
      onAuditComplete,
      onGapDetected,
    });
    worker.start();

    await vi.advanceTimersByTimeAsync(1000);

    expect(onAuditComplete).toHaveBeenCalledWith('dev-001', 3);
    expect(onGapDetected).not.toHaveBeenCalled();
    worker.stop();
  });

  it('detects epoch gaps in witness chain', async () => {
    const onGapDetected = vi.fn();
    const coord = makeCoordinator({
      getDeviceWitnessChain: vi.fn().mockResolvedValue({
        length: 5,
        entries: [
          { epoch: 1 },
          { epoch: 2 },
          { epoch: 5 },
        ],
      }),
    });

    const worker = new WitnessAuditWorker(coord, {
      intervalMs: 1000,
      onGapDetected,
    });
    worker.start();

    await vi.advanceTimersByTimeAsync(1000);

    expect(onGapDetected).toHaveBeenCalledWith('dev-001', 2, 5);
    worker.stop();
  });

  it('calls onAuditError when chain fetch fails', async () => {
    const onAuditError = vi.fn();
    const coord = makeCoordinator({
      getDeviceWitnessChain: vi.fn().mockRejectedValue(new Error('chain error')),
    });
    const worker = new WitnessAuditWorker(coord, {
      intervalMs: 1000,
      onAuditError,
    });
    worker.start();

    await vi.advanceTimersByTimeAsync(1000);

    expect(onAuditError).toHaveBeenCalledWith('dev-001', expect.any(Error));
    worker.stop();
  });

  it('handles empty chain entries', async () => {
    const onAuditComplete = vi.fn();
    const coord = makeCoordinator({
      getDeviceWitnessChain: vi.fn().mockResolvedValue({
        length: 0,
        entries: [],
      }),
    });
    const worker = new WitnessAuditWorker(coord, {
      intervalMs: 1000,
      onAuditComplete,
    });
    worker.start();

    await vi.advanceTimersByTimeAsync(1000);

    expect(onAuditComplete).toHaveBeenCalledWith('dev-001', 0);
    worker.stop();
  });

  it('audits multiple devices', async () => {
    const onAuditComplete = vi.fn();
    const coord = makeCoordinator({
      listDevices: vi.fn().mockReturnValue([
        { deviceId: 'dev-001' },
        { deviceId: 'dev-002' },
        { deviceId: 'dev-003' },
      ]),
    });

    const worker = new WitnessAuditWorker(coord, {
      intervalMs: 1000,
      onAuditComplete,
    });
    worker.start();

    await vi.advanceTimersByTimeAsync(1000);

    expect(onAuditComplete).toHaveBeenCalledTimes(3);
    worker.stop();
  });

  it('uses chain.length when available, falls back to entries.length', async () => {
    const onAuditComplete = vi.fn();
    const coord = makeCoordinator({
      getDeviceWitnessChain: vi.fn().mockResolvedValue({
        entries: [{ epoch: 1 }, { epoch: 2 }],
      }),
    });
    const worker = new WitnessAuditWorker(coord, {
      intervalMs: 1000,
      onAuditComplete,
    });
    worker.start();

    await vi.advanceTimersByTimeAsync(1000);

    expect(onAuditComplete).toHaveBeenCalledWith('dev-001', 2);
    worker.stop();
  });
});
