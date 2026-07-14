import crypto from 'crypto';

// WARNING: Keep your private key secret! Never commit it to a public repository.
// This is the test private key we are currently using.
const PRIVATE_KEY_HEX = '302e020100300506032b6570042204202940fcf39e43975ece634ff8e0b8c1ec016bea96cf69e066e3096265f790efaa';

const args = process.argv.slice(2);
const userData = args[0];
const tier = args[1] || 'PRO';

if (!userData) {
    console.error('Usage: node scripts/generate-license.mjs <email_or_username> [tier]');
    console.error('Example: node scripts/generate-license.mjs john@example.com PRO');
    process.exit(1);
}

try {
    const priv = crypto.createPrivateKey({
        key: Buffer.from(PRIVATE_KEY_HEX, 'hex'),
        format: 'der',
        type: 'pkcs8'
    });

    const msg = Buffer.from(`${userData}|${tier}`);
    const sig = crypto.sign(null, msg, priv);
    const hexSig = sig.toString('hex');
    
    const payload = Buffer.from(`${userData}|${tier}|${hexSig}`).toString('base64');
    
    console.log('\n✅ License Key Generated Successfully!');
    console.log('--------------------------------------------------');
    console.log(`User: ${userData}`);
    console.log(`Tier: ${tier}`);
    console.log('--------------------------------------------------');
    console.log('\nProvide this activation key to the user:\n');
    console.log(payload);
    console.log('\n');

} catch (err) {
    console.error('Failed to generate license:', err.message);
}
