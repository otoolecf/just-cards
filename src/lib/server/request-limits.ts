export class BodyLimitError extends Error { constructor(){super('Request body is too large');} }
export async function boundedBody(request: Request, limit = 65536): Promise<Uint8Array> {
 const reader = request.body?.getReader();
 if (!reader) return new Uint8Array();
 let length = 0; const chunks: Uint8Array[] = [];
 try {
  while (true) {
   const {done,value} = await reader.read(); if(done) break;
   length += value.byteLength;
   if(length > limit) {await reader.cancel(); throw new BodyLimitError();}
   chunks.push(value);
  }
 } finally {reader.releaseLock();}
 const result = new Uint8Array(length); let offset=0;
 for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}
 return result;
}
