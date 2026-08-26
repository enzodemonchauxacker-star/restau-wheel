const fs = require('fs');
const path = require('path');

const WALLET_DIR = path.join(__dirname, 'wallet');

function decodePem(value, fallbackPath) {
  if (value && String(value).includes('BEGIN')) {
    return String(value).replace(/\\n/g, '\n');
  }
  if (value) {
    try {
      const decoded = Buffer.from(String(value), 'base64').toString('utf8');
      if (decoded.includes('BEGIN')) return decoded;
    } catch { /* ignore */ }
  }
  if (fallbackPath && fs.existsSync(fallbackPath)) {
    return fs.readFileSync(fallbackPath);
  }
  return null;
}

function walletConfigured() {
  return Boolean(
    process.env.APPLE_SIGNER_CERT &&
    process.env.APPLE_SIGNER_KEY &&
    (process.env.APPLE_PASS_TYPE_ID || process.env.APPLE_TEAM_ID)
  );
}

async function buildCartePass() {
  const { PKPass } = require('passkit-generator');

  const wwdr = decodePem(
    process.env.APPLE_WWDR,
    path.join(WALLET_DIR, 'AppleWWDRCAG4.pem')
  );
  const signerCert = decodePem(process.env.APPLE_SIGNER_CERT);
  const signerKey = decodePem(process.env.APPLE_SIGNER_KEY);

  if (!wwdr || !signerCert || !signerKey) {
    const err = new Error('Apple Wallet certificates missing');
    err.code = 'WALLET_CERTS';
    throw err;
  }

  const png = (name) => fs.readFileSync(path.join(WALLET_DIR, name));
  const passTypeId = process.env.APPLE_PASS_TYPE_ID || 'pass.com.restauwheel.carte';
  const teamId = process.env.APPLE_TEAM_ID || 'MXDHTPKQR7';

  const pass = new PKPass({
    'icon.png': png('icon.png'),
    'icon@2x.png': png('icon@2x.png'),
    'icon@3x.png': png('icon@3x.png'),
    'logo.png': png('logo.png'),
    'logo@2x.png': png('logo@2x.png'),
    'logo@3x.png': png('logo@3x.png'),
    'pass.json': Buffer.from(JSON.stringify({
      formatVersion: 1,
      passTypeIdentifier: passTypeId,
      serialNumber: 'enzo-demonchaux-acker',
      teamIdentifier: teamId,
      organizationName: 'Restau Wheel',
      description: 'Enzo Demonchaux-Acker – Restau Wheel',
      logoText: 'Restau Wheel',
      foregroundColor: 'rgb(255, 248, 231)',
      backgroundColor: 'rgb(10, 10, 10)',
      labelColor: 'rgb(255, 214, 10)',
      generic: {
        primaryFields: [
          { key: 'name', label: 'FONDATEUR', value: 'Enzo Demonchaux-Acker' },
        ],
        secondaryFields: [
          { key: 'phone', label: 'TÉLÉPHONE', value: '07 68 03 68 38' },
          { key: 'web', label: 'WEB', value: 'restauwheel.com' },
        ],
        auxiliaryFields: [
          { key: 'email', label: 'EMAIL', value: 'enzodemonchauxacker@gmail.com' },
        ],
        backFields: [
          { key: 'mail', label: 'Email', value: 'enzodemonchauxacker@gmail.com' },
          { key: 'tel', label: 'Téléphone', value: '+33 7 68 03 68 38' },
          { key: 'site', label: 'Site', value: 'https://restauwheel.com' },
          { key: 'note', label: 'Restau Wheel', value: 'Une roue sur chaque table. Vos clients scannent, jouent, reviennent.' },
        ],
      },
    })),
  }, {
    wwdr,
    signerCert,
    signerKey,
    signerKeyPassphrase: process.env.APPLE_SIGNER_KEY_PASSPHRASE || undefined,
  });

  pass.setBarcodes({
    message: 'https://restauwheel.com/carte',
    format: 'PKBarcodeFormatQR',
    messageEncoding: 'iso-8859-1',
    altText: 'restauwheel.com/carte',
  });

  return pass.getAsBuffer();
}

module.exports = { walletConfigured, buildCartePass };
