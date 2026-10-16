// popup.js — Universal Form Auto-Filler

const $ = id => document.getElementById(id);

// ─── Tab switching ────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    $(`panel-${tab.dataset.tab}`).classList.add('active');
  });
});

// ─── Show Profiles Panel ──────────────────────────────────────────────────────
$('hdr-profiles-btn').addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  $('panel-profiles').classList.add('active');
  loadProfilesList();
});

// ─── Load saved settings ──────────────────────────────────────────────────────
chrome.storage.local.get(['apiKey','model','delay','autoSubmit','profile','lastMobile'], res => {
  if (res.apiKey)     $('api-key').value      = res.apiKey;
  if (res.model)      $('model').value         = res.model;
  if (res.delay)      $('delay').value         = res.delay;
  if (res.autoSubmit) $('auto-submit').value   = res.autoSubmit;
  if (res.profile)    $('profile').value       = res.profile;
  if (res.lastMobile) $('mobile-id').value     = res.lastMobile;
  setApiBadge(!!res.apiKey);
});

function setApiBadge(ok) {
  const b = $('api-badge');
  b.textContent = ok ? '✅ Key saved' : '⚠ Not set';
  b.className = `badge ${ok ? 'badge-ok' : 'badge-warn'}`;
}

// ─── Settings: show/hide key ──────────────────────────────────────────────────
$('eye-btn').addEventListener('click', () => {
  const inp = $('api-key');
  inp.type = inp.type === 'password' ? 'text' : 'password';
});

// ─── Save settings ────────────────────────────────────────────────────────────
$('save-btn').addEventListener('click', () => {
  const apiKey = $('api-key').value.trim();
  if (!apiKey) { settingsMsg('❌ Enter your API key first', 'err'); return; }
  if (!apiKey.startsWith('sk-')) { settingsMsg('❌ Key should start with sk-', 'err'); return; }
  chrome.storage.local.set({
    apiKey,
    model:      $('model').value,
    delay:      $('delay').value,
    autoSubmit: $('auto-submit').value,
    profile:    $('profile').value
  }, () => {
    setApiBadge(true);
    settingsMsg('✅ Settings Saved!', 'ok');
  });
});

// ─── Profile Management (Mobile ID, Import, Export, Upload) ───────────────────
$('mobile-id').addEventListener('change', async (e) => {
  const mob = e.target.value.trim();
  if (!mob) return;
  chrome.storage.local.get(['profiles'], res => {
    const profiles = res.profiles || {};
    if (profiles[mob]) {
      $('profile').value = profiles[mob];
      settingsMsg('✅ Profile Loaded', 'ok');
    } else {
      $('profile').value = '';
      settingsMsg('ℹ New Profile', 'info');
    }
    chrome.storage.local.set({ lastMobile: mob });
  });
});

// ─── Auto-extract Mobile from Pasted JSON ─────────────────────────────────────
$('profile').addEventListener('input', (e) => {
  const val = e.target.value.trim();
  if (val.startsWith('{') && val.endsWith('}')) {
    try {
      const obj = JSON.parse(val);
      let mob = obj['mobile_number'] || obj['Mobile Number'] || obj['Phone'] || obj['phone'];
      if (!mob) {
        for (const k of Object.keys(obj)) {
          if (k.toLowerCase().includes('mobile') || k.toLowerCase().includes('phone')) {
            mob = obj[k]; break;
          }
        }
      }
      if (mob) {
        const cleanMob = (mob + '').replace(/[^0-9+]/g, '');
        if (cleanMob && cleanMob !== $('mobile-id').value) {
          $('mobile-id').value = cleanMob;
        }
      }
    } catch (err) {}
  }
});

// ─── Save profile separately (2nd Button) ─────────────────────────────────────
const saveProfileBtn = $('save-profile-btn');
if (saveProfileBtn) {
  saveProfileBtn.addEventListener('click', () => {
    const mob = $('mobile-id').value.trim() || 'default';
    const profText = $('profile').value.trim();
    chrome.storage.local.get(['profiles'], res => {
      const profiles = res.profiles || {};
      profiles[mob] = profText;
      chrome.storage.local.set({ profile: profText, profiles, lastMobile: mob }, () => {
        settingsMsg('✅ Profile Saved!', 'ok');
      });
    });
  });
}

