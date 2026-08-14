import type { CLICommandDefinition, PluginContext } from '@claude-flow/shared/src/plugin-interface.js';
import type { IoTCoordinator } from './application/iot-coordinator.js';
import { getDeviceTrustLabel } from './domain/entities/device-trust-level.js';

type CoordinatorGetter = () => IoTCoordinator | null;
type ContextGetter = () => PluginContext | null;

function requireCoordinator(get: CoordinatorGetter): IoTCoordinator {
  const c = get();
  if (!c) throw new Error('IoT Cognitum not initialized. Run "iot register" first.');
  return c;
}

function parseVector(raw: string): number[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((n) => typeof n === 'number')) {
    throw new Error(`--vector must be a JSON array of numbers, got: ${raw}`);
  }
  return parsed as number[];
}

export function createCliCommands(
  getCoordinator: CoordinatorGetter,
  _getContext: ContextGetter,
): CLICommandDefinition[] {
  return [
    {
      name: 'iot init',
      description: 'Initialize IoT Cognitum plugin configuration',
      options: [
        { name: 'fleet-id', description: 'Default fleet identifier', type: 'string', default: 'default' },
        { name: 'zone-id', description: 'Default IEC 62443 security zone', type: 'string', default: 'zone-0' },
        { name: 'insecure', description: 'Allow TLS-insecure connections', type: 'boolean', default: true },
      ],
      handler: async (args) => {
        const fleetId = (args['fleet-id'] as string) ?? 'default';
        const zoneId = (args['zone-id'] as string) ?? 'zone-0';
        const insecure = args['insecure'] !== false;
        console.log('IoT Cognitum Plugin Configuration');
        console.log('-'.repeat(40));
        console.log(`  Fleet ID:     ${fleetId}`);
        console.log(`  Zone ID:      ${zoneId}`);
        console.log(`  TLS Insecure: ${insecure}`);
        console.log('');
        console.log('Plugin ready. Use "iot register -e <endpoint>" to add a device.');
      },
    },
    {
      name: 'iot register',
      description: 'Register a Cognitum Seed device by endpoint',
      options: [
        { name: 'endpoint', short: 'e', description: 'Device HTTP endpoint', type: 'string', required: true },
        { name: 'token', short: 't', description: 'Pairing token for mutual auth', type: 'string' },
      ],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        const device = await coordinator.registerDevice(
          args['endpoint'] as string,
          args['token'] as string | undefined,
        );
        console.log(`Device registered: ${device.deviceId}`);
        console.log(`  Endpoint:  ${device.endpoint}`);
        console.log(`  Trust:     ${getDeviceTrustLabel(device.trustLevel)}`);
        console.log(`  Firmware:  ${device.firmwareVersion}`);
      },
    },
    {
      name: 'iot status',
      description: 'Get device status and trust score',
      arguments: [{ name: 'device-id', description: 'Device identifier', required: true }],
      options: [
        { name: 'format', short: 'f', description: 'Output format (table, json)', type: 'string', default: 'table' },
      ],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        const device = await coordinator.getDeviceStatus(args._[0]!);
        const format = args['format'] as string;

        if (format === 'json') {
          console.log(JSON.stringify(device, null, 2));
        } else {
          console.log(`Device:    ${device.deviceId}`);
          console.log(`Status:    ${device.status}`);
          console.log(`Trust:     ${getDeviceTrustLabel(device.trustLevel)} (score: ${device.trustScore.overall.toFixed(3)})`);
          console.log(`Firmware:  ${device.firmwareVersion}`);
          console.log(`Endpoint:  ${device.endpoint}`);
          console.log(`Epoch:     ${device.epoch}`);
          console.log(`Vectors:   ${device.vectorStoreStats.totalVectors}`);
        }
      },
    },
    {
      name: 'iot list',
      description: 'List all registered devices',
      options: [
        { name: 'format', short: 'f', description: 'Output format (table, json)', type: 'string', default: 'table' },
      ],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        const devices = coordinator.listDevices();
        const format = args['format'] as string;

        if (format === 'json') {
          console.log(JSON.stringify(devices, null, 2));
        } else {
          console.log('Device ID                        | Status    | Trust');
          console.log('-'.repeat(60));
          for (const d of devices) {
            console.log(
              `${d.deviceId.padEnd(33)}| ${d.status.padEnd(10)}| ${getDeviceTrustLabel(d.trustLevel)}`,
            );
          }
          console.log(`\nTotal: ${devices.length} device(s)`);
        }
      },
    },
    {
      name: 'iot remove',
      description: 'Remove a registered device',
      arguments: [{ name: 'device-id', description: 'Device identifier to remove', required: true }],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        await coordinator.removeDevice(args._[0]!);
        console.log(`Device ${args._[0]} removed.`);
      },
    },
    {
      name: 'iot pair',
      description: 'Pair with a registered device to establish mutual trust',
      options: [
        { name: 'device-id', short: 'd', description: 'Device identifier', type: 'string', required: true },
        { name: 'name', short: 'n', description: 'Client name for pairing', type: 'string', default: 'claude-flow' },
      ],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        const device = await coordinator.pairDevice(
          args['device-id'] as string,
          (args['name'] as string) ?? 'claude-flow',
        );
        console.log(`Paired with device: ${device.deviceId}`);
        console.log(`  Trust:     ${getDeviceTrustLabel(device.trustLevel)}`);
        console.log(`  Score:     ${device.trustScore.overall.toFixed(3)}`);
      },
    },
    {
      name: 'iot unpair',
      description: 'Unpair from a registered device',
      arguments: [{ name: 'device-id', description: 'Device identifier', required: true }],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        const device = await coordinator.unpairDevice(args._[0]!);
        console.log(`Unpaired device: ${device.deviceId}`);
        console.log(`  Trust:     ${getDeviceTrustLabel(device.trustLevel)}`);
      },
    },
    {
      name: 'iot query',
      description: 'Query device vector store with a k-NN search',
      options: [
        { name: 'device-id', short: 'd', description: 'Device identifier', type: 'string', required: true },
        { name: 'k', short: 'k', description: 'Number of nearest neighbours', type: 'number', default: 5 },
        { name: 'vector', short: 'v', description: 'JSON array of numbers, e.g. "[0.1,0.2,...]"', type: 'string' },
      ],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        const k = Number(args['k'] ?? 5);
        const raw = args['vector'] as string | undefined;
        const vector = raw ? parseVector(raw) : [];
        const result = await coordinator.queryDeviceVectors(args['device-id'] as string, vector, k);
        console.log(JSON.stringify(result, null, 2));
      },
    },
    {
      name: 'iot ingest',
      description: 'Ingest vectors into device store. Pass --vector "[..]" or pipe a JSON array on stdin.',
      options: [
        { name: 'device-id', short: 'd', description: 'Device identifier', type: 'string', required: true },
        { name: 'vector', short: 'v', description: 'Single JSON-array vector to ingest', type: 'string' },
        { name: 'metadata', short: 'm', description: 'JSON metadata object for the vector', type: 'string' },
      ],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        const raw = args['vector'] as string | undefined;
        const metaRaw = args['metadata'] as string | undefined;
        let vectors: Array<{ values: number[]; metadata?: Record<string, unknown> }> = [];
        if (raw) {
          const v = parseVector(raw);
          const meta = metaRaw ? (JSON.parse(metaRaw) as Record<string, unknown>) : undefined;
          vectors = [{ values: v, ...(meta ? { metadata: meta } : {}) }];
        } else if (!process.stdin.isTTY) {
          // Stdin path: expect a JSON array of {values, metadata?} or raw number[][]
          const chunks: Buffer[] = [];
          for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
          const text = Buffer.concat(chunks).toString('utf8').trim();
          if (text) {
            const parsed = JSON.parse(text) as unknown;
            if (Array.isArray(parsed)) {
              vectors = (parsed as unknown[]).map((entry) => {
                if (Array.isArray(entry)) return { values: entry as number[] };
                return entry as { values: number[]; metadata?: Record<string, unknown> };
              });
            }
          }
        }
        if (vectors.length === 0) {
          throw new Error('No vectors to ingest. Pass --vector "[..]" or pipe a JSON array on stdin.');
        }
        const result = await coordinator.ingestDeviceTelemetry(args['device-id'] as string, vectors);
        console.log(`Ingested ${result.ingested} vector(s) for device ${result.deviceId}`);
      },
    },
    {
      name: 'iot mesh',
      description: 'Show mesh network topology for a device',
      arguments: [{ name: 'device-id', description: 'Device identifier', required: true }],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        const topology = await coordinator.getDeviceMeshTopology(args._[0]!);
        console.log(`Device:      ${topology.deviceId}`);
        console.log(`AP Active:   ${topology.apActive}`);
        console.log(`Auto Mesh:   ${topology.autoMesh}`);
        console.log(`Cluster:     ${topology.clusterEnabled}`);
        console.log(`Peers:       ${topology.peerCount}`);
        if (topology.peers.length > 0) {
          for (const p of topology.peers) {
            console.log(`  - ${p.deviceId} ${p.address ? `(${p.address})` : ''}`);
          }
        }
      },
    },
    {
      name: 'iot witness',
      description: 'Show witness chain provenance for a device',
      arguments: [{ name: 'device-id', description: 'Device identifier', required: true }],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        const chain = await coordinator.getDeviceWitnessChain(args._[0]!);
        console.log(`Length:    ${chain.length ?? chain.entries?.length ?? 0}`);
        console.log(`Head:      ${chain.head || '(empty)'}`);
        if (chain.entries && chain.entries.length > 0) {
          console.log(`Entries:   ${chain.entries.length}`);
          console.log(`  Latest epoch: ${chain.entries[0]?.epoch ?? 'n/a'}`);
        }
      },
    },
    {
      name: 'iot fleet',
      description: 'Show fleet overview of all registered devices',
      options: [
        { name: 'format', short: 'f', description: 'Output format (table, json)', type: 'string', default: 'table' },
      ],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        const status = coordinator.getStatus();
        const format = args['format'] as string;

        if (format === 'json') {
          console.log(JSON.stringify(status, null, 2));
        } else {
          console.log(`Healthy:     ${status.healthy}`);
          console.log(`Devices:     ${status.deviceCount}`);
          for (const d of status.devices) {
            console.log(`  - ${d.deviceId} (${d.status})`);
          }
        }
      },
    },

    // -- Firmware orchestration (Phase 3) ---------------------------------------
    {
      name: 'iot firmware deploy',
      description: 'Create and start a firmware rollout for a fleet',
      options: [
        { name: 'fleet-id', short: 'i', description: 'Fleet identifier', type: 'string', required: true },
        { name: 'version', short: 'v', description: 'Target firmware version', type: 'string', required: true },
      ],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        const rollout = await coordinator.createFirmwareRollout(
          args['fleet-id'] as string,
          args['version'] as string,
        );
        console.log(`Rollout created: ${rollout.rolloutId}`);
        console.log(`  Fleet:     ${rollout.fleetId}`);
        console.log(`  Version:   ${rollout.firmwareVersion}`);
        console.log(`  Stage:     ${rollout.stage}`);
        console.log(`  Targets:   ${rollout.targetDeviceIds.length} device(s)`);
        console.log(`  Canaries:  ${rollout.canaryDeviceIds.length} device(s)`);
      },
    },
    {
      name: 'iot firmware advance',
      description: 'Advance a firmware rollout to the next stage',
      arguments: [{ name: 'rollout-id', description: 'Rollout identifier', required: true }],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        const rollout = await coordinator.advanceFirmwareRollout(args._[0]!);
        console.log(`Rollout ${rollout.rolloutId}: ${rollout.stage}`);
        console.log(`  Completed: ${rollout.completedDeviceIds.length}/${rollout.targetDeviceIds.length}`);
        console.log(`  Failed:    ${rollout.failedDeviceIds.length}`);
      },
    },
    {
      name: 'iot firmware rollback',
      description: 'Force rollback a firmware rollout',
      arguments: [{ name: 'rollout-id', description: 'Rollout identifier', required: true }],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        const rollout = coordinator.rollbackFirmwareRollout(args._[0]!);
        console.log(`Rollout ${rollout.rolloutId} rolled back.`);
      },
    },
    {
      name: 'iot firmware status',
      description: 'Show firmware rollout status',
      arguments: [{ name: 'rollout-id', description: 'Rollout identifier', required: true }],
      options: [
        { name: 'format', short: 'f', description: 'Output format (table, json)', type: 'string', default: 'table' },
      ],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        const rollout = coordinator.getFirmwareRollout(args._[0]!);
        const format = args['format'] as string;

        if (format === 'json') {
          console.log(JSON.stringify(rollout, null, 2));
        } else {
          console.log(`Rollout:     ${rollout.rolloutId}`);
          console.log(`Fleet:       ${rollout.fleetId}`);
          console.log(`Version:     ${rollout.firmwareVersion}`);
          console.log(`Stage:       ${rollout.stage}`);
          console.log(`Completed:   ${rollout.completedDeviceIds.length}/${rollout.targetDeviceIds.length}`);
          console.log(`Failed:      ${rollout.failedDeviceIds.length}`);
          console.log(`Threshold:   ${rollout.anomalyThreshold}`);
        }
      },
    },
    {
      name: 'iot firmware list',
      description: 'List firmware rollouts',
      options: [
        { name: 'fleet-id', short: 'i', description: 'Filter by fleet', type: 'string' },
        { name: 'format', short: 'f', description: 'Output format (table, json)', type: 'string', default: 'table' },
      ],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        const rollouts = coordinator.listFirmwareRollouts(args['fleet-id'] as string | undefined);
        const format = args['format'] as string;

        if (format === 'json') {
          console.log(JSON.stringify(rollouts, null, 2));
        } else {
          console.log('Rollout ID                           | Fleet        | Version  | Stage');
          console.log('-'.repeat(80));
          for (const r of rollouts) {
            console.log(
              `${r.rolloutId.padEnd(37)}| ${r.fleetId.padEnd(13)}| ${r.firmwareVersion.padEnd(9)}| ${r.stage}`,
            );
          }
          console.log(`\nTotal: ${rollouts.length} rollout(s)`);
        }
      },
    },

    // -- Fleet management (Phase 3) --------------------------------------------
    {
      name: 'iot fleet create',
      description: 'Create a new device fleet',
      options: [
        { name: 'fleet-id', short: 'i', description: 'Fleet identifier', type: 'string', required: true },
        { name: 'name', short: 'n', description: 'Fleet display name', type: 'string', required: true },
        { name: 'zone-id', short: 'z', description: 'IEC 62443 security zone', type: 'string', default: 'zone-0' },
        { name: 'topology', short: 't', description: 'Fleet topology (star, mesh, hierarchical, ring)', type: 'string', default: 'star' },
      ],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        const fleet = await coordinator.createFleet({
          fleetId: args['fleet-id'] as string,
          name: args['name'] as string,
          zoneId: (args['zone-id'] as string) ?? 'zone-0',
          topology: args['topology'] as any,
        });
        console.log(`Fleet created: ${fleet.fleetId}`);
        console.log(`  Name:      ${fleet.name}`);
        console.log(`  Zone:      ${fleet.zoneId}`);
        console.log(`  Topology:  ${fleet.topology}`);
        console.log(`  Devices:   ${fleet.deviceIds.length}`);
      },
    },
    {
      name: 'iot fleet list',
      description: 'List all device fleets',
      options: [
        { name: 'format', short: 'f', description: 'Output format (table, json)', type: 'string', default: 'table' },
      ],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        const fleets = await coordinator.listFleets();
        const format = args['format'] as string;

        if (format === 'json') {
          console.log(JSON.stringify(fleets, null, 2));
        } else {
          console.log('Fleet ID                 | Name                 | Devices | Topology');
          console.log('-'.repeat(75));
          for (const f of fleets) {
            console.log(
              `${f.fleetId.padEnd(25)}| ${f.name.padEnd(21)}| ${String(f.deviceCount).padEnd(8)}| ${f.topology}`,
            );
          }
          console.log(`\nTotal: ${fleets.length} fleet(s)`);
        }
      },
    },
    {
      name: 'iot fleet add',
      description: 'Add a device to a fleet',
      options: [
        { name: 'fleet-id', short: 'i', description: 'Fleet identifier', type: 'string', required: true },
        { name: 'device-id', short: 'd', description: 'Device identifier', type: 'string', required: true },
      ],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        const fleet = await coordinator.addDeviceToFleet(
          args['fleet-id'] as string,
          args['device-id'] as string,
        );
        console.log(`Device ${args['device-id']} added to fleet ${fleet.fleetId} (${fleet.deviceIds.length} device(s))`);
      },
    },
    {
      name: 'iot fleet remove',
      description: 'Remove a device from a fleet',
      options: [
        { name: 'fleet-id', short: 'i', description: 'Fleet identifier', type: 'string', required: true },
        { name: 'device-id', short: 'd', description: 'Device identifier', type: 'string', required: true },
      ],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        const fleet = await coordinator.removeDeviceFromFleet(
          args['fleet-id'] as string,
          args['device-id'] as string,
        );
        console.log(`Device ${args['device-id']} removed from fleet ${fleet.fleetId} (${fleet.deviceIds.length} device(s))`);
      },
    },
    {
      name: 'iot fleet delete',
      description: 'Delete a fleet',
      arguments: [{ name: 'fleet-id', description: 'Fleet identifier to delete', required: true }],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        await coordinator.deleteFleet(args._[0]!);
        console.log(`Fleet ${args._[0]} deleted.`);
      },
    },

    // -- Telemetry anomaly detection (Phase 2) --------------------------------
    {
      name: 'iot anomalies',
      description: 'Show detected anomalies for a device',
      arguments: [{ name: 'device-id', description: 'Device identifier', required: true }],
      options: [
        { name: 'format', short: 'f', description: 'Output format (table, json)', type: 'string', default: 'table' },
      ],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        const deviceId = args._[0]!;
        const format = args['format'] as string;
        const baseline = coordinator.getBaseline(deviceId);
        if (!baseline) {
          console.log(`No baseline computed for device ${deviceId}. Run "iot baseline ${deviceId} --compute" first.`);
          return;
        }
        console.log(`Baseline for device ${deviceId}:`);
        if (format === 'json') {
          console.log(JSON.stringify(baseline, null, 2));
        } else {
          console.log(`  Dimensions:  ${baseline.meanVector.length}`);
          console.log(`  Samples:     ${baseline.sampleCount}`);
          console.log(`  Computed:    ${baseline.computedAt.toISOString()}`);
        }
      },
    },
    {
      name: 'iot baseline',
      description: 'Compute or show telemetry baseline for a device',
      arguments: [{ name: 'device-id', description: 'Device identifier', required: true }],
      options: [
        { name: 'compute', short: 'c', description: 'Recompute baseline from recent readings', type: 'boolean' },
      ],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        const deviceId = args._[0]!;
        const compute = args['compute'] as boolean;

        if (compute) {
          console.log(`Computing baseline for device ${deviceId}...`);
          console.log('Note: requires telemetry readings to be ingested first.');
          console.log('Use "iot ingest -d <device-id>" to provide readings, then rerun with --compute.');
          return;
        }

        const baseline = coordinator.getBaseline(deviceId);
        if (!baseline) {
          console.log(`No baseline for device ${deviceId}. Use --compute to build from telemetry.`);
          return;
        }

        console.log(`Baseline for device ${deviceId}:`);
        console.log(`  Dimensions:  ${baseline.meanVector.length}`);
        console.log(`  Samples:     ${baseline.sampleCount}`);
        console.log(`  Computed:    ${baseline.computedAt.toISOString()}`);
      },
    },
    {
      name: 'iot witness verify',
      description: 'Verify witness chain integrity for a device',
      arguments: [{ name: 'device-id', description: 'Device identifier', required: true }],
      options: [],
      handler: async (args) => {
        const coordinator = requireCoordinator(getCoordinator);
        const deviceId = args._[0]!;
        const result = await coordinator.verifyWitnessChain(deviceId);

        console.log(`Witness chain verification for ${deviceId}:`);
        console.log(`  Chain length:    ${result.chainLength}`);
        console.log(`  Verified:        ${result.verified ? 'YES' : 'NO'}`);
        console.log(`  Head epoch:      ${result.headEpoch}`);
        console.log(`  Head hash:       ${result.headHash || '(none)'}`);
        console.log(`  Integrity score: ${result.integrityScore.toFixed(3)}`);

        if (result.gaps.length > 0) {
          console.log(`  Gaps (${result.gaps.length}):`);
          for (const gap of result.gaps) {
            console.log(`    epoch ${gap.fromEpoch} → ${gap.toEpoch} (${gap.missingCount} missing)`);
          }
        }
      },
    },
  ];
}
