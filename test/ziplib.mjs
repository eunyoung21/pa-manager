import fs from 'fs';
import zlib from 'zlib';

export function unzip(buf){
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // find EOCD
  let eo = -1;
  for(let i=buf.length-22;i>=0;i--){ if(dv.getUint32(i,true)===0x06054b50){ eo=i; break; } }
  if(eo<0) throw new Error('no eocd');
  const n = dv.getUint16(eo+10,true), cdOff = dv.getUint32(eo+16,true);
  const out = {};
  let p = cdOff;
  for(let i=0;i<n;i++){
    const method = dv.getUint16(p+10,true);
    const csize = dv.getUint32(p+20,true);
    const nameLen = dv.getUint16(p+28,true), extraLen = dv.getUint16(p+30,true), cmtLen = dv.getUint16(p+32,true);
    const lho = dv.getUint32(p+42,true);
    const name = new TextDecoder().decode(buf.subarray(p+46, p+46+nameLen));
    const lNameLen = dv.getUint16(lho+26,true), lExtraLen = dv.getUint16(lho+28,true);
    const dstart = lho+30+lNameLen+lExtraLen;
    const raw = buf.subarray(dstart, dstart+csize);
    out[name] = method===8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
    p += 46+nameLen+extraLen+cmtLen;
  }
  return out;
}