$('export-btn').addEventListener('click', async () => {
  const data = await chrome.storage.local.get(null);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'job_profiles_backup.json';
  a.click();
});

$('import-btn').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await chrome.storage.local.set(data);
    settingsMsg('✅ Data Imported!', 'ok');
    setTimeout(() => location.reload(), 1000);
  } catch (err) {
    settingsMsg('❌ Invalid JSON', 'err');
  }
});

// ─── Get Form Labels Helper ───────────────────────────────────────────────────
async function getFormLabels() {
  try {
    const tab = await getTab();
    try { await sendToContent(tab.id, { action: 'ping' }); }
    catch { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }); await sleep(300); }
    const res = await sendToContent(tab.id, { action: 'getAllQuestions' });
    return (res.fields || []).map(f => f.label);
  } catch (e) { return []; }
}

$('copy-prompt-btn').addEventListener('click', async () => {
  const labels = await getFormLabels();
  let prompt = "I am providing a CV/resume/document. Please extract the data to match the following form fields exactly.\n\n";
  if (labels.length) {
    prompt += "Form Fields to extract:\n" + labels.map(l => "- " + l).join('\n') + "\n\n";
  } else {
    prompt += "(Note: No form fields detected on current page. Please extract comprehensive personal, education, and experience details.)\n\n";
  }
  prompt += "Return the result STRICTLY as a raw JSON object (do not wrap it in ```json). Ensure there is a 'Mobile Number' or 'Phone' key.";
  await navigator.clipboard.writeText(prompt);
  settingsMsg('✅ Prompt Copied!', 'ok');
});

$('process-cv-btn').addEventListener('click', async () => {
  const file = $('cv-upload').files[0];
  if (!file) {
    settingsMsg('❌ Select a file first', 'warn');
    return;
  }
  
  const apiKey = $('api-key').value.trim();
  const model = $('model').value || 'gpt-4o-mini';
  $('profile').value = '⏳ Reading file... Please wait.';
  
  const btn = $('process-cv-btn');
  const originalText = btn.textContent;
  btn.innerHTML = '<span class="spin" style="width:12px;height:12px;border-width:2px;margin-right:5px;"></span> <span style="display:inline-block;vertical-align:top;">Uploading...</span>';
  btn.disabled = true;

  try {
    let text = '';
    if (file.name.endsWith('.txt') || file.name.endsWith('.json')) {
      text = await file.text();
    } else if (file.name.endsWith('.pdf')) {
      if (typeof pdfjsLib === 'undefined') {
        settingsMsg('❌ pdf.js missing!', 'err');
        $('profile').value = `ERROR: Missing PDF.js files!

Please download these two files and save them in your extension folder:
1. [https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js](https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js)
2. [https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js](https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js)

After saving them as "pdf.min.js" and "pdf.worker.min.js", reload the extension.`;
        btn.innerHTML = originalText;
        btn.disabled = false;
        return;
      }
      // Crucial Fix: Bypass worker entirely to prevent Chrome Extension hanging
      pdfjsLib.GlobalWorkerOptions.disableWorker = true;
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer),
        isEvalSupported: false,
        disableWorker: true
      }).promise;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(' ') + '\n';
      }
    } else {
      settingsMsg('❌ Unsupported file', 'err');
      btn.innerHTML = originalText;
      btn.disabled = false;
      return;
    }

    if (!apiKey) {
      $('profile').value = text;
      settingsMsg('⚠ Raw text loaded (No API Key)', 'warn');
      btn.innerHTML = originalText;
      btn.disabled = false;
      return;
    }

    settingsMsg('⏳ AI formatting data...', 'info');
    $('profile').value = '🧠 AI is analyzing and structuring CV data...';
    
    // Get form labels from the active page to guide the AI
    const labels = await getFormLabels();
    
    const aiDataStr = await formatCVWithAI(apiKey, model, text, labels);
    
