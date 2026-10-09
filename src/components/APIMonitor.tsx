import React from 'react';
import type { KeyEntry, KeyHealth, PoolMonitoring } from '../keyPool.js';

type Row = Omit<KeyEntry, 'key'> & { health: KeyHealth };
export function APIMonitor({ rows, monitoring, server, refresh, error }: { rows: Row[]; monitoring?: PoolMonitoring; server: boolean; refresh: () => void; error?: string }) {
  const values = Object.values(monitoring?.usage || {});
  const sum = (field: 'calls' | 'successes' | 'failures' | 'totalTokens') => values.reduce((total, usage) => total + usage[field], 0);
  const label = (id: string) => rows.find(row => row.id === id)?.name || 'Koneksi dihapus';
  return <section aria-label="Pemantauan API">
    <div className="connection-section-heading"><div><h3>Pemantauan API</h3><p>Aktivitas aplikasi, kesehatan koneksi, dan perpindahan key otomatis.</p></div><button type="button" className="topic-chip" onClick={refresh}>Perbarui</button></div>
    {error && <p className="connection-feedback error" role="alert">{error}</p>}
    <p className="field-help">{server ? 'Data dari vault server · diperbarui setiap 5 detik saat tab ini terlihat.' : 'Data dari koneksi perangkat ini · diperbarui saat ada aktivitas.'} Statistik sejak {monitoring ? new Date(monitoring.since).toLocaleString('id-ID') : 'koneksi dibuka'}. Statistik tersimpan dalam memori dan dimulai ulang saat sesi lokal atau proses server dimulai ulang.</p>
    <div className="api-monitor-stats">{[['Panggilan', sum('calls')], ['Berhasil', sum('successes')], ['Gagal / dibatalkan', sum('failures')], ['Token tercatat', sum('totalTokens')]].map(([title, value]) => <article key={title} className="connection-summary"><div><span>{title}</span><strong>{Number(value).toLocaleString('id-ID')}</strong></div></article>)}</div>
    <p className="field-help">Jumlah panggilan mencakup percobaan ulang. Berhasil berarti penyedia merespons, bukan jaminan hasil kuis valid. Token hanya berasal dari metadata respons yang diterima. Sisa kuota dan tagihan resmi Google belum terhubung; penggunaan di luar aplikasi tidak tercatat.</p>
    {!rows.length && <div className="connection-empty"><p>Buka koleksi atau tambahkan API key untuk memantau koneksi.</p></div>}
    <div className="api-monitor-table"><table><caption>Kesehatan dan penggunaan per koneksi</caption><thead><tr><th>Koneksi / proyek</th><th>Status model utama</th><th>Panggilan</th><th>Token input / output / penalaran</th><th>Respons rata-rata</th></tr></thead><tbody>{rows.map(row => {
      const usage = monitoring?.usage[row.id];
      const active = monitoring?.activeKeyIds.includes(row.id);
      const states = { untested: 'Belum diuji', ready: 'Siap', waiting: 'Dijeda', invalid: 'Karantina otomatis', restricted: 'Akses dibatasi' };
      return <tr key={row.id}><td><strong>{row.name}</strong><div>{row.project || 'Proyek belum diisi · kuota dianggap bersama'}</div><small>{usage?.lastModel || 'Belum ada panggilan'}</small></td><td>{!row.enabled ? 'Nonaktif manual' : active ? 'Sedang digunakan' : states[row.health.state]}{row.health.reason && <div>{row.health.reason}</div>}{row.health.until && row.health.until > Date.now() ? <small>Jeda sampai {new Date(row.health.until).toLocaleString('id-ID')}</small> : null}</td><td>{usage?.calls || 0}<div>{usage?.successes || 0} berhasil · {usage?.failures || 0} gagal</div></td><td>{usage ? `${usage.inputTokens.toLocaleString('id-ID')} / ${usage.outputTokens.toLocaleString('id-ID')} / ${usage.thinkingTokens.toLocaleString('id-ID')}` : '—'}<div>{usage?.measuredResponses || 0} respons dengan metadata</div></td><td>{usage && usage.successes + usage.failures ? `${(usage.durationMs / (usage.successes + usage.failures) / 1000).toFixed(1)} dtk` : '—'}</td></tr>;
    })}</tbody></table></div>
    <p className="field-help">Key tidak valid dikarantina di aplikasi, bukan dicabut di Google. Kuota proyek menjeda semua key dalam kelompok yang sama. Aktifkan perpindahan di Model &amp; Cadangan. Maksimal 3 percobaan per operasi pool.</p>
    <h4>Riwayat aktivitas terbaru</h4>
    <ol className="api-monitor-events">{monitoring?.events.map((event, index) => <li key={`${event.at}-${index}`}><time>{new Date(event.at).toLocaleTimeString('id-ID')}</time><div><strong>{label(event.keyId)}{event.targetId ? ` → ${label(event.targetId)}` : ''}</strong><p>{event.reason}</p>{event.model && <small>{event.model}</small>}</div></li>)}</ol>
    {!monitoring?.events.length && <p className="field-help">Belum ada aktivitas. Riwayat menampilkan maksimal 100 kejadian tanpa menyimpan isi prompt atau nilai API key.</p>}
  </section>;
}
