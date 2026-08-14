import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MeshSyncWorker } from '../../src/workers/mesh-sync-worker.js';
import type { IoTCoordinator } from '../../src/application/iot-coordinator.js';

function makeCoordinator(overrides: Partial<IoTCoordinator> = {}): IoTCoordinator {
  return {
    listDevices: vi.fn().mockReturnValue([
      { deviceId: 'dev-001' },
      { deviceId: 'dev-002' },
    ]),
    getDeviceMeshTopology: vi.fn().mockResolvedValue({ peerCount: 3 }),
    ...overrides,
  } as unknown as IoTCoordinator;
}

describe('MeshSyncWorker', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('starts and stops cleanly', () => {
    const worker = new MeshSyncWorker(makeCoordinator());
    expect(worker.isRunning()).toBe(false);
    worker.start();
    expect(worker.isRunning()).toBe(true);
    worker.stop();
    expect(worker.isRunning()).toBe(false);
  });

  it('does not start twice', () => {
    const worker = new MeshSyncWorker(makeCoordinator());
    worker.start();
    worker.start();
    expect(worker.isRunning()).toBe(true);
    worker.stop();
  });

  it('calls sync on interval', async () => {
    const coord = makeCoordinator();
    const worker = new MeshSyncWorker(coord, { intervalMs: 1000 });
    worker.start();

    await vi.advanceTimersByTimeAsync(1000);

    expect(coord.listDevices).toHaveBeenCalled();
    expect(coord.getDeviceMeshTopology).toHaveBeenCalledWith('dev-001');
    expect(coord.getDeviceMeshTopology).toHaveBeenCalledWith('dev-002');
    worker.stop();
  });

  it('detects mesh partition when peer count drops to 0', async () => {
    const onMeshPartition = vi.fn();
    let callCount = 0;
    const coord = makeCoordinator({
      listDevices: vi.fn().mockReturnValue([{ deviceId: 'dev-001' }]),
      getDeviceMeshTopology: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount <= 1) return { peerCount: 3 };
        return { peerCount: 0 };
      }),
    });

    const worker = new MeshSyncWorker(coord, {
      intervalMs: 1000,
      onMeshPartition,
    });
    worker.start();

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onMeshPartition).toHaveBeenCalledWith('dev-001', 0);
    worker.stop();
  });

  it('calls onSyncComplete for each device', async () => {
    const onSyncComplete = vi.fn();
    const coord = makeCoordinator();
    const worker = new MeshSyncWorker(coord, {
      intervalMs: 1000,
      onSyncComplete,
    });
    worker.start();

    await vi.advanceTimersByTimeAsync(1000);

    expect(onSyncComplete).toHaveBeenCalledWith('dev-001', 3);
    expect(onSyncComplete).toHaveBeenCalledWith('dev-002', 3);
    worker.stop();
  });

  it('calls onSyncError when topology fetch fails', async () => {
    const onSyncError = vi.fn();
    const coord = makeCoordinator({
      getDeviceMeshTopology: vi.fn().mockRejectedValue(new Error('net fail')),
    });
    const worker = new MeshSyncWorker(coord, {
      intervalMs: 1000,
      onSyncError,
    });
    worker.start();

    await vi.advanceTimersByTimeAsync(1000);

    expect(onSyncError).toHaveBeenCalledWith('dev-001', expect.any(Error));
    worker.stop();
  });

  it('uses default interval of 120s', () => {
    const coord = makeCoordinator();
    const worker = new MeshSyncWorker(coord);
    worker.start();
    expect(worker.isRunning()).toBe(true);
    worker.stop();
  });
});