let aiObj = {};
    try {
      // Replaced literal backticks with `{3} to prevent Regex Syntax Errors
      const cleanStr = aiDataStr.replace(/`{3}json/gi, '').replace(/`{3}/g, '').trim();
      aiObj = JSON.parse(cleanStr);
    } catch (e) {
      throw new Error("AI did not return valid JSON.");
    }

    // Auto-detect mobile number
    let mob = aiObj['mobile_number'] || aiObj['Mobile Number'] || aiObj['Phone'] || aiObj['phone'] || '';
    if (!mob) {
      for (const k of Object.keys(aiObj)) {
        if (k.toLowerCase().includes('mobile') || k.toLowerCase().includes('phone')) {
          mob = aiObj[k]; break;
        }
      }
    }
    const cleanMob = (mob + '').replace(/[^0-9+]/g, '');
    const finalMob = cleanMob || $('mobile-id').value.trim() || 'default_' + Math.floor(Math.random()*1000);

    const profText = JSON.stringify(aiObj, null, 2);
    $('profile').value = profText;
    $('mobile-id').value = finalMob;
    
    chrome.storage.local.get(['profiles'], res => {
      const profiles = res.profiles || {};
      profiles[finalMob] = profText;
      chrome.storage.local.set({ profile: profText, profiles, lastMobile: finalMob });
    });
    
    settingsMsg('✅ AI Profile Saved!', 'ok');
  } catch (err) {
    console.error(err);
    $('profile').value = `❌ ERROR: ${err.message}\n\n(If this says "OpenAI API Failed", please check your OpenAI API key and billing credits.)`;
    settingsMsg('❌ Failed', 'err');
  }

  btn.textContent = originalText;
  btn.disabled = false;
});

