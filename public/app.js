/*************************************************
 * SVARTLAGER ETCS – Frontend (app.js)
 * - Supabase-koppling
 * - Artikelvy (saldo + lagerplats + senaste in/ut)
 * - Händelselogg
 * - IN/OUT med kommentar
 * - Vid IN: ändra lagerplats
 * - Skapa ny artikel via formulär
 **************************************************/

/* ============================
   1) Supabase-init
   ============================ */
console.log("app.js loaded");

const SUPABASE_URL = "https://gmpazpyqiczyesoelyqt.supabase.co";       // <-- BYT till din riktiga URL
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtcGF6cHlxaWN6eWVzb2VseXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MDg5OTMsImV4cCI6MjA4OTQ4NDk5M30.3sha8XnMyn18e_dl9MoBQ7CiF6X7GO5GqfCBaAeuyRE";      // <-- BYT till din riktiga anon key

// Sanity-koll så vi inte råkar köra med placeholders
if (!SUPABASE_URL.startsWith("http")) {
  console.error("SUPABASE_URL saknas eller är fel. Byt placeholdern mot din riktiga URL.");
  alert("Konfigurationsfel: SUPABASE_URL saknas. Öppna app.js och klistra in dina riktiga värden.");
}
if (SUPABASE_ANON_KEY.length < 20) {
  console.error("SUPABASE_ANON_KEY saknas eller är fel. Byt placeholdern mot din riktiga anon key.");
  alert("Konfigurationsfel: SUPABASE_ANON_KEY saknas. Öppna app.js och klistra in din riktiga anon key.");
}

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ============================
   2) DOM-helper
   ============================ */
const $ = (sel) => document.querySelector(sel);

const els = {
  search: $('#search'),
  itemsTbody: $('#itemsTbl tbody'),
  logTbody:   $('#logTbl tbody'),
  btnReload:  $('#btnReload'),

  // IN/OUT formulär
  mvItemId:   $('#mv-item-id'),
  mvType:     $('#mv-type'),
  mvQty:      $('#mv-qty'),
  mvNote:     $('#mv-note'),
  mvLocation: $('#mv-location'),
  mvSubmit:   $('#mv-submit'),

  // Ny artikel
  itArticleNo: $('#it-article-no'),
  itName:      $('#it-name'),
  itUnit:      $('#it-unit'),
  itLocation:  $('#it-location'),
  itActive:    $('#it-active'),
  itSaveBtn:   $('#it-save')
};

/* ============================
   3) RENDER – Artiklar
   ============================ */
function renderItems(items) {
  const q = (els.search.value || '').toLowerCase().trim();
  els.itemsTbody.innerHTML = '';

  items
    .filter(it =>
      !q ||
      it.name?.toLowerCase().includes(q) ||
      it.article_no?.toLowerCase().includes(q) ||
      it.location?.toLowerCase().includes(q)
    )
    .forEach(it => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${it.article_no ?? '-'}</td>
        <td>${it.name ?? '-'}</td>
        <td>${it.unit ?? '-'}</td>
        <td>${it.location ?? '-'}</td>
        <td>${it.stock ?? 0}</td>
        <td>${it.last_in  ? new Date(it.last_in).toLocaleString()  : '-'}</td>
        <td>${it.last_out ? new Date(it.last_out).toLocaleString() : '-'}</td>
      `;
      // Snabbval: klick på rad fyller artikel-ID i IN/OUT-formuläret
      tr.addEventListener('click', () => { els.mvItemId.value = it.id; });
      els.itemsTbody.appendChild(tr);
    });
}

/* ============================
   4) RENDER – Logg
   ============================ */
function renderLog(rows) {
  els.logTbody.innerHTML = '';

  rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(row.ts).toLocaleString()}</td>
      <td>${row.type}</td>
      <td>${row.items?.article_no ?? '-'}</td>
      <td>${row.items?.name ?? '-'}</td>
      <td>${row.qty}</td>
      <td>${row.note ?? ''}</td>
    `;
    els.logTbody.appendChild(tr);
  });
}

