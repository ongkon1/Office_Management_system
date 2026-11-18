import { connect } from 'node:net';
import type { Readable } from 'node:stream';

/**
 * Malware scanning integration point (`BE-0710`, `BE-0011`).
 *
 * A file is unavailable until a scanner says it is clean. With no scanner
 * configured in production, uploads stay `pending` and nobody can download
 * them — deny by default, rather than shipping unscanned files.
 */
export type ScanVerdict =
  | { readonly verdict: 'clean' }
  | { readonly verdict: 'infected'; readonly code: string }
  | { readonly verdict: 'error'; readonly code: string };

export interface MalwareScanner {
  scan(body: Readable): Promise<ScanVerdict>;
}

/** The industry-standard harmless test signature. */
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

/**
 * Development and test only. Recognizes the EICAR test file so the rejection
 * path can be exercised; it is not protection and is refused in production.
 */
export class TestSignatureScanner implements MalwareScanner {
  async scan(body: Readable): Promise<ScanVerdict> {
    let tail = '';
    for await (const chunk of body) {
      const text = tail + Buffer.from(chunk as Buffer).toString('latin1');
      if (text.includes(EICAR)) { body.destroy(); return { verdict: 'infected', code: 'eicar_test_signature' }; }
      tail = text.slice(-EICAR.length);
    }
    return { verdict: 'clean' };
  }
}

/**
 * ClamAV `clamd` over TCP using the INSTREAM protocol: the file is streamed in
 * length-prefixed chunks and never written to the scanner's disk.
 */
export class ClamAvScanner implements MalwareScanner {
  constructor(private readonly host: string, private readonly port: number, private readonly timeoutMs = 60_000) {}
  scan(body: Readable): Promise<ScanVerdict> {
    return new Promise((resolvePromise) => {
      const socket = connect({ host: this.host, port: this.port });
      let reply = '';
      let settled = false;
      const done = (verdict: ScanVerdict) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        body.destroy();
        resolvePromise(verdict);
      };
      socket.setTimeout(this.timeoutMs, () => done({ verdict: 'error', code: 'scanner_timeout' }));
      socket.on('error', () => done({ verdict: 'error', code: 'scanner_unreachable' }));
      socket.on('data', (data) => { reply += data.toString('utf8'); });
      socket.on('end', () => {
        const text = reply.replace(/\0/g, '').trim();
        if (/: OK$/.test(text)) done({ verdict: 'clean' });
        else if (/FOUND$/.test(text)) done({ verdict: 'infected', code: 'malware_detected' });
        else done({ verdict: 'error', code: 'scanner_error' });
      });
      socket.on('connect', async () => {
        try {
          socket.write('zINSTREAM\0');
          for await (const chunk of body) {
            const data = Buffer.from(chunk as Buffer);
            const size = Buffer.alloc(4);
            size.writeUInt32BE(data.length);
            socket.write(size);
            socket.write(data);
          }
          socket.write(Buffer.alloc(4));
        } catch {
          done({ verdict: 'error', code: 'read_failed' });
        }
      });
    });
  }
}

export function scannerFromEnvironment(environment: NodeJS.ProcessEnv = process.env): MalwareScanner | null {
  if (environment.CLAMAV_HOST) return new ClamAvScanner(environment.CLAMAV_HOST, Number(environment.CLAMAV_PORT ?? 3310));
  return environment.NODE_ENV === 'production' ? null : new TestSignatureScanner();
}
