import type { MCPToolDefinition } from '@claude-flow/shared/src/plugin-interface.js';
import type { PluginContext } from '@claude-flow/shared/src/plugin-interface.js';
import type { IoTCoordinator } from './application/iot-coordinator.js';

type CoordinatorGetter = () => IoTCoordinator | null;
type ContextGetter = () => PluginContext | null;

function textResult(text: string, isError = false) {
  return { content: [{ type: 'text' as const, text }], isError };
}

export function createMcpTools(
  getCoordinator: CoordinatorGetter,
  _getContext: ContextGetter,
): MCPToolDefinition[] {
  function requireCoordinator(): IoTCoordinator {
    const c = getCoordinator();
    if (!c) throw new Error('IoT Cognitum not initialized');
    return c;
  }

  return [
    // -- Device lifecycle ----------------------------------------------------
    {
      name: 'iot_device_register',
      description: 'Register a Cognitum Seed device by endpoint',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          endpoint: { type: 'string', description: 'Device HTTP endpoint (e.g. http://169.254.42.1)' },
          pairingToken: { type: 'string', description: 'Optional pairing token for mutual auth' },
        },
        required: ['endpoint'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          const device = await coordinator.registerDevice(
            params['endpoint'] as string,
            params['pairingToken'] as string | undefined,
          );
          return textResult(JSON.stringify(device, null, 2));
        } catch (err) {
          return textResult(`Registration failed: ${(err as Error).message}`, true);
        }
      },
    },
    {
      name: 'iot_device_status',
      description: 'Get device status and trust score',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'Device identifier' },
        },
        required: ['deviceId'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          const status = await coordinator.getDeviceStatus(params['deviceId'] as string);
          return textResult(JSON.stringify(status, null, 2));
        } catch (err) {
          return textResult(`Status failed: ${(err as Error).message}`, true);
        }
      },
    },
    {
      name: 'iot_device_list',
      description: 'List all registered devices',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        try {
          const coordinator = requireCoordinator();
          const devices = coordinator.listDevices();
          return textResult(JSON.stringify(devices, null, 2));
        } catch (err) {
          return textResult(`List failed: ${(err as Error).message}`, true);
        }
      },
    },
    {
      name: 'iot_device_remove',
      description: 'Remove a registered device',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'Device identifier to remove' },
        },
        required: ['deviceId'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          await coordinator.removeDevice(params['deviceId'] as string);
          return textResult(`Device ${params['deviceId']} removed`);
        } catch (err) {
          return textResult(`Remove failed: ${(err as Error).message}`, true);
        }
      },
    },

    {
      name: 'iot_device_pair',
      description: 'Pair with a registered device to establish mutual trust',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'Device identifier' },
          clientName: { type: 'string', description: 'Client name for the pairing session' },
        },
        required: ['deviceId', 'clientName'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          const device = await coordinator.pairDevice(
            params['deviceId'] as string,
            params['clientName'] as string,
          );
          return textResult(JSON.stringify(device, null, 2));
        } catch (err) {
          return textResult(`Pairing failed: ${(err as Error).message}`, true);
        }
      },
    },
    {
      name: 'iot_device_unpair',
      description: 'Unpair from a registered device',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'Device identifier' },
        },
        required: ['deviceId'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          const device = await coordinator.unpairDevice(params['deviceId'] as string);
          return textResult(JSON.stringify(device, null, 2));
        } catch (err) {
          return textResult(`Unpair failed: ${(err as Error).message}`, true);
        }
      },
    },

    // -- Vector store --------------------------------------------------------
    {
      name: 'iot_store_query',
      description: 'Query device vector store',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'Device identifier' },
          vector: { type: 'array', description: 'Query vector', items: { type: 'number' } },
          k: { type: 'number', description: 'Number of nearest neighbours to return' },
        },
        required: ['deviceId', 'vector', 'k'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          const result = await coordinator.queryDeviceVectors(
            params['deviceId'] as string,
            params['vector'] as number[],
            params['k'] as number,
          );
          return textResult(JSON.stringify(result, null, 2));
        } catch (err) {
          return textResult(`Query failed: ${(err as Error).message}`, true);
        }
      },
    },
    {
      name: 'iot_store_ingest',
      description: 'Ingest vectors into device store',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'Device identifier' },
          vectors: {
            type: 'array',
            description: 'Array of vectors with optional metadata',
            items: {
              type: 'object',
              properties: {
                values: { type: 'array', description: 'Vector values', items: { type: 'number' } },
                metadata: { type: 'object', description: 'Optional metadata' },
              },
              required: ['values'],
            },
          },
        },
        required: ['deviceId', 'vectors'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          const result = await coordinator.ingestDeviceTelemetry(
            params['deviceId'] as string,
            params['vectors'] as Array<{ values: number[]; metadata?: Record<string, unknown> }>,
          );
          return textResult(JSON.stringify(result, null, 2));
        } catch (err) {
          return textResult(`Ingest failed: ${(err as Error).message}`, true);
        }
      },
    },
    {
      name: 'iot_store_status',
      description: 'Get vector store health',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'Device identifier' },
        },
        required: ['deviceId'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          const health = await coordinator.getDeviceStoreStatus(params['deviceId'] as string);
          return textResult(JSON.stringify(health, null, 2));
        } catch (err) {
          return textResult(`Store status failed: ${(err as Error).message}`, true);
        }
      },
    },

    // -- Mesh / witness / custody --------------------------------------------
    {
      name: 'iot_mesh_topology',
      description: 'Get mesh network topology',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'Device identifier' },
        },
        required: ['deviceId'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          const topology = await coordinator.getDeviceMeshTopology(params['deviceId'] as string);
          return textResult(JSON.stringify(topology, null, 2));
        } catch (err) {
          return textResult(`Mesh topology failed: ${(err as Error).message}`, true);
        }
      },
    },
    {
      name: 'iot_witness_chain',
      description: 'Get witness chain provenance',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'Device identifier' },
        },
        required: ['deviceId'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          const chain = await coordinator.getDeviceWitnessChain(params['deviceId'] as string);
          return textResult(JSON.stringify(chain, null, 2));
        } catch (err) {
          return textResult(`Witness chain failed: ${(err as Error).message}`, true);
        }
      },
    },
    {
      name: 'iot_custody_epoch',
      description: 'Get custody epoch',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'Device identifier' },
        },
        required: ['deviceId'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          const epoch = await coordinator.getDeviceCustodyEpoch(params['deviceId'] as string);
          return textResult(JSON.stringify(epoch, null, 2));
        } catch (err) {
          return textResult(`Custody epoch failed: ${(err as Error).message}`, true);
        }
      },
    },

    // -- Fleet ---------------------------------------------------------------
    {
      name: 'iot_fleet_status',
      description: 'Get fleet overview',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        try {
          const coordinator = requireCoordinator();
          const status = coordinator.getStatus();
          return textResult(JSON.stringify(status, null, 2));
        } catch (err) {
          return textResult(`Fleet status failed: ${(err as Error).message}`, true);
        }
      },
    },

    // -- Firmware orchestration (Phase 3) ---------------------------------------
    {
      name: 'iot_firmware_rollout_create',
      description: 'Create a firmware rollout for a fleet',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          fleetId: { type: 'string', description: 'Fleet identifier' },
          firmwareVersion: { type: 'string', description: 'Target firmware version' },
        },
        required: ['fleetId', 'firmwareVersion'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          const rollout = await coordinator.createFirmwareRollout(
            params['fleetId'] as string,
            params['firmwareVersion'] as string,
          );
          return textResult(JSON.stringify(rollout, null, 2));
        } catch (err) {
          return textResult(`Rollout create failed: ${(err as Error).message}`, true);
        }
      },
    },
    {
      name: 'iot_firmware_rollout_advance',
      description: 'Advance a firmware rollout to next stage',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          rolloutId: { type: 'string', description: 'Rollout identifier' },
        },
        required: ['rolloutId'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          const rollout = await coordinator.advanceFirmwareRollout(params['rolloutId'] as string);
          return textResult(JSON.stringify(rollout, null, 2));
        } catch (err) {
          return textResult(`Rollout advance failed: ${(err as Error).message}`, true);
        }
      },
    },
    {
      name: 'iot_firmware_rollout_rollback',
      description: 'Force rollback a firmware rollout',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          rolloutId: { type: 'string', description: 'Rollout identifier' },
        },
        required: ['rolloutId'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          const rollout = coordinator.rollbackFirmwareRollout(params['rolloutId'] as string);
          return textResult(JSON.stringify(rollout, null, 2));
        } catch (err) {
          return textResult(`Rollout rollback failed: ${(err as Error).message}`, true);
        }
      },
    },
    {
      name: 'iot_firmware_rollout_status',
      description: 'Get firmware rollout status',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          rolloutId: { type: 'string', description: 'Rollout identifier' },
        },
        required: ['rolloutId'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          const rollout = coordinator.getFirmwareRollout(params['rolloutId'] as string);
          return textResult(JSON.stringify(rollout, null, 2));
        } catch (err) {
          return textResult(`Rollout status failed: ${(err as Error).message}`, true);
        }
      },
    },
    {
      name: 'iot_firmware_rollout_list',
      description: 'List firmware rollouts',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          fleetId: { type: 'string', description: 'Optional fleet filter' },
        },
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          const rollouts = coordinator.listFirmwareRollouts(params['fleetId'] as string | undefined);
          return textResult(JSON.stringify(rollouts, null, 2));
        } catch (err) {
          return textResult(`Rollout list failed: ${(err as Error).message}`, true);
        }
      },
    },

    // -- Fleet management (Phase 3) --------------------------------------------
    {
      name: 'iot_fleet_create',
      description: 'Create a new device fleet',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          fleetId: { type: 'string', description: 'Fleet identifier' },
          name: { type: 'string', description: 'Fleet display name' },
          zoneId: { type: 'string', description: 'IEC 62443 security zone' },
          topology: { type: 'string', enum: ['star', 'mesh', 'hierarchical', 'ring'], description: 'Fleet topology' },
          description: { type: 'string', description: 'Fleet description' },
        },
        required: ['fleetId', 'name', 'zoneId'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          const fleet = await coordinator.createFleet({
            fleetId: params['fleetId'] as string,
            name: params['name'] as string,
            zoneId: params['zoneId'] as string,
            topology: params['topology'] as any,
            description: params['description'] as string | undefined,
          });
          return textResult(JSON.stringify(fleet, null, 2));
        } catch (err) {
          return textResult(`Fleet create failed: ${(err as Error).message}`, true);
        }
      },
    },
    {
      name: 'iot_fleet_get',
      description: 'Get fleet details',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          fleetId: { type: 'string', description: 'Fleet identifier' },
        },
        required: ['fleetId'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          const fleet = await coordinator.getFleet(params['fleetId'] as string);
          return textResult(JSON.stringify(fleet, null, 2));
        } catch (err) {
          return textResult(`Fleet get failed: ${(err as Error).message}`, true);
        }
      },
    },
    {
      name: 'iot_fleet_list',
      description: 'List all fleets',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        try {
          const coordinator = requireCoordinator();
          const fleets = await coordinator.listFleets();
          return textResult(JSON.stringify(fleets, null, 2));
        } catch (err) {
          return textResult(`Fleet list failed: ${(err as Error).message}`, true);
        }
      },
    },
    {
      name: 'iot_fleet_add_device',
      description: 'Add a registered device to a fleet',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          fleetId: { type: 'string', description: 'Fleet identifier' },
          deviceId: { type: 'string', description: 'Device identifier' },
        },
        required: ['fleetId', 'deviceId'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          const fleet = await coordinator.addDeviceToFleet(
            params['fleetId'] as string,
            params['deviceId'] as string,
          );
          return textResult(JSON.stringify(fleet, null, 2));
        } catch (err) {
          return textResult(`Fleet add device failed: ${(err as Error).message}`, true);
        }
      },
    },
    {
      name: 'iot_fleet_remove_device',
      description: 'Remove a device from a fleet',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          fleetId: { type: 'string', description: 'Fleet identifier' },
          deviceId: { type: 'string', description: 'Device identifier' },
        },
        required: ['fleetId', 'deviceId'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          const fleet = await coordinator.removeDeviceFromFleet(
            params['fleetId'] as string,
            params['deviceId'] as string,
          );
          return textResult(JSON.stringify(fleet, null, 2));
        } catch (err) {
          return textResult(`Fleet remove device failed: ${(err as Error).message}`, true);
        }
      },
    },
    {
      name: 'iot_fleet_delete',
      description: 'Delete a fleet',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          fleetId: { type: 'string', description: 'Fleet identifier' },
        },
        required: ['fleetId'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          await coordinator.deleteFleet(params['fleetId'] as string);
          return textResult(`Fleet ${params['fleetId']} deleted`);
        } catch (err) {
          return textResult(`Fleet delete failed: ${(err as Error).message}`, true);
        }
      },
    },

    // -- Telemetry anomaly detection (Phase 2) --------------------------------
    {
      name: 'iot_telemetry_anomalies',
      description: 'Detect anomalies in device telemetry readings',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'Device identifier' },
          readings: {
            type: 'array',
            description: 'Telemetry readings to analyze',
            items: {
              type: 'object',
              properties: {
                readingId: { type: 'string' },
                vector: { type: 'array', items: { type: 'number' } },
                rawMetrics: { type: 'object' },
              },
              required: ['readingId', 'vector'],
            },
          },
        },
        required: ['deviceId', 'readings'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          const deviceId = params['deviceId'] as string;
          const rawReadings = params['readings'] as Array<{
            readingId: string;
            vector: number[];
            rawMetrics?: Record<string, number>;
          }>;
          const readings = rawReadings.map((r) => ({
            readingId: r.readingId,
            deviceId,
            fleetId: '',
            timestamp: new Date(),
            vector: r.vector,
            rawMetrics: r.rawMetrics ?? {},
            anomalyScore: 0,
            metadata: {},
          }));
          const result = coordinator.detectAnomalies(deviceId, readings);
          return textResult(JSON.stringify(result, null, 2));
        } catch (err) {
          return textResult(`Anomaly detection failed: ${(err as Error).message}`, true);
        }
      },
    },
    {
      name: 'iot_telemetry_baseline',
      description: 'Compute or retrieve telemetry baseline for a device',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'Device identifier' },
          action: {
            type: 'string',
            enum: ['compute', 'get'],
            description: 'Compute new baseline or get existing',
          },
        },
        required: ['deviceId'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          const deviceId = params['deviceId'] as string;
          const action = (params['action'] as string) ?? 'get';

          if (action === 'get') {
            const baseline = coordinator.getBaseline(deviceId);
            if (!baseline) {
              return textResult(JSON.stringify({ deviceId, status: 'no-baseline' }));
            }
            return textResult(JSON.stringify(baseline, null, 2));
          }

          return textResult(JSON.stringify({
            deviceId,
            status: 'compute-requires-readings',
            hint: 'Use iot_telemetry_anomalies with readings to build baseline first',
          }));
        } catch (err) {
          return textResult(`Baseline failed: ${(err as Error).message}`, true);
        }
      },
    },
    {
      name: 'iot_witness_verify',
      description: 'Verify witness chain integrity for a device — detects epoch gaps and hash chain breaks',
      pluginName: '@claude-flow/plugin-iot-cognitum',
      version: '1.0.0-alpha.1',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'Device identifier' },
        },
        required: ['deviceId'],
      },
      handler: async (params) => {
        try {
          const coordinator = requireCoordinator();
          const result = await coordinator.verifyWitnessChain(params['deviceId'] as string);
          return textResult(JSON.stringify(result, null, 2));
        } catch (err) {
          return textResult(`Witness verification failed: ${(err as Error).message}`, true);
        }
      },
    },
  ];
}