async function formatCVWithAI(apiKey, model, rawText, labels) {
  const system = `You are an expert data extraction AI. Extract candidate data from the CV/resume text.
Return ONLY a valid JSON object. Do not wrap it in markdown formatting blocks like \`\`\`json.
Always include a 'mobile_number' key.`;
  
  let userPrompt = `CV/Resume Text:\n${rawText.substring(0, 15000)}\n\n`;
  if (labels && labels.length > 0) {
    userPrompt += `Extract these specific fields: ${labels.join(', ')}. `;
  }
  userPrompt += `Format the output strictly as a raw JSON object.`;

  let apiModel = model;
  if (apiModel === 'o4-mini') apiModel = 'gpt-4o-mini';
  const res = await fetch('[https://api.openai.com/v1/chat/completions](https://api.openai.com/v1/chat/completions)', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: apiModel,
      messages: [ { role: 'system', content: system }, { role: 'user', content: rawText.substring(0, 20000) } ]
    })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(`OpenAI API Failed (${res.status}): ${errData.error?.message || 'Unknown'}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || rawText;
}

function loadProfilesList() {
  const list = $('profiles-list');
  list.innerHTML = '';
  
  const selectAllCb = $('select-all-profiles');
  if (selectAllCb) selectAllCb.checked = false;

  chrome.storage.local.get(['profiles'], res => {
    const profiles = res.profiles || {};
    const keys = Object.keys(profiles);
    
    const countEl = $('profile-count');
    if (countEl) countEl.textContent = keys.length;

    if (keys.length === 0) {
      list.innerHTML = '<div style="padding:10px;font-size:12px;color:#64748b">No saved profiles yet. Upload a CV or save a profile in Settings.</div>';
      return;
    }
    keys.forEach(mob => {
      const item = document.createElement('div');
      item.className = 'q-item';
      item.innerHTML = `
        <input type="checkbox" class="prof-checkbox" data-mob="${mob}" style="width:auto;margin:0" />
        <span class="q-icon">👤</span>
        <span class="q-text" style="font-weight:bold; color:#e2e8f0;">${mob}</span>
        <button class="btn btn-outline btn-sm load-prof-btn" style="padding:4px 8px;font-size:10px;width:auto">Load</button>
        <button class="btn btn-red btn-sm del-prof-btn" style="padding:4px 8px;font-size:10px;width:auto;margin-left:4px">Delete</button>
      `;
      item.querySelector('.load-prof-btn').addEventListener('click', () => {
        $('mobile-id').value = mob;
        $('profile').value = profiles[mob];
        chrome.storage.local.set({ lastMobile: mob, profile: profiles[mob] });
        settingsMsg(`✅ Loaded ${mob}`, 'ok');
        document.querySelector('.tab[data-tab="settings"]').click();
      });
      item.querySelector('.del-prof-btn').addEventListener('click', () => {
        delete profiles[mob];
        chrome.storage.local.set({ profiles }, () => loadProfilesList());
      });
      list.appendChild(item);
    });
  });
}

function profilesMsg(txt, type) {
  const msgEl = $('profiles-msg');
  if (msgEl) {
    msgEl.innerHTML = `<span class="badge badge-${type}">${txt}</span>`;
    setTimeout(() => msgEl.innerHTML = '', 3000);
  }
}

const selectAllCb = $('select-all-profiles');
if (selectAllCb) {
  selectAllCb.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    document.querySelectorAll('.prof-checkbox').forEach(cb => {
      cb.checked = isChecked;
    });
  });
}

$('prof-export-btn').addEventListener('click', () => {
  const selectedMobs = Array.from(document.querySelectorAll('.prof-checkbox:checked')).map(cb => cb.dataset.mob);
  if (selectedMobs.length === 0) {
    profilesMsg('❌ Select at least one profile', 'warn');
    return;
  }
  
  chrome.storage.local.get(['profiles'], res => {
    const profiles = res.profiles || {};
    const exportData = { profiles: {} };
    for (const mob of selectedMobs) {
      if (profiles[mob]) exportData.profiles[mob] = profiles[mob];
    }
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'selected_profiles_backup.json';
    a.click();
  });
});

$('prof-import-btn').addEventListener('click', () => $('prof-import-file').click());
$('prof-import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    if (data.profiles) {
      chrome.storage.local.get(['profiles'], res => {
        const currentProfiles = res.profiles || {};
        const newProfiles = { ...currentProfiles, ...data.profiles };
        chrome.storage.local.set({ profiles: newProfiles }, () => {
          loadProfilesList();
          profilesMsg('✅ Profiles Imported!', 'ok');
        });
      });
    } else {
       await chrome.storage.local.set(data);
       loadProfilesList();
       profilesMsg('✅ Full Data Imported!', 'ok');
    }
  } catch (err) {
    profilesMsg('❌ Invalid JSON', 'err');
  }
  e.target.value = '';
});

function settingsMsg(txt, type) {
  $('settings-msg').innerHTML = `<span class="badge badge-${type}">${txt}</span>`;
  setTimeout(() => $('settings-msg').innerHTML = '', 3000);
}

// ─── Test API ─────────────────────────────────────────────────────────────────
// Updated Test API for background.js routing
$('test-btn').addEventListener('click', () => {
  const key = $('api-key').value.trim();
  if (!key) { settingsMsg('❌ Enter key first', 'err'); return; }
  $('test-btn').textContent = '⏳ Testing…';
  $('test-btn').disabled = true;

  chrome.runtime.sendMessage({
    action: "fetchAPI",
    url: 'https://api.openai.com/v1/models',
    options: {
      headers: { Authorization: `Bearer ${key}` }
    }
  }, (response) => {
    if (chrome.runtime.lastError || response.error) {
      settingsMsg(`❌ Error: ${chrome.runtime.lastError?.message || response.error}`, 'err');
    } else {
      settingsMsg(response.ok ? '✅ Connection OK!' : '❌ Invalid key', response.ok ? 'ok' : 'err');
    }
    $('test-btn').textContent = '🧪 Test API Key';
    $('test-btn').disabled = false;
  });
});

// ─── Logging ──────────────────────────────────────────────────────────────────
function log(msg, type = 'info') {
  const box = $('log');
  const line = document.createElement('div');
  line.className = type;
  const ts = new Date().toLocaleTimeString('en', { hour12: false });
  line.textContent = `[${ts}] ${msg}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}
function logClear() { $('log').innerHTML = ''; }

// ─── Get active tab ───────────────────────────────────────────────────────────
async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// ─── Send message to content script ──────────────────────────────────────────
function sendToContent(tabId, msg) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, msg, res => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(res);
    });
  });
}

// ─── Scan ALL page forms ──────────────────────────────────────────────────────
let allFields = [];

