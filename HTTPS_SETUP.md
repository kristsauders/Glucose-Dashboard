# HTTPS Setup for iOS Notifications

## Overview
iOS requires HTTPS for service workers and push notifications. This setup uses a shared CA created on Mac and certificates generated on the Ubuntu development machine.

## What's Already Done
- ✅ CA created on Mac with mkcert
- ✅ CA files stored in `cert/ca/` directory
- ✅ CA installed and trusted on iPhone
- ✅ vite.config.ts configured to use HTTPS when certificates are present

## Setup on Ubuntu Machine (192.168.202.132)

### 1. Install mkcert
```bash
cd /tmp
wget https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-linux-amd64
chmod +x mkcert-v1.4.4-linux-amd64
sudo mv mkcert-v1.4.4-linux-amd64 /usr/local/bin/mkcert
```

### 2. Navigate to Project Directory
```bash
cd ~/T1D/glucose-dashboard
```

### 3. Set CAROOT to Use the Shared CA
```bash
export CAROOT="$PWD/cert/ca"
```

### 4. Install the CA (Trust It on This Machine)
```bash
mkcert -install
```

You should see output like:
```
The local CA is now installed in the system trust store! ⚡️
```

### 5. Generate the Certificate
```bash
mkcert -key-file cert/key.pem -cert-file cert/cert.pem 192.168.202.132 localhost
```

You should see output like:
```
Created a new certificate valid for the following names 📜
 - "192.168.202.132"
 - "localhost"

The certificate is at "cert/cert.pem" and the key at "cert/key.pem" ✅
```

### 6. Verify Files Exist
```bash
ls -la cert/
```

You should see:
```
cert/cert.pem     (the SSL certificate)
cert/key.pem      (the private key)
cert/ca/          (directory with CA files)
```

### 7. Start Vite Dev Server
```bash
cd glucose-dashboard
npm run dev
```

You should see:
```
✓ HTTPS enabled with local certificates
```

### 8. Test on iPhone
1. Open Safari on your iPhone
2. Navigate to `https://192.168.202.132:5173`
3. You should NOT see any security warnings (since you already trusted the CA)
4. Add the /chat page to your home screen
5. Grant notification permissions

## Troubleshooting

### "Site might be insecure" error
- This means the certificate doesn't exist yet or wasn't signed by the trusted CA
- Make sure you ran steps 3-5 with CAROOT set correctly

### Certificate not found
- Check that cert/cert.pem and cert/key.pem exist
- They should be in the root glucose-dashboard directory, not in cert/ca/

### CA not trusted
- On iPhone: Settings → General → About → Certificate Trust Settings
- Make sure "mkcert [your username]" is enabled

### Need to regenerate certificate
```bash
cd ~/T1D/glucose-dashboard
export CAROOT="$PWD/cert/ca"
rm cert/cert.pem cert/key.pem  # Remove old certificate
mkcert -key-file cert/key.pem -cert-file cert/cert.pem 192.168.202.132 localhost
```

## Git Configuration

The `.gitignore` should already be configured to:
- ✅ Track `cert/ca/` directory (so CA can be shared)
- ✅ Ignore `cert/cert.pem` and `cert/key.pem` (machine-specific certificates)

## One-Time Setup Script for Ubuntu

For convenience, you can run all steps at once:

```bash
#!/bin/bash
cd ~/T1D/glucose-dashboard
export CAROOT="$PWD/cert/ca"
mkcert -install
mkcert -key-file cert/key.pem -cert-file cert/cert.pem 192.168.202.132 localhost
echo "✓ Certificate generated successfully!"
echo "Now run: npm run dev"
```
