(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v || '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const copy = async (v) => { try { await navigator.clipboard.writeText(v); } catch { const t=document.createElement('textarea');t.value=v;document.body.append(t);t.select();document.execCommand('copy');t.remove(); } };
  const dlg = () => $('#availableCodesModal');
  const codes = () => window.IAmPromoteInventory?.getAvailableCodes?.() || [];
  function ensure() {
    const box = $('#inventoryWorkspace .inventory-header-topactions');
    if (!box || $('#availableCodesBtn')) return;
    box.insertAdjacentHTML('afterbegin','<button class="icon-btn available-codes-trigger" id="availableCodesBtn" type="button" title="Ver codigos libres" aria-label="Ver codigos libres"><i data-lucide="key-round"></i><span class="available-codes-count">0</span></button>');
    $('#availableCodesBtn').addEventListener('click', open);
    window.lucide?.createIcons?.();
  }
  function refresh() {
    ensure();
    const b=$('#availableCodesBtn'); if (!b) return;
    b.disabled=!window.IAmPromoteInventory?.getCurrentEvent?.();
    const badge=b.querySelector('.available-codes-count'); if (badge) badge.textContent=codes().length;
  }
  function open() {
    const event=window.IAmPromoteInventory?.getCurrentEvent?.(); if (!event) return;
    const list=codes();
    $('#availableCodesTitle').textContent='Codigos libres: ' + (event.name || event.title || 'Evento');
    $('#availableCodesSummary').textContent=list.length + ' código' + (list.length===1?'':'s') + ' reales disponibles para asignar.';
    $('#availableCodesList').innerHTML=list.length ? list.map((x,i)=>'<div class="available-code-row"><div><code>'+esc(x.code)+'</code><span class="available-code-zone">'+esc(x.zone || 'Sin zona')+'</span></div><button class="available-code-copy" type="button" data-code-index="'+i+'">Copiar</button></div>').join('') : '<div class="available-codes-empty">No hay codigos libres en este evento.</div>';
    $('#copyAllCodesBtn').hidden=!list.length; dlg().showModal();
    $('#availableCodesList').querySelectorAll('[data-code-index]').forEach((b)=>b.onclick=async()=>{ await copy(list[Number(b.dataset.codeIndex)].code); b.textContent='Copiado'; setTimeout(()=>b.textContent='Copiar',1200); });
    $('#copyAllCodesBtn').onclick=async()=>{ await copy(list.map(x=>x.code).join('\n')); $('#copyAllCodesBtn').textContent='Copiados'; setTimeout(()=>$('#copyAllCodesBtn').textContent='Copiar todos',1200); };
  }
  document.addEventListener('click',(e)=>{ if(e.target.closest('[data-close-available-codes]')) dlg().close(); setTimeout(refresh,0); });
  window.addEventListener('iap:available-codes-ready',refresh);
  document.addEventListener('DOMContentLoaded',()=>setTimeout(refresh,250));
  setInterval(refresh,1800);
})();