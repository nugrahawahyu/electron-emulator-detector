const electron = require('electron');

const si = require('systeminformation');

const app = electron.app;
const BrowserWindow = electron.BrowserWindow;

async function checkEmulator() {
  let isEmulator = false;
  let evidences = [];

  // 1. Check if running in development mode.
  if (!app.isPackaged) {
    isEmulator = true;
    evidences.push('app.isPackaged=false (development mode)');
  }
  if (process.env.NODE_ENV === 'development') {
    isEmulator = true;
    evidences.push('NODE_ENV=development');
  }

  // 2. Check system manufacturer/model for virtualization clues.
  try {
    const system = await si.system();
    const manufacturer = (system.manufacturer || '').toLowerCase();
    const model = (system.model || '').toLowerCase();
    const virtualizationIndicators = [
      'vmware', 'virtualbox', 'qemu', 'kvm', 'hyper-v', 'parallels',
      'xen', 'bhyve', 'bochs', 'acrn', 'oracle', 'azure'
    ];
    virtualizationIndicators.forEach(indicator => {
      if (manufacturer.includes(indicator) || model.includes(indicator)) {
        isEmulator = true;
        evidences.push(
          `Detected virtualization indicator: "${indicator}" in manufacturer/model (manufacturer: "${system.manufacturer}", model: "${system.model}")`
        );
      }
    });
  } catch (error) {
    evidences.push(`Error detecting system virtualization: ${error.message}`);
  }

  // 3. Check chassis information.
  try {
    const chassis = await si.chassis();
    if (chassis && chassis.type && chassis.type.toLowerCase().includes('virtual')) {
      isEmulator = true;
      evidences.push(`Chassis type indicates virtualization: "${chassis.type}"`);
    }
  } catch (error) {
    evidences.push(`Error retrieving chassis information: ${error.message}`);
  }

  // 4. Check CPU details.
  try {
    const cpu = await si.cpu();
    const cpuBrand = (cpu.brand || '').toLowerCase();
    if (cpuBrand.includes('virtual') || cpuBrand.includes('vmware') || cpuBrand.includes('qemu')) {
      isEmulator = true;
      evidences.push(`CPU brand indicates virtualization: "${cpu.brand}"`);
    }
  } catch (error) {
    evidences.push(`Error retrieving CPU information: ${error.message}`);
  }

  // 5. Check network interfaces for known virtual MAC address prefixes.
  try {
    const netInterfaces = await si.networkInterfaces();
    const virtualMacPrefixes = ['00:05:69', '00:0C:29', '00:1C:14', '00:50:56', '00:1C:42', '00:03:FF'];
    netInterfaces.forEach(iface => {
      if (iface.mac) {
        const macPrefix = iface.mac.substring(0, 8).toUpperCase();
        virtualMacPrefixes.forEach(prefix => {
          if (macPrefix === prefix) {
            isEmulator = true;
            evidences.push(
              `Network interface ${iface.iface} has MAC address ${iface.mac} with virtualization prefix (${prefix})`
            );
          }
        });
      }
    });
  } catch (error) {
    evidences.push(`Error retrieving network interface information: ${error.message}`);
  }

  // 6. Check BIOS information for virtualization keywords.
  try {
    const bios = await si.bios();
    const biosVendor = (bios.vendor || '').toLowerCase();
    const biosIndicators = ['virtual', 'vmware', 'qemu', 'virtualbox', 'xen', 'parallels'];
    biosIndicators.forEach(indicator => {
      if (biosVendor.includes(indicator)) {
        isEmulator = true;
        evidences.push(
          `BIOS vendor indicates virtualization: "${bios.vendor}" contains "${indicator}"`
        );
      }
    });
  } catch (error) {
    evidences.push(`Error retrieving BIOS information: ${error.message}`);
  }

  // 7. Check UUID information for virtualization clues.
  try {
    const uuidData = await si.uuid();
    if (uuidData && uuidData.os) {
      const uuidOs = uuidData.os.toLowerCase();
      if (uuidOs.includes('vmware') || uuidOs.includes('virtual') || uuidOs.includes('vbox')) {
        isEmulator = true;
        evidences.push(`UUID indicates virtualization: "${uuidData.os}"`);
      }
    }
  } catch (error) {
    evidences.push(`Error retrieving UUID information: ${error.message}`);
  }

  // 8. Check for Docker/container environment (Linux-specific).
  if (process.platform === 'linux') {
    try {
      const fs = require('fs').promises;
      const cgroup = await fs.readFile('/proc/1/cgroup', 'utf8');
      if (cgroup.includes('docker') || cgroup.includes('lxc')) {
        isEmulator = true;
        evidences.push('Detected container environment via /proc/1/cgroup');
      }
    } catch (error) {
      // /proc/1/cgroup may not be available on non-containerized systems.
    }
  }

  // 9. Check environment variables for container/emulator indicators.
  if (process.env.DOCKER_CONTAINER || process.env.CONTAINER) {
    isEmulator = true;
    evidences.push('Environment variable indicates container/emulator environment');
  }

  // Determine the operating system.
  let osName = '';
  switch (process.platform) {
    case 'win32':
      osName = 'Windows';
      break;
    case 'darwin':
      osName = 'macOS';
      break;
    default:
      osName = process.platform;
      break;
  }

  return { is_emulator: isEmulator, evidences, os: osName };
}

// Function to create an Electron window with a "Hello World" page.
function createWindow() {
  if (!BrowserWindow) {
    console.log("BrowserWindow is not available in Node.js mode.");
    return;
  }

  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      // Enable Node integration if needed.
      nodeIntegration: true,
    }
  });

  // Load a simple HTML page displaying "Hello World".
  win.loadURL(
    'data:text/html;charset=utf-8,' +
    encodeURIComponent(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Hello World</title>
            <style>
              body { display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; font-family: sans-serif; }
            </style>
          </head>
          <body>
            <h1>Hello World</h1>
          </body>
        </html>
      `)
  );
}

// When the app (or fallback) is ready, run the emulator check and create the window.
app.whenReady().then(async () => {
  const result = await checkEmulator();
  console.log(JSON.stringify(result, null, 2));

  if (BrowserWindow) {
    createWindow();
  } else {
    // In Node.js mode, simply print "Hello World" to the console.
    console.log("Hello World");
  }
});