/* ============================
   5) HÄMTA – Items & Logg
   ============================ */
async function fetchItems() {
  const { data, error } = await supabase
    .from('v_items_stock')
    .select('*')
    .order('article_no', { ascending: true });

  if (error) {
    console.error("Fel vid hämtning (items):", error);
    alert("Kunde inte hämta artiklar (kontrollera URL/key och RLS).");
    return;
  }
  renderItems(data);
}

async function fetchLog() {
  const { data, error } = await supabase
    .from('movements')
    .select(`
      id,
      ts,
      type,
      qty,
      note,
      item_id,
      items (
        article_no,
        name
      )
    `)
    .order('ts', { ascending: false })
    .limit(200);

  if (error) {
    console.error("Fel vid hämtning av logg:", error);
    return;
  }
  renderLog(data);
}

/* ============================
   6) IN/OUT – Spara händelse
   ============================ */
els.mvSubmit?.addEventListener('click', async () => {
  console.log("KLICK: Spara händelse");
  const itemId = Number(els.mvItemId.value);
  const type   = els.mvType.value;
  const qty    = Number(els.mvQty.value);
  const note   = els.mvNote.value || '';
  const loc    = (els.mvLocation.value || '').trim();

  if (!itemId || !qty || qty <= 0) {
    alert("Du måste ange ett giltigt artikel-ID och antal > 0.");
    return;
  }

  // Insert i movements
  const { error: insErr } = await supabase
    .from('movements')
    .insert([{ type, item_id: itemId, qty, note }]);

  if (insErr) {
    console.error("Fel vid IN/OUT:", insErr);
    alert("Kunde inte spara händelsen. (RLS/policy kan saknas för 'movements')");
    return;
  }

  // Vid IN + lagerplats angiven → uppdatera artikelns location
  if (type === 'IN' && loc !== '') {
    const { error: updErr } = await supabase
      .from('items')
      .update({ location: loc })
      .eq('id', itemId);

    if (updErr) {
      console.warn("Händelsen sparades, men lagerplatsen kunde inte uppdateras:", updErr);
    }
  }

  // Töm fält (behåll valt itemId)
  els.mvQty.value = '';
  els.mvNote.value = '';
  els.mvLocation.value = '';

  await Promise.all([fetchItems(), fetchLog()]);
});

/* ============================
   7) Skapa ny artikel
   ============================ */
els.itSaveBtn?.addEventListener('click', async () => {
  console.log("KLICK: Spara artikel");
  const article_no = (els.itArticleNo.value || '').trim();
  const name       = (els.itName.value || '').trim();
  const unit       = (els.itUnit.value || '').trim() || 'st';
  const location   = (els.itLocation.value || '').trim();
  const active     = !!els.itActive.checked;

  if (!article_no || !name) {
    alert("Artikelnummer och Benämning måste fyllas i.");
    return;
  }

  const { data, error } = await supabase
    .from('items')
    .insert([{ article_no, name, unit, location, active }])
    .select('id');

  if (error) {
    console.error("Kunde inte spara artikel:", error);
    if (String(error.message || '').toLowerCase().includes('duplicate')) {
      alert("Artikelnummer används redan.");
    } else {
      alert("Kunde inte spara artikeln. (RLS/policy kan saknas för 'items')");
    }
    return;
  }

  // Nollställ fält
  els.itArticleNo.value = '';
  els.itName.value      = '';
  els.itUnit.value      = 'st';
  els.itLocation.value  = '';
  els.itActive.checked  = true;

  await fetchItems();
  alert("Artikeln sparades.");
});

/* ============================
   8) UI-events
   ============================ */
els.btnReload?.addEventListener('click', () => {
  fetchItems();
  fetchLog();
});

els.search?.addEventListener('input', () => {
  // Enkel refetch – kan bytas mot lokal filtrering vid behov
  fetchItems();
});

/* ============================
   9) Start
   ============================ */
(async () => {
  await Promise.all([fetchItems(), fetchLog()]);
})();