$('scan-btn').addEventListener('click', async () => {
  $('scan-btn').innerHTML = '<span class="spin"></span> Scanning…';
  $('scan-btn').disabled = true;
  logClear();

  try {
    const tab = await getTab();

    try {
      await sendToContent(tab.id, { action: 'ping' });
    } catch {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await sleep(300);
    }

    const res = await sendToContent(tab.id, { action: 'getAllQuestions' });
    allFields = res.fields || [];
    renderFields(allFields);
    log(`Found ${allFields.length} form fields.`, allFields.length ? 'ok' : 'warn');
  } catch (e) {
    log(`Scan error: ${e.message}`, 'err');
  }

  $('scan-btn').innerHTML = '🔍 Scan All Page Forms';
  $('scan-btn').disabled = false;
});

function renderFields(fields) {
  const section = $('q-section');
  const list    = $('q-list');
  const total   = $('q-total');

  section.classList.remove('hidden');
  total.textContent = fields.length;
  list.innerHTML = '';

  if (!fields.length) {
    list.innerHTML = '<div style="padding:10px;font-size:12px;color:#64748b">No form fields found.</div>';
    return;
  }

  const typeIcons = {
    'text': '📝', 'textarea': '📝',
    'radio-group': '🔘',
    'checkbox-group': '☑️',
    'select': '📋',
    'contenteditable': '✏️',
    'slider': '📊',
    'captcha': '🖼️',
    'date': '📅'
  };

  fields.forEach((f, i) => {
    const item = document.createElement('div');
    item.className = 'q-item' + (f.filled ? ' done' : '');
    item.id = `qi-${i}`;
    const icon = typeIcons[f.type] || '❓';
    const label = f.label.length > 55 ? f.label.slice(0,55) + '…' : f.label;
    item.innerHTML = `
      <div class="q-dot ${f.filled ? 'done' : ''}" id="qdot-${i}"></div>
      <span class="q-icon">${icon}</span>
      <span class="q-text">${label}</span>
      <span class="q-type small">${f.type}</span>
      <span class="q-status" id="qstat-${i}">${f.filled ? '✓' : '—'}</span>
    `;
    list.appendChild(item);
  });
}

function setFieldStatus(i, state) {
  const dot  = $(`qdot-${i}`);
  const stat = $(`qstat-${i}`);
  const item = $(`qi-${i}`);
  if (!dot) return;

  dot.className = `q-dot ${state === 'done' ? 'done' : state === 'fail' ? 'fail' : state === 'active' ? 'active' : ''}`;
  stat.textContent = state === 'done' ? '✓' : state === 'fail' ? '✗' : state === 'active' ? '…' : '—';
  item.className = `q-item${state === 'active' ? ' active-q' : state === 'done' ? ' done' : ''}`;
  if (state === 'active') item.scrollIntoView({ block: 'nearest' });
}

// ─── Progress ─────────────────────────────────────────────────────────────────
function setProgress(done, total) {
  $('prog-text').textContent = `${done} / ${total}`;
  $('prog-fill').style.width = total ? `${(done / total) * 100}%` : '0%';
}

// ─── Auto Fill All ────────────────────────────────────────────────────────────
let running = false;

$('run-btn').addEventListener('click', async () => {
  if (running) return;

  const profileEl = $('profile');
  const profile = profileEl ? profileEl.value.trim() : '';
  if (profileEl) chrome.storage.local.set({ profile });

  const stored = await chrome.storage.local.get(['apiKey','model','delay','profile']);
  if (!stored.apiKey) {
    log('❌ No API key! Settings tab → Save key.', 'err');
    return;
  }

  if (!allFields.length) {
    log('⚠ No fields. Scan first.', 'warn');
    return;
  }

  running = true;
  $('run-btn').innerHTML = '<span class="spin"></span> Filling…';
  $('run-btn').disabled = true;
  $('stop-btn').classList.remove('hidden');
  $('prog-section').classList.remove('hidden');

  const delay = Math.max(400, parseInt(stored.delay || '900'));
  const model = stored.model || 'gpt-4o-mini';
  const total = allFields.length;
  let answered = 0;

  logClear();
  setProgress(0, total);
  log(`Filling ${total} fields with ${model}`, 'info');

  const tab = await getTab();
  try {
    await sendToContent(tab.id, { action: 'ping' });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  }

  for (let i = 0; i < total; i++) {
    if (!running) break;

    setFieldStatus(i, 'active');
    const f = allFields[i];
    log(`[${i+1}/${total}] ${f.type}: "${f.label.slice(0,55)}…"`, 'info');

    try {
      const options = f.options || null;
      log(`   ${options ? 'Options: ' + options.slice(0,3).join(' | ') : 'Text field'}`, 'info');

      // FIXED: Added f.nameAttr to the function call
      const answer = await askAI(stored.apiKey, model, profile || stored.profile, f.label, options, f.type, f.imageSrc, f.nameAttr);
      log(`   AI: "${answer.slice(0,60)}…"`, 'ok');

      const success = await sendToContent(tab.id, {
        action: 'applyAnswerField',
        fieldId: f.fieldId,
        label: f.label,
        type: f.type,
        answer
      });

      if (success) {
        setFieldStatus(i, 'done');
        answered++;
        log('   ✔ Filled', 'ok');
      } else {
        setFieldStatus(i, 'fail');
        log('   ✗ Failed', 'err');
      }
    } catch (e) {
      log(`   Error: ${e.message}`, 'err');
      setFieldStatus(i, 'fail');
    }

    setProgress(i + 1, total);
    await sleep(delay);
  }

  log(`✅ Complete! Filled ${answered}/${total} fields.`, 'ok');
  running = false;
  $('run-btn').innerHTML = '⚡ Auto Fill All';
  $('run-btn').disabled = false;
  $('stop-btn').classList.add('hidden');
});

