import { createHash, createHmac, randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret, type KeyProvider } from '@/server/security/crypto';
import type { TwoFactorProvider } from './two-factor';

const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(value:Buffer):string { let bits=0,buffer=0,result=''; for(const byte of value){buffer=(buffer<<8)|byte;bits+=8;while(bits>=5){result+=ALPHABET[(buffer>>>(bits-5))&31];bits-=5;}} if(bits>0)result+=ALPHABET[(buffer<<(5-bits))&31];return result; }
function base32Decode(value:string):Buffer { let bits=0,buffer=0;const bytes:number[]=[];for(const character of value.toUpperCase().replace(/=+$/,'')){const index=ALPHABET.indexOf(character);if(index<0)throw new Error('Invalid TOTP secret');buffer=(buffer<<5)|index;bits+=5;if(bits>=8){bytes.push((buffer>>>(bits-8))&255);bits-=8;}}return Buffer.from(bytes); }

export function authenticationKeyProvider(secret=process.env.BETTER_AUTH_SECRET):KeyProvider {
  if(!secret || secret.length<32) throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters');
  const key=createHash('sha256').update(secret).digest();
  return {current:()=>({id:'auth-v1',key}),byId:(id)=>id==='auth-v1'?key:undefined};
}

export class EncryptedTotpProvider implements TwoFactorProvider {
  constructor(private readonly keyProvider:KeyProvider=authenticationKeyProvider(),private readonly now=()=>Date.now()){}
  async beginEnrollment(userId:string){const secret=base32Encode(randomBytes(20));const label=encodeURIComponent(`PowerInAI:${userId}`);return {encryptedSecret:encryptSecret(secret,this.keyProvider),provisioningUri:`otpauth://totp/${label}?secret=${secret}&issuer=PowerInAI&digits=6&period=30`};}
  async verifyTotp(encryptedSecret:string,code:string){if(!/^\d{6}$/.test(code))return false;const secret=base32Decode(decryptSecret(encryptedSecret,this.keyProvider));const counter=Math.floor(this.now()/30_000);for(let offset=-1;offset<=1;offset+=1){const value=Buffer.alloc(8);value.writeBigUInt64BE(BigInt(counter+offset));const digest=createHmac('sha1',secret).update(value).digest();const index=digest[digest.length-1]&15;const number=((digest[index]&127)<<24)|((digest[index+1]&255)<<16)|((digest[index+2]&255)<<8)|(digest[index+3]&255);if(String(number%1_000_000).padStart(6,'0')===code)return true;}return false;}
}
