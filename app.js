/*************************************************
 * SVARTLAGER ETCS – app.js (REST, ingen supabase-js)
 **************************************************/
console.log("app.js loaded (REST)");

// >>> BYT IN DINA VÄRDEN HÄR (A och B) <<<
const SUPABASE_URL = "https://gmpazpyqiczyesoelyqt.supabase.co"; // A
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtcGF6cHlxaWN6eWVzb2VseXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MDg5OTMsImV4cCI6MjA4OTQ4NDk5M30.3sha8XnMyn18e_dl9MoBQ7CiF6X7GO5GqfCBaAeuyRE"; // B

const REST = `${SUPABASE_URL}/rest/v1`;

async function api(path, { method="GET", query="", body=null, headers={} } = {}) {
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
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) { const err = new Error((data && data.message) || `HTTP ${res.status}`); err.status=res.status; err.data=data; throw err; }
  return data;
}

// DOM
const $ = (s)=>document.querySelector(s);
const els = {
  search: $('#search'),
  itemsTbody: $('#itemsTbl tbody'),
  logTbody:   $('#logTbl tbody'),
  btnReload:  $('#btnReload'),
  // IN/OUT
  mvItemId:   $('#mv-item-id'),
  mvType:     $('#mv-type'),
  mvQty:      $('#mv-qty'),
  mvNote:     $('#mv-note'),
  mvLocation: $('#mv-location'),
  mvSubmit:   $('#mv-submit'),
  mvMsg:      $('#mv-msg'),
  // Ny artikel
  itArticleNo: $('#it-article-no'),
  itName:      $('#it-name'),
  itUnit:      $('#it-unit'),
  itLocation:  $('#it-location'),
  itActive:    $('#it-active'),
  itSaveBtn:   $('#it-save'),
  itMsg:       $('#it-msg')
};

// Render
function renderItems(items){
  const q=(els.search?.value||'').toLowerCase().trim();
  els.itemsTbody.innerHTML='';
  (items||[])
   .filter(it=>!q||it.name?.toLowerCase().includes(q)||it.article_no?.toLowerCase().includes(q)||it.location?.toLowerCase().includes(q))
   .forEach(it=>{
     const tr=document.createElement('tr');
     tr.innerHTML=`
       <td>${it.article_no??'-'}</td>
       <td>${it.name??'-'}</td>
       <td>${it.unit??'-'}</td>
       <td>${it.location??'-'}</td>
       <td>${it.stock??0}</td>
       <td>${it.last_in?new Date(it.last_in).toLocaleString():'-'}</td>
       <td>${it.last_out?new Date(it.last_out).toLocaleString():'-'}</td>`;
     tr.addEventListener('click',()=>{ els.mvItemId.value=it.id; });
     els.itemsTbody.appendChild(tr);
   });
}
function renderLog(rows){
  els.logTbody.innerHTML='';
  (rows||[]).forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${new Date(r.ts).toLocaleString()}</td>
      <td>${r.type}</td>
      <td>${r.items?.article_no??'-'}</td>
      <td>${r.items?.name??'-'}</td>
      <td>${r.qty}</td>
      <td>${r.note??''}</td>`;
    els.logTbody.appendChild(tr);
  });
}

// Hämta
async function fetchItems(){
  const query=new URLSearchParams({select:"*",order:"article_no.asc"}).toString();
  try{ const data=await api("v_items_stock",{query}); renderItems(data||[]); }
  catch(e){ console.error("Hämta items:",e); alert("Kunde inte hämta artiklar: "+e.message); }
}
async function fetchLog(){
  const query=new URLSearchParams({select:"id,ts,type,qty,note,item_id,items(article_no,name)",order:"ts.desc",limit:"200"}).toString();
  try{ const data=await api("movements",{query}); renderLog(data||[]); }
  catch(e){ console.error("Hämta logg:",e); }
}

// Ny artikel
els.itSaveBtn?.addEventListener('click', async ()=>{
  const article_no=(els.itArticleNo.value||'').trim();
  const name=(els.itName.value||'').trim();
  const unit=(els.itUnit.value||'').trim()||'st';
  const location=(els.itLocation.value||'').trim();
  const active=!!els.itActive.checked;
  if(!article_no||!name){ alert("Artikelnummer och Benämning måste fyllas i."); return; }

  try{
    const data=await api("items",{method:"POST",headers:{"Prefer":"return=representation"},body:[{article_no,name,unit,location,active}]});
    console.log("Spara artikel – DATA:",data);
    els.itArticleNo.value=''; els.itName.value=''; els.itUnit.value='st'; els.itLocation.value=''; els.itActive.checked=true;
    if(els.itMsg){ els.itMsg.textContent="Artikeln sparades."; els.itMsg.style.display='block'; }
    await fetchItems();
  }catch(e){
    console.error("Spara artikel – FEL:",e,e.data);
    let msg=e.message;
    if(e?.data?.code==='23505'||String(e.message).toLowerCase().includes('duplicate')) msg="Artikelnummer används redan.";
    alert("Kunde inte spara artikel: "+msg);
  }
});

// IN/OUT
els.mvSubmit?.addEventListener('click', async ()=>{
  if(els.mvMsg) els.mvMsg.style.display='none';
  const item_id=Number(els.mvItemId.value);
  const type=els.mvType.value;
  const qty=Number(els.mvQty.value);
  const note=els.mvNote.value||'';
  const loc=(els.mvLocation.value||'').trim();
  if(!item_id||!qty||qty<=0){ alert("Ange giltigt artikel-ID och antal > 0."); return; }

  try{
    await api("movements",{method:"POST",headers:{"Prefer":"return=representation"},body:[{type,item_id,qty,note}]});
    if(type==="IN"&&loc!==''){
      const query=new URLSearchParams({id:`eq.${item_id}`}).toString();
      await api("items",{method:"PATCH",query,headers:{"Prefer":"return=representation"},body:{location:loc}});
    }
    els.mvQty.value=''; els.mvNote.value=''; els.mvLocation.value='';
    if(els.mvMsg){ els.mvMsg.textContent="Händelsen sparades."; els.mvMsg.style.display='block'; }
    await Promise.all([fetchItems(),fetchLog()]);
  }catch(e){
    console.error("IN/OUT – FEL:",e,e.data);
    alert("Kunde inte spara händelsen: "+e.message);
  }
});

// Events & start
els.btnReload?.addEventListener('click',()=>{ fetchItems(); fetchLog(); });
els.search?.addEventListener('input',()=>{ fetchItems(); });
(async()=>{ await Promise.all([fetchItems(),fetchLog()]); })();