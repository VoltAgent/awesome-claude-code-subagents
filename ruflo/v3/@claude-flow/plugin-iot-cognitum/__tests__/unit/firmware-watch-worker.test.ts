import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FirmwareWatchWorker } from '../../src/workers/firmware-watch-worker.js';
import type { IoTCoordinator } from '../../src/application/iot-coordinator.js';

function makeCoordinator(overrides: Partial<IoTCoordinator> = {}): IoTCoordinator {
  return {
    listDevices: vi.fn().mockReturnValue([
      { deviceId: 'dev-001' },
    ]),
    getDeviceStatus: vi.fn().mockResolvedValue({ firmwareVersion: '1.0.0' }),
    ...overrides,
  } as unknown as IoTCoordinator;
}

describe('FirmwareWatchWorker', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('starts and stops cleanly', () => {
    const worker = new FirmwareWatchWorker(makeCoordinator());
    expect(worker.isRunning()).toBe(false);
    worker.start();
    expect(worker.isRunning()).toBe(true);
    worker.stop();
    expect(worker.isRunning()).toBe(false);
  });

  it('does not start twice', () => {
    const worker = new FirmwareWatchWorker(makeCoordinator());
    worker.start();
    worker.start();
    expect(worker.isRunning()).toBe(true);
    worker.stop();
  });

  it('records initial firmware version without triggering mismatch', async () => {
    const onVersionMismatch = vi.fn();
    const coord = makeCoordinator();
    const worker = new FirmwareWatchWorker(coord, {
      intervalMs: 1000,
      onVersionMismatch,
    });
    worker.start();

    await vi.advanceTimersByTimeAsync(1000);

    expect(coord.getDeviceStatus).toHaveBeenCalledWith('dev-001');
    expect(onVersionMismatch).not.toHaveBeenCalled();
    worker.stop();
  });

  it('detects firmware version change', async () => {
    const onVersionMismatch = vi.fn();
    let callCount = 0;
    const coord = makeCoordinator({
      getDeviceStatus: vi.fn().mockImplementation(async () => {
        callCount++;
        return { firmwareVersion: callCount === 1 ? '1.0.0' : '2.0.0' };
      }),
    });

    const worker = new FirmwareWatchWorker(coord, {
      intervalMs: 1000,
      onVersionMismatch,
    });
    worker.start();

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onVersionMismatch).toHaveBeenCalledWith('dev-001', '1.0.0', '2.0.0');
    worker.stop();
  });

  it('calls onWatchError when status fetch fails', async () => {
    const onWatchError = vi.fn();
    const coord = makeCoordinator({
      getDeviceStatus: vi.fn().mockRejectedValue(new Error('timeout')),
    });
    const worker = new FirmwareWatchWorker(coord, {
      intervalMs: 1000,
      onWatchError,
    });
    worker.start();

    await vi.advanceTimersByTimeAsync(1000);

    expect(onWatchError).toHaveBeenCalledWith('dev-001', expect.any(Error));
    worker.stop();
  });

  it('tracks multiple devices independently', async () => {
    const onVersionMismatch = vi.fn();
    let dev1Calls = 0;
    let dev2Calls = 0;
    const coord = makeCoordinator({
      listDevices: vi.fn().mockReturnValue([
        { deviceId: 'dev-001' },
        { deviceId: 'dev-002' },
      ]),
      getDeviceStatus: vi.fn().mockImplementation(async (deviceId: string) => {
        if (deviceId === 'dev-001') {
          dev1Calls++;
          return { firmwareVersion: '1.0.0' };
        }
        dev2Calls++;
        return { firmwareVersion: dev2Calls === 1 ? '1.0.0' : '1.1.0' };
      }),
    });

    const worker = new FirmwareWatchWorker(coord, {
      intervalMs: 1000,
      onVersionMismatch,
    });
    worker.start();

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onVersionMismatch).toHaveBeenCalledTimes(1);
    expect(onVersionMismatch).toHaveBeenCalledWith('dev-002', '1.0.0', '1.1.0');
    worker.stop();
  });
});
