
// --- Utilities: date-only math (avoid DST surprises) ---
// THEME: apply / persist / auto-detect
// function applyTheme(mode){
//   const root = document.documentElement;
//   if(mode === 'auto'){
//     const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
//     root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
//   } else {
//     root.setAttribute('data-theme', mode);
//   }
// }

// function initTheme(){
//   const select = el('themeSelect');
//   const saved = localStorage.getItem('themeMode') || 'auto';
//   select.value = saved;

//   applyTheme(saved);

//   // Update on user change
//   select.addEventListener('change', ()=>{
//     const val = select.value;
//     localStorage.setItem('themeMode', val);
//     applyTheme(val);
//   });

//   // If in Auto, follow OS changes live
//   if(window.matchMedia){
//     const mq = window.matchMedia('(prefers-color-scheme: dark)');
//     mq.addEventListener?.('change', ()=>{
//       const current = localStorage.getItem('themeMode') || 'auto';
//       if(current === 'auto') applyTheme('auto');
//     });
//   }
// }


function toDateOnly(d){ return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); }
function fromYMD(yyyy_mm_dd){
  const [y,m,d] = yyyy_mm_dd.split('-').map(x=>parseInt(x,10));
  return new Date(Date.UTC(y, m-1, d));
}
function addDays(dateOnlyUTC, delta){
  const ms = dateOnlyUTC.getTime() + delta*86400000;
  return new Date(ms);
}
function fmt(dateOnlyUTC){
  const y = dateOnlyUTC.getUTCFullYear();
  const m = (dateOnlyUTC.getUTCMonth()+1).toString().padStart(2,'0');
  const d = dateOnlyUTC.getUTCDate().toString().padStart(2,'0');
  const day = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dateOnlyUTC.getUTCDay()];
  const month = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][dateOnlyUTC.getUTCMonth()];
  return `${month} ${parseInt(d,10)}, ${y} (${day})`;
}
function ymd(dateOnlyUTC){
  const y = dateOnlyUTC.getUTCFullYear();
  const m = String(dateOnlyUTC.getUTCMonth()+1).padStart(2,'0');
  const d = String(dateOnlyUTC.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

function weekdayMaskFromPreset(preset){
  if(preset==='mwSat') return new Set([1,3,6]);          // Mon(1), Wed(3), Sat(6)
  if(preset==='tuFri') return new Set([2,5]);            // Tue(2), Fri(5)
  return new Set([0,1,2,3,4,5,6]);                      // daily default
}

function resetForm() {
  // Core inputs
  el('game').value = '';      // or '' if you want this blank
  el('lastDate').value = '';           // clear last draw date
  el('max').value = '';                // clear max multi-draw

  // Max multi-draw — clear value and defaultValue
  const maxEl = el('max');
  maxEl.value = '';
  maxEl.defaultValue = ''; // prevents snap-back to HTML default
  // Optional: show hint instead of a hard default
  maxEl.placeholder = '';


  // Schedule + options
  el('schedule').value = 'daily';
  onScheduleChange();                  // re-hide/show option blocks
  el('lastSession').value = 'Evening';
  el('sessionLabels').value = 'Midday,Evening';

  // Helper panel
  const helper = document.getElementById('helper');
  if (helper && helper.open) helper.open = false; // collapse <details>
  const firstNewDate = document.getElementById('firstNewDate');
  if (firstNewDate) firstNewDate.value = '';
  const firstNewSession = document.getElementById('firstNewSession');
  if (firstNewSession) firstNewSession.value = 'Evening';

  // Checkboxes
  // el('immediateAfter').checked = true;
  // el('includeNotes').checked = true;

  // Custom weekdays: uncheck all
  document.querySelectorAll('#customWeekdays .wd').forEach(cb => cb.checked = false);

  // Output + messages
  document.querySelector('#table tbody').innerHTML = '';
  const S = el('summary'); S.classList.add('hide'); S.innerHTML = '';
  const E = el('error'); E.classList.add('hide'); E.textContent = '';

  // Nice touch: scroll to top of page
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


// --- Core stepdown generator ---
function generateStepdown({ lastDateUTC, max, mode, weekdays, sessions, lastSession }){
  const rows = [];

  if(mode === 'monitor'){
    for(let i=0;i<=max;i++){
      const allowed = i<=1 ? 1 : i;
      rows.push({ index: i, dateLabel: '-', drawLabel: `Draw ${(max - i) + 1}`, allowed });
    }
    rows.reverse();
    return rows.map((r, idx)=>({ n: idx+1, dateText: '-', drawText: r.drawLabel, allowed: r.allowed }));
  }

  const picksNeeded = max + 1; // inclusive of last draw

  if(mode === 'twiceDaily'){
    const sessionOrder = sessions && sessions.length === 2 ? sessions : ['Midday','Evening'];
    const sessionIndex = (sess)=> sessionOrder.indexOf(sess);
    let curDate = new Date(lastDateUTC.getTime());
    let curSession = lastSession && sessionIndex(lastSession) >= 0 ? lastSession : 'Evening';

    const step = () => ({ date: new Date(curDate.getTime()), session: curSession });
    const prev = () => {
      const idx = sessionIndex(curSession);
      if(idx <= 0){ curDate = addDays(curDate, -1); curSession = sessionOrder[1]; }
      else { curSession = sessionOrder[0]; }
    };

    const temp = [];
    for(let i=0;i<picksNeeded;i++){ temp.push(step()); prev(); }

    const out = temp.map((item, i)=>{
      const allowed = (i<=1) ? 1 : i;
      return { n: picksNeeded - i, dateText: fmt(item.date), drawText: item.session, allowed };
    }).reverse();
    return out;
  }

  // Single-draw-per-day schedules
  let mask;
  if(mode==='daily') mask = weekdayMaskFromPreset('daily');
  else if(mode==='mwSat') mask = weekdayMaskFromPreset('mwSat');
  else if(mode==='tuFri') mask = weekdayMaskFromPreset('tuFri');
  else if(mode==='custom') mask = weekdays && weekdays.size ? weekdays : weekdayMaskFromPreset('daily');

  const dates = [];
  let d = new Date(lastDateUTC.getTime());
  while(dates.length < picksNeeded){
    if(mask.has(d.getUTCDay())){ dates.push(new Date(d.getTime())); }
    d = addDays(d, -1);
  }

  const tmp = dates.map((dateOnly, i)=>({ dateOnly, allowed: (i<=1) ? 1 : i }));
  const out = tmp.map((r, i)=>({ n: picksNeeded - i, dateText: fmt(r.dateOnly), drawText: '-', allowed: r.allowed, })).reverse();
  return out;

}

function generateStepdownCustomSessions({ lastDateUTC, max }) {
  const master = parseSessionList(); // global order
  if (master.length === 0) {
    throw new Error('Please enter at least one session in “Session list”.');
  }

  const perDay = getPerDaySessions(); // Map<wd, sessions[]>
  const hasSessions = (wd) => {
    const list = perDay.get(wd);
    return Array.isArray(list) && list.length > 0;
  };
  const ordered = (list) => master.filter(s => (list || []).includes(s));

  // 1) Find a valid starting day (lastDate or prior day with sessions)
  let curDate = new Date(lastDateUTC.getTime());
  let wd = curDate.getUTCDay();

  let safety = 0;
  while (!hasSessions(wd)) {
    curDate = addDays(curDate, -1);
    wd = curDate.getUTCDay();
    if (++safety > 30) {
      throw new Error('No configured sessions found on the selected weekday or any of the prior 30 days.');
    }
  }

  // 2) Build the ordered session list for that day
  let todayList = ordered(perDay.get(wd));
  if (todayList.length === 0) {
    throw new Error('Sessions are configured for this weekday, but none match the master session list.');
  }

  // 3) Determine starting session:
  //     Prefer the user’s selection if it exists and is valid for that weekday.
  const uiStart = (el('lastSessionCustom') && el('lastSessionCustom').value) || '';
  let startSession = uiStart && todayList.includes(uiStart)
    ? uiStart
    : todayList[todayList.length - 1];

  let curSessIdx = todayList.indexOf(startSession);
  if (curSessIdx < 0) curSessIdx = todayList.length - 1;

  // 4) Collect max+1 draws stepping BACK by session, then by date-with-sessions
  const picksNeeded = max + 1;
  const temp = [];

  for (let i = 0; i < picksNeeded; i++) {
    temp.push({ date: new Date(curDate.getTime()), session: todayList[curSessIdx] });

    // move to previous draw
    curSessIdx--;
    if (curSessIdx < 0) {
      // jump to previous date that has sessions
      safety = 0;
      do {
        curDate = addDays(curDate, -1);
        wd = curDate.getUTCDay();
        if (++safety > 30) {
          throw new Error('Could not find enough prior days with sessions to build the full stepdown.');
        }
      } while (!hasSessions(wd));

      todayList = ordered(perDay.get(wd));
      if (todayList.length === 0) {
        throw new Error('Sessions exist for a prior weekday but none match the master session list.');
      }
      curSessIdx = todayList.length - 1; // start from that day’s LAST session
    }
  }

  // 5) Apply stepdown pattern
  return temp.map((item, i) => ({
    n: (picksNeeded - i),
    dateText: fmt(item.date),
    drawText: item.session,
    allowed: (i <= 1) ? 1 : i,
  })).reverse();
}




// --- Helper: compute last old draw from the first new-rule draw ---
// function computeLastOldFromFirstNew(){
//   const firstStr = el('firstNewDate').value;
//   if(!firstStr){ toast('Enter the first new-rule draw date'); return; }

//   const mode = el('schedule').value;
//   const firstUTC = fromYMD(firstStr);

//   if(mode === 'twiceDaily'){
//     const labels = (el('sessionLabels').value || 'Midday,Evening').split(',').map(s=>s.trim()).filter(Boolean);
//     const sessions = labels.length>=2 ? [labels[0], labels[1]] : ['Midday','Evening'];
//     const firstSess = el('firstNewSession').value;

//     let lastDateUTC = new Date(firstUTC.getTime());
//     let lastSess;
//     if(firstSess === sessions[0]){        // First is earlier session
//       lastDateUTC = addDays(firstUTC, -1);
//       lastSess = sessions[1];             // Previous draw is previous day's later session
//     } else {                               // First is later session
//       lastSess = sessions[0];             // Previous draw is same day's earlier session
//     }

//     el('lastDate').value = ymd(lastDateUTC);
//     el('lastSession').value = lastSess;
//     toast(`Filled last old draw: ${ymd(lastDateUTC)} (${lastSess})`);
//     return;
//   }

//  // Single-draw-per-day modes
//   let mask;
//   if(mode==='daily') mask = weekdayMaskFromPreset('daily');
//   else if(mode==='mwSat') mask = weekdayMaskFromPreset('mwSat');
//   else if(mode==='tuFri') mask = weekdayMaskFromPreset('tuFri');
//   else if(mode==='custom') mask = currentWeekdaySet() || weekdayMaskFromPreset('daily');

//   let d = addDays(firstUTC, -1);
//   while(true){
//     if(mask.has(d.getUTCDay())){ el('lastDate').value = ymd(d); break; }
//     d = addDays(d, -1);
//   }
//   toast(`Filled last old draw: ${ymd(d)}`);
// }

// --- DOM wiring ---
const el = (id)=>document.getElementById(id);
const tbody = document.querySelector('#table tbody');

// function renderTable(rows){
//   tbody.innerHTML = rows.map((r, idx)=>{
//     return `<tr>\n          <td>${idx+1}</td>\n          <td>${r.dateText}</td>\n          <td>${r.drawText}</td>\n          <td>${r.allowed}</td>\n        </tr>`;
//   }).join('');
// }

// // function buildSummary(){
// //   const game = el('game').value.trim() || '—';
// //   const max = parseInt(el('max').value, 10);
// //   const lastDate = el('lastDate').value;
// //   //const immediate = el('immediateAfter').checked;
// //   let s = `<strong>${game}</strong> stepdown generated for last draw <strong>${lastDate || '—'}</strong> with Max multi-draw <strong>${isNaN(max)?'—':max}</strong>.`;
// //   //if(immediate){ s += ` Extend draw break through <strong>end of day</strong> on the last stepdown date to prevent sales for the post-change draw.`; }
// //   return s;
// // }

// function copyTable(){
//   const headers = ['#','Date','Draw (session)','Multi-draws allowed'];
//   const rows = Array.from(tbody.querySelectorAll('tr')).map(tr=> Array.from(tr.children).map(td=>td.textContent));
//   const tsv = [headers.join('\t'), ...rows.map(r=>r.join('\t'))].join('\n');
//   navigator.clipboard.writeText(tsv).then(()=>{ toast('Table copied to clipboard'); });
// }

// function downloadCSV() {
//   const tbodyEl = document.querySelector('#table tbody');
//   const rowsEls = Array.from(tbodyEl?.querySelectorAll('tr') || []);
//   if (rowsEls.length === 0) {
//     toast('Nothing to download — generate the stepdown first.');
//     return;
//   }

//   const headers = ['Row','Date','Draw/Session','MultiDrawsAllowed'];
//   const rows = rowsEls.map((tr, i) => {
//     const tds = Array.from(tr.children).map(td => td.textContent || '');
//     return [String(i + 1), ...tds.slice(1)];
//   });

//   const esc = (s) => `"${String(s).replaceAll('"','""')}"`;
//   const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
//   const BOM = '\uFEFF';
//   const blob = new Blob([BOM, csv], { type: 'text/csv;charset=utf-8' });

//   const filenameSafe = (el('game').value.trim() || 'game').replace(/\s+/g, '_');
//   const last = el('lastDate').value || 'last';
//   const filename = `${filenameSafe}_stepdown_${last}.csv`;

//   const url = URL.createObjectURL(blob);
//   const a = document.createElement('a');
//   a.href = url;
//   a.download = filename;
//   document.body.appendChild(a);

//   // Delay revoking URL to ensure download starts
//   a.click();
//   setTimeout(() => {
//     document.body.removeChild(a);
//     URL.revokeObjectURL(url);
//   }, 500);

//   toast('CSV downloaded');
// }

function renderTable(rows){
  const thead = document.querySelector('#table thead');
  const tbody = document.querySelector('#table tbody');

  // Do we need the session column?
  const showSession = rows.some(r => {
    const v = (r.drawText ?? '').trim();
    return v && v !== '-';
  });

  // Build header dynamically
  thead.innerHTML = `
    <tr>
      <th>#</th>
      <th>Date</th>
      ${showSession ? '<th>Draw session</th>' : ''}
      <th>Multi-draws allowed</th>
    </tr>
  `;

  // Build body
  tbody.innerHTML = rows.map((r, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${r.dateText}</td>
      ${showSession ? `<td>${r.drawText}</td>` : ''}
      <td>${r.allowed}</td>
    </tr>
  `).join('');

  // Let copy/download know what we rendered
  tbody.dataset.showSession = showSession ? '1' : '0';
}

function copyTable(){
  const tbody = document.querySelector('#table tbody');
  const showSession = tbody.dataset.showSession === '1';

  const headers = showSession
    ? ['#','Date','Draw session','Multi-draws allowed']
    : ['#','Date','Multi-draws allowed'];

  const rows = Array.from(tbody.querySelectorAll('tr')).map(tr => {
    const cells = Array.from(tr.children).map(td => td.textContent || '');
    // cells: [#, Date, (optional Session), Allowed]
    return showSession ? cells : [cells[0], cells[1], cells[cells.length - 1]];
  });

  const tsv = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
  navigator.clipboard.writeText(tsv).then(() => toast('Table copied to clipboard'));
}

function downloadCSV(){
  const tbody = document.querySelector('#table tbody');
  const rowsEls = Array.from(tbody?.querySelectorAll('tr') || []);
  if (rowsEls.length === 0) { toast('Nothing to download — generate the stepdown first.'); return; }

  const showSession = tbody.dataset.showSession === '1';

  const headers = showSession
    ? ['Row','Date','DrawSession','MultiDrawsAllowed']
    : ['Row','Date','MultiDrawsAllowed'];

  const rows = rowsEls.map((tr, i) => {
    const cells = Array.from(tr.children).map(td => td.textContent || '');
    // cells: [#, Date, (optional Session), Allowed]
    if (showSession) return [String(i + 1), cells[1], cells[2], cells[3]];
    return [String(i + 1), cells[1], cells[cells.length - 1]];
  });

  const esc = s => `"${String(s).replaceAll('"','""')}"`;
  const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
  const BOM = '\uFEFF';
  const blob = new Blob([BOM, csv], { type: 'text/csv;charset=utf-8' });

  const filenameSafe = (el('game').value.trim() || 'game').replace(/\s+/g, '_');
  const last = el('lastDate').value || 'last';
  const filename = `${filenameSafe}_stepdown_${last}.csv`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);

  toast('CSV downloaded');
}


const WD_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function parseSessionList() {
  const raw = (el('sessionMaster').value || '').split(',').map(s=>s.trim()).filter(Boolean);
  // De-dup while preserving order
  const seen = new Set(); const out = [];
  raw.forEach(s => { if(!seen.has(s)) { seen.add(s); out.push(s); }});
  return out;
}

function selectedWeekdaysSet() {
  const boxes = Array.from(document.querySelectorAll('#customWeekdays .wd'));
  return new Set(boxes.filter(b=>b.checked).map(b=>parseInt(b.value,10)));
}

function renderWeekdaySessionMatrix() {
  const container = document.getElementById('weekdaySessionMatrix');
  container.innerHTML = '';
  const sessions = parseSessionList();
  const enabledDays = selectedWeekdaysSet();

  if (sessions.length === 0) {
    container.innerHTML = '<div class="note">Enter sessions above to configure per weekday.</div>';
    return;
  }

  // Build a multi-select for each weekday that is checked
  WD_LABELS.forEach((lbl, idx) => {
    if (!enabledDays.has(idx)) return;
    const wrap = document.createElement('div');
    wrap.className = 'row mt6';
    wrap.innerHTML = `
      <label style="min-width:70px">${lbl}</label>
      <select multiple size="${Math.min(4, sessions.length)}" class="daySessions" data-wd="${idx}">
        ${sessions.map(s => `<option value="${s}" selected>${s}</option>`).join('')}
      </select>
    `;
    container.appendChild(wrap);
  });

  // Also refresh last-session options if we already have a date
  refreshLastSessionCustom();
}

function getPerDaySessions() {
  // Returns a Map<weekdayNumber, Array<sessionName>>
  const map = new Map();
  const selects = Array.from(document.querySelectorAll('#weekdaySessionMatrix .daySessions'));
  selects.forEach(sel => {
    const wd = parseInt(sel.getAttribute('data-wd'), 10);
    const chosen = Array.from(sel.selectedOptions).map(o => o.value);
    map.set(wd, chosen);
  });
  return map;
}

// function refreshLastSessionCustom() {
//   const sel = el('lastSessionCustom');
//   if (!sel) return;
//   sel.innerHTML = ''; // reset

//   const lastStr = el('lastDate').value;
//   if (!lastStr) { sel.disabled = true; return; }

//   const d = fromYMD(lastStr);
//   const wd = d.getUTCDay();
//   const perDay = getPerDaySessions();
//   const sessionsForDay = perDay.get(wd) || [];

//   if (sessionsForDay.length === 0) {
//     sel.disabled = true;
//     return;
//   }

//   sessionsForDay.forEach(s => {
//     const opt = document.createElement('option');
//     opt.value = s; opt.textContent = s;
//     sel.appendChild(opt);
//   });
//   sel.disabled = false;
// }

function refreshLastSessionCustom() {
  const sel = el('lastSessionCustom');
  if (!sel) return;

  sel.innerHTML = '';

  // Placeholder so nothing is auto-selected
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = '— choose —';
  sel.appendChild(ph);

  // Determine which list to show
  const master = parseSessionList();           // from #sessionMaster
  const perDay = getPerDaySessions();          // Map<wd, sessions[]>
  const lastStr = el('lastDate').value;

  let list = [];
  if (lastStr) {
    const wd = fromYMD(lastStr).getUTCDay();
    list = perDay.get(wd) || [];
  }
  if (list.length === 0) {
    // fallback to master list so user can still pick
    list = master;
  }

  // Populate options
  (list || []).forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    sel.appendChild(opt);
  });

  sel.disabled = false;       // always allow manual choice
  sel.selectedIndex = 0;      // keep placeholder selected until the user chooses
}



function toast(msg){
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.position='fixed'; t.style.bottom='20px'; t.style.right='20px';
  t.style.background='rgba(238, 238, 240, 0.95)'; t.style.border='1px solid var(--border)'; t.style.padding='10px 14px'; t.style.borderRadius='10px';
  t.style.color='var(--text)'; t.style.boxShadow='0 6px 18px rgba(0,0,0,.35)';
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 1800);
}

function validate(){
  const last = el('lastDate').value;
  const max = parseInt(el('max').value, 10);
  let msg = '';
  if(!last) msg += '\n• Please provide a last draw date (or use the helper to fill it)';
  if(!(max>=1)) msg += '\n• Max multi-draw must be at least 1';
  return msg.trim();
}

// function onScheduleChange(){
//   const val = el('schedule').value;
//   el('customWeekdays').classList.toggle('hide', !(val==='custom'));
//   el('twiceDailyOpts').classList.toggle('hide', !(val==='twiceDaily'));
//   // Show helper’s session select only for twice-daily mode
//   document.getElementById('firstNewSessionWrap').classList.toggle('hide', !(val==='twiceDaily'));

//   // NEW: custom sessions wrapper only in custom mode
//   document.getElementById('customSessionsWrap')?.classList.toggle('hide', !(val==='custom'));
// }

function onScheduleChange(){
  const val = el('schedule').value;

  // Show the weekday checkboxes only for Custom
  el('customWeekdays').classList.toggle('hide', val !== 'custom');

  // Show the twice-daily options only for Twice Daily
  el('twiceDailyOpts').classList.toggle('hide', val !== 'twiceDaily');

  // (If you still have the helper’s session wrap, keep this null-safe)
  document.getElementById('firstNewSessionWrap')?.classList.toggle('hide', val !== 'twiceDaily');

  // Show sessions-per-day wrapper only in Custom
  const wrap = document.getElementById('customSessionsWrap');
  wrap?.classList.toggle('hide', val !== 'custom');

  // If we’re leaving Custom, collapse the inner config so it doesn't stick open
  if (val !== 'custom') {
    document.getElementById('sessionsConfig')?.classList.add('hide');
    const enable = el('enableSessions');
    if (enable) enable.checked = false;
  }

  // If we’re in Custom and sessions are already enabled, ensure the config is visible and rendered
  if (val === 'custom' && el('enableSessions')?.checked) {
    document.getElementById('sessionsConfig')?.classList.remove('hide');
    renderWeekdaySessionMatrix();
  }
}


function currentWeekdaySet(){
  const val = el('schedule').value;
  if(val==='custom'){
    const boxes = Array.from(document.querySelectorAll('#customWeekdays .wd'));
    const chosen = boxes.filter(b=>b.checked).map(b=>parseInt(b.value,10));
    return new Set(chosen);
  }
  return null; // presets handled in generator
}


function generate(){
  const E = el('error');
  E.classList.add('hide'); E.textContent = '';

  // Base validation (last date + max)
  const baseErr = validate();
  if (baseErr) { E.classList.remove('hide'); E.textContent = baseErr; return; }

  const lastUTC = fromYMD(el('lastDate').value);
  const max = parseInt(el('max').value, 10);
  const mode = el('schedule').value;

  try {
    let rows;

    if (mode === 'custom' && el('enableSessions').checked) {
      // Extra validation for custom+sessions
      const master = parseSessionList();
      if (master.length === 0) throw new Error('Please enter at least one session in “Session list”.');

      const selectedDays = Array.from(selectedWeekdaysSet() || []);
      if (selectedDays.length === 0) throw new Error('Please select at least one weekday.');

      // At least one selected weekday must have at least one session chosen
      const perDay = getPerDaySessions();
      const anyDayHasSession = selectedDays.some(d => (perDay.get(d) || []).length > 0);
      if (!anyDayHasSession) throw new Error('Please enable at least one session for at least one selected weekday.');

      rows = generateStepdownCustomSessions({ lastDateUTC: lastUTC, max });

    } else {
      const opts = { lastDateUTC: lastUTC, max, mode };
      if (mode === 'custom') opts.weekdays = selectedWeekdaysSet();
      if (mode === 'twiceDaily') {
        const labels = (el('sessionLabels').value || 'Midday,Evening')
          .split(',').map(s => s.trim()).filter(Boolean);
        opts.sessions = labels.length >= 2 ? [labels[0], labels[1]] : ['Midday','Evening'];
        opts.lastSession = el('lastSession').value;
      }
      rows = generateStepdown(opts);
    }

    renderTable(rows);

    const S = el('summary');
    S.classList.remove('hide');
    //S.innerHTML = buildSummary(rows);

    // if (el('includeNotes').checked) {
    //   const immediate = el('immediateAfter').checked;
    //   const note = document.createElement('div');
    //   note.style.marginTop = '8px';
    //   note.innerHTML =
    //     `<em>Notes:</em> ` +
    //     (immediate
    //       ? `For games that sell immediately after a draw, extend the draw break to <strong>end of day</strong> on the last stepdown date.`
    //       : `MUSL games resume sales at 5:00 AM the day after a draw; an extended draw break is typically <em>not</em> required.`);
    //   S.appendChild(note);
    // }

    toast('Stepdown generated');

  } catch (ex) {
    E.classList.remove('hide');
    E.textContent = ex?.message || 'Unexpected error during generation.';
  }
}



// --- Event listeners ---
const scheduleEl = el('schedule');
scheduleEl.addEventListener('change', onScheduleChange);
el('generate').addEventListener('click', generate);
el('copy').addEventListener('click', copyTable);
el('csv').addEventListener('click', downloadCSV);
el('reset').addEventListener('click', (e)=>{
  e.preventDefault();
  resetForm();
});
// NEW: helper button
// el('fillLastOld').addEventListener('click', (e)=>{ e.preventDefault(); 
//   computeLastOldFromFirstNew(); });

// Custom sessions toggles
el('enableSessions').addEventListener('change', ()=>{
  const on = el('enableSessions').checked;
  el('sessionsConfig').classList.toggle('hide', !on);
  if (on) renderWeekdaySessionMatrix();
});

document.getElementById('sessionMaster').addEventListener('input', ()=>{
  if (el('enableSessions').checked) renderWeekdaySessionMatrix();
});

document.querySelectorAll('#customWeekdays .wd').forEach(cb=>{
  cb.addEventListener('change', ()=>{
    if (el('enableSessions').checked) renderWeekdaySessionMatrix();
  });
});

// Keep last-session options in sync with date
el('lastDate').addEventListener('change', refreshLastSessionCustom);


// Prefill: Mass Cash example (Aug 16, 2025; Max=7; daily)
(function prefill(){
  const d = '';
  el('lastDate').value = d;
  onScheduleChange();
})();

// Show timezone
(function tz(){
  try{ const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; document.getElementById('tz').textContent = tz || 'local'; }
  catch{ document.getElementById('tz').textContent = 'local'; }
})();

// Keyboard: Enter to generate
document.addEventListener('keydown', (e)=>{
  if(e.key==='Enter' && (e.target.tagName==='INPUT' || e.target.tagName==='SELECT')){ e.preventDefault(); generate(); }
});
// Init theme after DOM is ready
// initTheme();
