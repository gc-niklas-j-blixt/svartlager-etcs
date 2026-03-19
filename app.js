/*************************************************
 * SVARTLAGER ETCS – app.js (REST-version, utan supabase-js)
 * - Läser/skriv­er via Supabase REST (PostgREST)
 * - Artiklar (v_items_stock) + logg (movements)
 * - Skapa artikel (items)
 * - IN/OUT (movements) + uppdatera location vid IN
 **************************************************/

console.log("app.js loaded (REST)");

// ───────────────────────────────────────────────────────────
// 1) BYT TILL DINA EGNA VÄRDEN
//    Exempel URL: https://gmpazpyqiczyesoelyqt.supabase.co
const SUPABASE_URL = "DIN_SUPABASE_URL_HÄR";
const SUPABASE_ANON_KEY = "DIN_ANON_KEY_HÄR";
// ───────────────────────────────────────────────────────────

// Bas-URL till REST-API
const REST = `${SUPABASE_URL}/rest/v1`;

// Hjälpare för fetch mot Supabase REST
async function api(path, { method = "GET", query = "", body = null, headers = {} } = {}) {
  const url = `${REST}/${path}${query ? `?${query}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...headers
    },
    body: body ? JSON.stringify(body) : null
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const err = new Error((data && data.message) || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// DOM helpers
const $ = (sel) => document.querySelector(sel);

const els = {
  search:      $('#search'),
  itemsTbody:  $('#itemsTbl tbody'),
  logTbody:    $('#logTbl tbody'),
  btnReload:   $('#btnReload'),

  // IN/OUT
  mvItemId:    $('#mv-item-id'),
  mvType:      $('#mv-type'),
  mvQty:       $('#mv-qty'),
  mvNote:      $('#mv-note'),
  mvLocation:  $('#mv-location'),
  mvSubmit:    $('#mv-submit'),
  mvMsg:       $('#mv-msg'),

  // Ny artikel
  itArticleNo: $('#it-article-no'),
  itName:      $('#it-name'),
  itUnit:      $('#it-unit'),
  itLocation:  $('#it-location'),
  itActive:    $('#it-active'),
  itSaveBtn:   $('#it-save'),
  itMsg:       $('#it-msg')
};

/* ──────────────────────────────────────────────────────────
   Render – Artiklar
   v_items_stock: id, article_no, name, unit, location, stock, last_in, last_out
   ────────────────────────────────────────────────────────── */
function renderItems(items) {
  const q = (els.search?.value || '').toLowerCase().trim();
  els.itemsTbody.innerHTML = '';

  (items || [])
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
      tr.addEventListener('click', () => { els.mvItemId.value = it.id; });
      els.itemsTbody.appendChild(tr);
    });
}

/* ──────────────────────────────────────────────────────────
   Render – Logg
   movements med nested items(article_no, name)
   ────────────────────────────────────────────────────────── */
function renderLog(rows) {
  els.logTbody.innerHTML = '';
  (rows || []).forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(r.ts).toLocaleString()}</td>
      <td>${r.type}</td>
      <td>${r.items?.article_no ?? '-'}</td>
      <td>${r.items?.name ?? '-'}</td>
      <td>${r.qty}</td>
      <td>${r.note ?? ''}</td>
    `;
    els.logTbody.appendChild(tr);
  });
}

/* ──────────────────────────────────────────────────────────
   Hämta data
   ────────────────────────────────────────────────────────── */
async function fetchItems() {
  const query = new URLSearchParams({
    select: "*",
    order: "article_no.asc"
  }).toString();

  try {
    const data = await api("v_items_stock", { query });
    renderItems(data || []);
  } catch (e) {
    console.error("Fel vid hämtning (items):", e);
    alert("Kunde inte hämta artiklar: " + e.message);
  }
}

async function fetchLog() {
  const query = new URLSearchParams({
    select: "id,ts,type,qty,note,item_id,items(article_no,name)",
    order: "ts.desc",
    limit: "200"
  }).toString();

  try {
    const data = await api("movements", { query });
    renderLog(data || []);
  } catch (e) {
    console.error("Fel vid hämtning av logg:", e);
  }
}

/* ──────────────────────────────────────────────────────────
   Skapa artikel
   ────────────────────────────────────────────────────────── */
els.itSaveBtn?.addEventListener('click', async () => {
  const article_no = (els.itArticleNo.value || '').trim();
  const name       = (els.itName.value || '').trim();
  const unit       = (els.itUnit.value || '').trim() || 'st';
  const location   = (els.itLocation.value || '').trim();
  const active     = !!els.itActive.checked;

  if (!article_no || !name) {
    alert("Artikelnummer och Benämning måste fyllas i.");
    return;
  }

  try {
    // Prefer: return=representation ger tillbaka den skapade raden
    const data = await api("items", {
      method: "POST",
      headers: { "Prefer": "return=representation" },
      body: [{ article_no, name, unit, location, active }]
    });

    console.log("Spara artikel – DATA:", data);

    els.itArticleNo.value = '';
    els.itName.value      = '';
    els.itUnit.value      = 'st';
    els.itLocation.value  = '';
    els.itActive.checked  = true;

    if (els.itMsg) { els.itMsg.textContent = "Artikeln sparades."; els.itMsg.style.display = 'block'; }

    await fetchItems();
  } catch (e) {
    console.error("Spara artikel – FEL:", e, e.data);
    let msg = e.message;
    if (e?.data?.code === '23505' || String(e.message).toLowerCase().includes('duplicate')) {
      msg = "Artikelnummer används redan.";
    }
    alert("Kunde inte spara artikel: " + msg);
  }
});

/* ──────────────────────────────────────────────────────────
   IN/OUT – spara händelse + ev. uppdatera lagerplats
   ────────────────────────────────────────────────────────── */
els.mvSubmit?.addEventListener('click', async () => {
  if (els.mvMsg) els.mvMsg.style.display = 'none';

  const item_id = Number(els.mvItemId.value);
  const type    = els.mvType.value;
  const qty     = Number(els.mvQty.value);
  const note    = els.mvNote.value || '';
  const loc     = (els.mvLocation.value || '').trim();

  if (!item_id || !qty || qty <= 0) {
    alert("Ange giltigt artikel-ID och antal > 0.");
    return;
  }

  try {
    // 1) Skapa rörelsen
    await api("movements", {
      method: "POST",
      headers: { "Prefer": "return=representation" },
      body: [{ type, item_id, qty, note }]
    });

    // 2) Vid IN + plats angiven → uppdatera artikelns location
    if (type === "IN" && loc !== '') {
      const query = new URLSearchParams({ id: `eq.${item_id}` }).toString();
      await api("items", {
        method: "PATCH",
        query,
        headers: { "Prefer": "return=representation" },
        body: { location: loc }
      });
    }

    els.mvQty.value = '';
    els.mvNote.value = '';
    els.mvLocation.value = '';

    if (els.mvMsg) { els.mvMsg.textContent = "Händelsen sparades."; els.mvMsg.style.display = 'block'; }

    await Promise.all([fetchItems(), fetchLog()]);
  } catch (e) {
    console.error("IN/OUT – FEL:", e, e.data);
    alert("Kunde inte spara händelsen: " + e.message);
  }
});

/* ──────────────────────────────────────────────────────────
   Events & start
   ────────────────────────────────────────────────────────── */
els.btnReload?.addEventListener('click', () => { fetchItems(); fetchLog(); });
els.search?.addEventListener('input', () => { fetchItems(); });

(async () => {
  await Promise.all([fetchItems(), fetchLog()]);
})();