$('stop-btn').addEventListener('click', () => running = false);

// ─── Universal AI Ask ─────────────────────────────────────────────────────────

// FIXED: Added nameAttr parameter to the function definition
async function askAI(apiKey, model, profile, label, options, type, imageSrc, nameAttr) {
  const isText = (!options && type !== 'number' && type !== 'date' && type !== 'captcha') || type.includes('text') || type === 'contenteditable';
  const isMulti = type === 'checkbox-group';
  const isNumber = type === 'number';
  const isDate = type === 'date';
  const isCaptcha = type === 'captcha';
  const promptType = isCaptcha ? 'captcha' : isDate ? 'date' : isNumber ? 'number' : isText ? 'text' : isMulti ? 'multi' : 'single';

  const system = `Form auto-filler. Match user profile exactly.

- TEXT: 1-3 realistic sentences.
- NUMBER: exact numeric value only.
- DATE: exact date in YYYY-MM-DD format only.
- CAPTCHA: exact text/numbers shown in the image only.
- SINGLE choice: exact option text only.
- MULTI choice: JSON array ["exact1","exact2"]. (If an option is "If Applicable" and the profile has this data, select it).
NO extra text, explanations, or quotes. Return empty string if not applicable.`;

  const lbl = label.toLowerCase();
  const nAttr = (nameAttr || '').toLowerCase();
  
  // Custom logic to include internal names specifically for Teletalk-like academic fields (SSC, HSC, Roll, Result, Passing Year, etc.)
  const includeNameAttr = nameAttr && (
    nAttr.includes('ssc') || nAttr.includes('hsc') || nAttr.includes('gra') || 
    nAttr.includes('mas') || nAttr.includes('honors') || nAttr.includes('bachelor') || 
    nAttr.includes('roll') || nAttr.includes('result') || nAttr.includes('year') || 
    nAttr.includes('board') || nAttr.includes('group') || nAttr.includes('exam') || 
    nAttr.includes('institute')
  );

  const user = isCaptcha ? `Label: "${label}"\nType: captcha\nExtract the verification code from the image. Return ONLY the code.` : `Profile: ${profile || 'Typical adult.'}

Label: "${label}"${includeNameAttr ? `\nInternal Name: "${nameAttr}"` : ''}
Type: ${promptType}${options ? `

Options:
${options.map((o,i) => `${i+1}. ${o}`).join('\n')}
Pick:` : `

Answer:`}`;

  // Vision safeguard: Map bad names and enforce gpt-4o family for images
  let apiModel = model;
  if (apiModel === 'o4-mini') apiModel = 'gpt-4o-mini';
  if (imageSrc && !apiModel.includes('4o')) apiModel = 'gpt-4o-mini';

  let messages = [{role: 'system', content: system}];
  if (imageSrc) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: user },
        { type: 'image_url', image_url: { url: imageSrc } }
      ]
    });
  } else {
    messages.push({ role: 'user', content: user });
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: apiModel,
      messages: messages
    })
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

const sleep = ms => new Promise(r => setTimeout(r, ms));