/** Decode bounded NDJSON progress without buffering the whole network response. */
export async function readGenerationStream(response: Response, notice: (message: string) => void): Promise<Response> {
  if (!response.ok || !response.headers.get('content-type')?.includes('application/x-ndjson') || !response.body) return response;
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', received = 0, result: any;
  const line = (raw: string) => {
    if (!raw.trim()) return;
    const packet = JSON.parse(raw);
    if (typeof packet.notice === 'string') notice(packet.notice.slice(0,512));
    if (typeof packet.success === 'boolean') result = packet;
  };
  try {
    while (true) {
      const { value,done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > 8 * 1024 * 1024) { await reader.cancel(); throw new Error('Respons kuis melebihi batas ukuran.'); }
      buffer += decoder.decode(value,{stream:true});
      let index: number;
      while ((index=buffer.indexOf('\n'))>=0) { line(buffer.slice(0,index));buffer=buffer.slice(index+1); }
    }
    buffer += decoder.decode(); if(buffer.trim()) line(buffer);
  } finally { reader.releaseLock(); }
  return result ? Response.json(result,{status:result.success ? 200 : typeof result.status === 'number' && result.status >= 400 && result.status <= 599 ? result.status : 502}) : Response.json({success:false,error:'Koneksi terputus sebelum hasil kuis diterima. Pengaturan tetap tersedia.'},{status:502});
}
