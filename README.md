# QR Code Photo Upload Server

People scan a QR code, type their name, pick photos, and the photos are saved on this PC in
`C:\deepak sir\<Their Name>\`. There's no dashboard, database, or login.

## Project structure

```
photo_upload\
├─ config.js          ← settings: upload folder, port, limits
├─ server.js          ← Express + Multer server, QR generation
├─ public\index.html  ← the only page visitors see (upload form)
├─ package.json
├─ start.bat          ← double-click to start
└─ qr-code.png        ← created automatically on every start
```

## Install and run (PowerShell)

```powershell
node -v; npm -v                       # check Node.js / npm (Node 18+ needed)
cd "C:\Users\91931\Desktop\New folder (4)\photo_upload"
npm install                           # first time only
npm start                             # or: node server.js
```

You can also double-click **start.bat**. It installs the dependencies on the first run.

On startup the server:
- prints the upload URL and a QR code in the terminal,
- saves `qr-code.png` in this folder and opens it, ready to show or print.

Press **Ctrl+C** to stop the server.

## Settings (`config.js`)

| Setting | Default | Meaning |
|---|---|---|
| `uploadDir` | `C:\deepak sir` | Main photo folder. It must already exist. |
| `port` | `3000` | Server port |
| `maxFileSizeMB` | `50` | Max size per photo |
| `maxFiles` | `30` | Max photos per upload |
| `hostIp` | auto | Force the IP address used in the QR code |
| `publicUrl` | empty | HTTPS tunnel URL for the QR code (see below) |

Each setting can also be set with an environment variable, e.g. `$env:PORT=8080; npm start`.

## How files are saved

- Name "Rahul" → `C:\deepak sir\Rahul\`. If Rahul uploads again, the photos go into the same folder.
- Original filenames and extensions are kept. If a file with that name already exists, the new one
  becomes `IMG_1234 (1).jpg`, `IMG_1234 (2).jpg`, and so on. Existing files are never overwritten or deleted.
  Files are created with an exclusive-create flag, so this holds even when two uploads happen at the same moment.
- Names are made safe for Windows: illegal characters are removed, `../` tricks are blocked, and reserved
  names like `CON` are prefixed with `_`. Hindi and other non-English names work.
- Accepted types: JPG, JPEG, PNG, WebP, GIF, BMP, TIF/TIFF, HEIC, HEIF.
- If an upload fails (for example, a file is too large), only the files that upload created are removed.

## Local Wi-Fi access

1. **Find your PC's IP address:** run `ipconfig` in PowerShell and look under *Wireless LAN adapter Wi-Fi*
   for the **IPv4 Address** (e.g. `192.168.1.50`). The server detects this automatically and puts it in the QR code.
   If the wrong adapter is chosen (VPN, VirtualBox and so on), set `hostIp` in `config.js`.
2. **Set the Wi-Fi network as Private:** Settings → Network & internet → Wi-Fi → (your network) →
   Network profile type → **Private**. Only do this for a network you trust, such as home or office.
3. **Allow the port through Windows Firewall.** Run this in PowerShell **as Administrator**. The rule only allows your
   local network, on Private networks, on port 3000:
   ```powershell
   New-NetFirewallRule -DisplayName "Photo Upload Server (TCP 3000)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private -RemoteAddress LocalSubnet
   ```
   To remove it later:
   ```powershell
   Remove-NetFirewallRule -DisplayName "Photo Upload Server (TCP 3000)"
   ```
   If Windows shows an "Allow Node.js" pop-up the first time, tick **Private networks** only.
4. The QR code URL looks like `http://192.168.1.50:3000/`. Your IP can change after a router restart.
   The QR code is regenerated on each start, so print it again if the IP changes, or reserve the IP in your router.

## Testing with phones

The phone must be on the **same Wi-Fi** as the PC, not mobile data.

**Android:** Open the Camera app (or Google Lens) and point it at the QR code. Tap the link that appears.
Enter a name, tap *Tap to choose photos*, and pick photos from Gallery or Files. Tap **Upload**.

**iPhone:** Open the Camera app and point it at the QR code. Tap the yellow link banner, and the page opens in Safari.
Enter a name, tap *Tap to choose photos* → *Photo Library*, select photos, and tap **Add**, then **Upload**.
iPhones usually convert HEIC to JPG when uploading. Either way, both formats are accepted.

Then check `C:\deepak sir\<name>\` on the PC. The terminal also logs each upload.

**Troubleshooting:** If the page doesn't load on the phone, first open `http://localhost:3000` on the PC.
If that works, the problem is the firewall rule, the network profile not being Private, the phone being on
another network or guest Wi-Fi, or "client/AP isolation" being on in the router.

## Optional: uploads from outside your Wi-Fi (secure HTTPS tunnel)

Don't open ports on your router. Use a free **Cloudflare Tunnel** instead. It gives you an HTTPS URL and
makes only outbound connections from your PC.

```powershell
winget install --id Cloudflare.cloudflared          # one-time install
cloudflared tunnel --url http://localhost:3000      # keep this window open
```

The tunnel prints a URL like `https://random-words.trycloudflare.com`. In a **second** PowerShell window:

```powershell
cd "C:\Users\91931\Desktop\New folder (4)\photo_upload"
$env:PUBLIC_URL="https://random-words.trycloudflare.com"; npm start
```

Now the QR code points to the HTTPS address, and it works from any network. Notes:
- A quick tunnel URL changes every time you start it, so regenerate and reshare the QR code each time.
  For a permanent URL, create a named tunnel with a free Cloudflare account and your own domain.
- **Anyone with the link can upload** while the tunnel is running. Share it only with the people who need it,
  and close the tunnel window (Ctrl+C) when you're done.
- The firewall rule above isn't needed for the tunnel.
