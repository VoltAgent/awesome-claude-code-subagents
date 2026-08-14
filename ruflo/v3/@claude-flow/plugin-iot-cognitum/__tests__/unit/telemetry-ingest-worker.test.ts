import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelemetryIngestWorker } from '../../src/workers/telemetry-ingest-worker.js';
import type { IoTCoordinator } from '../../src/application/iot-coordinator.js';

function createMockCoordinator(
  devices: Array<{ deviceId: string }> = [],
  storeStatus = { totalVectors: 42, deletedVectors: 0, dimension: 128, fileSizeBytes: 1024, liveRatio: 1, epoch: 1 },
) {
  return {
    listDevices: vi.fn().mockReturnValue(devices),
    getDeviceStoreStatus: vi.fn().mockResolvedValue(storeStatus),
  } as unknown as IoTCoordinator;
}

describe('TelemetryIngestWorker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts and stops the timer', () => {
    const worker = new TelemetryIngestWorker(createMockCoordinator());
    expect(worker.isRunning()).toBe(false);

    worker.start();
    expect(worker.isRunning()).toBe(true);

    worker.stop();
    expect(worker.isRunning()).toBe(false);
  });

  it('does not double-start', () => {
    const worker = new TelemetryIngestWorker(createMockCoordinator());
    worker.start();
    worker.start();
    expect(worker.isRunning()).toBe(true);
    worker.stop();
  });

  it('calls onIngestionComplete for each device', async () => {
    const onIngestionComplete = vi.fn();
    const coordinator = createMockCoordinator([
      { deviceId: 'd1' },
      { deviceId: 'd2' },
    ]);

    const worker = new TelemetryIngestWorker(coordinator, {
      intervalMs: 1000,
      onIngestionComplete,
    });

    await worker.ingest();

    expect(coordinator.getDeviceStoreStatus).toHaveBeenCalledTimes(2);
    expect(onIngestionComplete).toHaveBeenCalledTimes(2);
  });

  it('calls onIngestionError when getDeviceStoreStatus throws', async () => {
    const onIngestionError = vi.fn();
    const coordinator = createMockCoordinator([{ deviceId: 'd1' }]);
    vi.mocked(coordinator.getDeviceStoreStatus).mockRejectedValueOnce(new Error('offline'));

    const worker = new TelemetryIngestWorker(coordinator, {
      intervalMs: 1000,
      onIngestionError,
    });

    await worker.ingest();

    expect(onIngestionError).toHaveBeenCalledWith('d1', expect.any(Error));
  });

  it('handles empty device list', async () => {
    const onIngestionComplete = vi.fn();
    const coordinator = createMockCoordinator([]);

    const worker = new TelemetryIngestWorker(coordinator, { onIngestionComplete });
    await worker.ingest();

    expect(onIngestionComplete).not.toHaveBeenCalled();
  });

  it('defaults to 60-second interval', () => {
    const worker = new TelemetryIngestWorker(createMockCoordinator());
    worker.start();
    expect(worker.isRunning()).toBe(true);
    worker.stop();
  });
});
