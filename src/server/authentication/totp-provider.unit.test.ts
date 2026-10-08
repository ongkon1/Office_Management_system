import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret } from '@/server/security/crypto';
import { authenticationKeyProvider, EncryptedTotpProvider } from './totp-provider';

const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function decode(value:string){let bits=0,buffer=0;const bytes:number[]=[];for(const character of value){buffer=(buffer<<5)|ALPHABET.indexOf(character);bits+=5;if(bits>=8){bytes.push((buffer>>>(bits-8))&255);bits-=8;}}return Buffer.from(bytes);}
function code(secret:string,at:number){const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(at/30_000)));const digest=createHmac('sha1',decode(secret)).update(counter).digest();const offset=digest[digest.length-1]&15;const number=((digest[offset]&127)<<24)|((digest[offset+1]&255)<<16)|((digest[offset+2]&255)<<8)|(digest[offset+3]&255);return String(number%1_000_000).padStart(6,'0');}

describe('BE-0901 encrypted TOTP provider',()=>{
  it('encrypts the enrolled secret and verifies a current six-digit code',async()=>{
    const now=1_800_000_000_000;const keys=authenticationKeyProvider('0123456789abcdef0123456789abcdef');const provider=new EncryptedTotpProvider(keys,()=>now);const enrollment=await provider.beginEnrollment('user-1');
    expect(enrollment.encryptedSecret).not.toContain('otpauth');const secret=new URL(enrollment.provisioningUri).searchParams.get('secret');expect(secret).toBeTruthy();expect(await provider.verifyTotp(enrollment.encryptedSecret,code(secret!,now))).toBe(true);expect(decryptSecret(enrollment.encryptedSecret,keys)).toBe(secret);
  });
});
