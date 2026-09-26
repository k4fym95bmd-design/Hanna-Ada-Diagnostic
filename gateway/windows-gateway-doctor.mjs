import os from 'node:os';

const report = {
  version: 1,
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  nodeMajor: Number(process.versions.node.split('.')[0]),
  totalRamGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
  serialportInstalled: false,
  ports: [],
  safe: true,
  writesEnabled: false,
  flashEnabled: false,
};

try {
  const { SerialPort } = await import('serialport');
  report.serialportInstalled = true;
  try {
    report.ports = (await SerialPort.list()).map(p => ({
      path: String(p.path || '').slice(0, 240),
      manufacturer: String(p.manufacturer || '').slice(0, 100),
      vendorId: p.vendorId || null,
      productId: p.productId || null,
    }));
  } catch (error) {
    report.portEnumerationError = String(error?.message || error);
  }
} catch (error) {
  report.serialportError = String(error?.message || error);
}

report.runtimeReady = report.nodeMajor >= 20 && report.totalRamGb >= 8;
report.gatewayReady = report.runtimeReady && report.serialportInstalled;
console.log(JSON.stringify(report, null, 2));

if (!report.runtimeReady || !report.serialportInstalled) process.exitCode = 2;
