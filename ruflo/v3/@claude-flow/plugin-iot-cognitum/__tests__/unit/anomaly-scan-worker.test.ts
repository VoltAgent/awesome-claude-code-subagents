import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnomalyScanWorker } from '../../src/workers/anomaly-scan-worker.js';
import type { IoTCoordinator } from '../../src/application/iot-coordinator.js';

function createMockCoordinator(
  devices: Array<{ deviceId: string; trustScore: { overall: number } }> = [],
) {
  return {
    listDevices: vi.fn().mockReturnValue(devices),
    getDeviceStatus: vi.fn().mockImplementation(async (id: string) => {
      const dev = devices.find((d) => d.deviceId === id);
      return dev ?? { deviceId: id, trustScore: { overall: 1 } };
    }),
  } as unknown as IoTCoordinator;
}

describe('AnomalyScanWorker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts and stops the timer', () => {
    const worker = new AnomalyScanWorker(createMockCoordinator());
    expect(worker.isRunning()).toBe(false);

    worker.start();
    expect(worker.isRunning()).toBe(true);

    worker.stop();
    expect(worker.isRunning()).toBe(false);
  });

  it('does not double-start', () => {
    const worker = new AnomalyScanWorker(createMockCoordinator());
    worker.start();
    worker.start();
    expect(worker.isRunning()).toBe(true);
    worker.stop();
  });

  it('calls onAnomalyDetected when trust score < 0.5', async () => {
    const onAnomalyDetected = vi.fn();
    const coordinator = createMockCoordinator([
      { deviceId: 'd1', trustScore: { overall: 0.3 } },
    ]);

    const worker = new AnomalyScanWorker(coordinator, {
      intervalMs: 1000,
      onAnomalyDetected,
    });

    await worker.scan();

    expect(coordinator.getDeviceStatus).toHaveBeenCalledWith('d1');
    expect(onAnomalyDetected).toHaveBeenCalledWith('d1', 0.3);
  });

  it('does not fire callback for healthy devices', async () => {
    const onAnomalyDetected = vi.fn();
    const coordinator = createMockCoordinator([
      { deviceId: 'd1', trustScore: { overall: 0.8 } },
    ]);

    const worker = new AnomalyScanWorker(coordinator, {
      intervalMs: 1000,
      onAnomalyDetected,
    });

    await worker.scan();

    expect(onAnomalyDetected).not.toHaveBeenCalled();
  });

  it('calls onScanError when getDeviceStatus throws', async () => {
    const onScanError = vi.fn();
    const coordinator = createMockCoordinator([
      { deviceId: 'd1', trustScore: { overall: 1 } },
    ]);
    vi.mocked(coordinator.getDeviceStatus).mockRejectedValueOnce(new Error('timeout'));

    const worker = new AnomalyScanWorker(coordinator, {
      intervalMs: 1000,
      onScanError,
    });

    await worker.scan();

    expect(onScanError).toHaveBeenCalledWith('d1', expect.any(Error));
  });

  it('scans multiple devices', async () => {
    const onAnomalyDetected = vi.fn();
    const coordinator = createMockCoordinator([
      { deviceId: 'd1', trustScore: { overall: 0.2 } },
      { deviceId: 'd2', trustScore: { overall: 0.9 } },
      { deviceId: 'd3', trustScore: { overall: 0.4 } },
    ]);

    const worker = new AnomalyScanWorker(coordinator, { onAnomalyDetected });
    await worker.scan();

    expect(onAnomalyDetected).toHaveBeenCalledTimes(2);
    expect(onAnomalyDetected).toHaveBeenCalledWith('d1', 0.2);
    expect(onAnomalyDetected).toHaveBeenCalledWith('d3', 0.4);
  });

  it('defaults to 5-minute interval', () => {
    const worker = new AnomalyScanWorker(createMockCoordinator());
    worker.start();
    expect(worker.isRunning()).toBe(true);
    worker.stop();
  });
});
