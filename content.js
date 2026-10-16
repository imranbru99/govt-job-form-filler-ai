// content.js — injected into every page
// Handles: scan nav questions → click each → read options → apply answer

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === 'ping') {
    sendResponse({ status: 'ok' });
    return true;
  }

  if (message.action === 'getAllQuestions') {
    try {
      const fields = getAllFormFields();
      sendResponse({ fields });
    } catch (error) {
      console.error('[SurveyAI] Scan Error:', error);
      sendResponse({ fields: [], error: error.message });
    }
    return true;
  }

  if (message.action === 'getNavQuestions') {
    sendResponse({ questions: getNavQuestions() });
    return true;
  }

  if (message.action === 'clickNavAndGetOptions') {
    clickNavAndGetOptions(message.index).then(result => sendResponse(result));
    return true;
  }

  if (message.action === 'applyAnswer' || message.action === 'applyAnswerField') {
    (async () => {
      const fieldId = message.fieldId;
      let input = null;
      
      // Try to find the input by id or name
      if (fieldId) {
        input = document.getElementById(fieldId) || document.querySelector(`[name="${fieldId}"]`);
      }
      
      // If not found by fieldId, try to find by any input matching the label
      if (!input && message.label) {
        const inputs = document.querySelectorAll('input, select, textarea');
        const searchLabel = message.label.toLowerCase().slice(0, 20);
        for (const inp of inputs) {
          let labelText = '';
          
          // 1. Standard label
          const labelEl = document.querySelector(`label[for="${inp.id}"]`) || inp.closest('label') || inp.parentElement?.querySelector('label');
          if (labelEl) labelText = labelEl.textContent.trim();
          
          // 2. aria-label
          if (!labelText) labelText = inp.getAttribute('aria-label') || '';
          
          // 3. aria-labelledby
          if (!labelText) {
            const ariaLabelledBy = inp.getAttribute('aria-labelledby');
            if (ariaLabelledBy) {
              const parts = [];
              for (const id of ariaLabelledBy.split(/\s+/)) {
                const el = document.getElementById(id);
                if (el) parts.push(el.textContent.trim());
              }
              labelText = parts.join(' ').trim();
            }
          }
          
          // 4. Placeholder
          if (!labelText) labelText = inp.placeholder || '';
          
          // 5. Angular Material Label
          if (!labelText) {
            const matLabel = inp.closest('mat-form-field')?.querySelector('mat-label');
            if (matLabel) labelText = matLabel.textContent.trim();
          }
          
          // 6. Closest container
          if (!labelText) {
            const container = inp.closest('[class*="question"], .questionAndAnswerWrap, .form-group, fieldset, mat-card-content, [class*="card"]');
            if (container) {
              const titleEl = container.querySelector('.question-title-frontend, [class*="question-title" i], [class*="questiontext" i], [class*="question-text" i], h3, legend, .QuestionText, mat-label');
              if (titleEl) labelText = titleEl.textContent.trim();
            }
          }
          
          if (labelText && labelText.toLowerCase().includes(searchLabel)) {
            input = inp;
            break;
          }
        }
      }
      
      let result = false;
      if (input) {
        // Apply the answer to the found input
        result = await applyAnswerToInput(input, message.answer);
      } else {
        // Fallback: try to apply to any visible field
        result = applyAnswer(message.answer || message.chosen, message.type, message.autoSubmit);
      }
      
      sendResponse({ success: result });
    })();
    return true;
  }

  if (message.action === 'clickSubmit') {
    const ok = clickSubmitBtn();
    sendResponse({ success: ok });
    return true;
  }
});

// ── Get all form fields from the page ─────────────────────────────────────
function getAllFormFields() {
  const fields = [];
  
  // Universal search: standard inputs + modern ARIA components + content editables
  const inputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea, [role="radio"], [role="checkbox"], [role="combobox"], [role="textbox"], [contenteditable="true"]');
  const processedGroups = new Set();
  
// Try to get the current question title if it exists (common in survey forms)
  // Include .question-label for grid questions like Qualtrics where label is "question-label"
  const questionTitleEl = document.querySelector('.question-title-frontend, [class*="question-title"], [class*="question-text"], .question-label, h3, mat-label');
  const questionTitle = questionTitleEl?.textContent?.trim() || '';
  
  inputs.forEach((input, idx) => {
    // Do NOT skip disabled fields. Forms (like Teletalk) dynamically enable sections (Masters/Exp) when a checkbox is clicked.
    if (input.getAttribute('aria-disabled') === 'true') return;
    
    // Modern UI Framework Support: Check if element is visually hidden
    const isVisuallyHidden = input.offsetWidth === 0 && input.offsetHeight === 0;
    if (isVisuallyHidden) {
      // React/Vue/Tailwind often hide the input but show the label. 
      // If no label or wrapper exists, it's truly hidden, so we skip it.
      const lbl = document.querySelector(`label[for="${input.id}"]`) || input.closest('label, .form-check, [class*="radio"], [class*="checkbox"]');
      if (!lbl && !input.classList.contains('bs-select-hidden') && !input.classList.contains('gpaVal') && !input.classList.contains('other_value')) {
        return;
      }
    }
    
    // Skip filter/checkout checkboxes
    if (input.type === 'checkbox' && (input.id?.toLowerCase().includes('filter') || input.id?.toLowerCase().includes('checkout'))) return;
    
    // Skip hidden bootstrap-select original inputs (they have bs-select-hidden class)
    const isBootstrapHidden = input.classList.contains('bs-select-hidden');
    if (isBootstrapHidden) return;

    // For radio and checkbox, determine group to avoid duplicating questions
    const inputType = input.type || input.getAttribute('role');
    let groupContainer = null;
    if (inputType === 'radio' || inputType === 'checkbox') {
      // Universal group matching. Removed 'li' and 'tr' so it targets the true parent wrapper instead of individual list items
      groupContainer = input.closest('fieldset, [role="group"], [role="radiogroup"], [role="listbox"], div[class*="group" i], div[class*="question" i], .questionAndAnswerWrap');
      
      let groupId = '';
      if (groupContainer) {
        if (!groupContainer.dataset.surveyAiGroupId) groupContainer.dataset.surveyAiGroupId = 'group-' + Math.random().toString(36).substr(2, 9);
        groupId = groupContainer.dataset.surveyAiGroupId;
      } else if (input.name) {
        groupId = input.name;
      } else {
        groupId = `standalone-${idx}`; // No name and no container found
      }
      
      // If we already processed this group, skip this input entirely!
      if (processedGroups.has(groupId)) return;
      processedGroups.add(groupId);
    }
    
// Get label
    let label = '';
    const ariaLabel = input.getAttribute('aria-label');
    const ariaLabelledBy = input.getAttribute('aria-labelledby');
    
    if (ariaLabel) {
      label = ariaLabel.trim();
    } else if (ariaLabelledBy) {
      const ids = ariaLabelledBy.split(/\s+/);
      const parts = [];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) parts.push(el.textContent.trim());
      }
      label = parts.join(' ').trim();
    }

    let directLabel = '';
    // Try to find the label element containing this input
    const closestLabelEl = input.closest('label');
    if (closestLabelEl) {
      // Get all text content within the label, but exclude the input itself
      const labelClone = closestLabelEl.cloneNode(true);
      const inputClone = labelClone.querySelector('input, select, textarea');
      if (inputClone) inputClone.remove();
      directLabel = labelClone.textContent.trim();
    }
    if (!directLabel) {
      const labelEl = document.querySelector(`label[for="${input.id}"]`);
      if (labelEl) {
        const labelClone = labelEl.cloneNode(true);
        const inputClone = labelClone.querySelector('input, select, textarea');
        if (inputClone) inputClone.remove();
        directLabel = labelClone.textContent.trim();
      } else {
        directLabel = labelEl?.textContent?.trim() || '';
      }
    }
    
    // For text inputs, immediately adopt the direct label. For choices, hold off.
    if (inputType !== 'radio' && inputType !== 'checkbox' && !label) {
      label = directLabel;
    }

    if (!label) {
      // Try to find label from preceding sibling
      const prev = input.previousElementSibling;
      if (prev?.tagName === 'LABEL') {
        label = prev.textContent.trim();
      } else if (prev?.tagName === 'SELECT') {
        const prevLabel = document.querySelector(`label[for="${prev.id}"]`) || prev.closest('.form-group')?.querySelector('label');
        if (prevLabel) label = prevLabel.textContent.trim() + ' (Value/GPA/Other)';
      }
    }
    
    if (!label) {
      let wrapper = input.parentElement;
      let depth = 0;
      while (wrapper && wrapper !== document.body && depth < 5 && !label) {
        let prev = wrapper.previousElementSibling;
        while (prev && !label) {
          if (prev.tagName === 'LABEL' || 
              ['H2', 'H3', 'H4', 'H5', 'H6', 'LEGEND'].includes(prev.tagName) ||
              (prev.classList && (prev.classList.contains('form-label') || prev.classList.contains('question-label')))) {
            label = prev.textContent.trim();
          } else {
            const possibleLabel = prev.querySelector('label, [class*="question-title"], [class*="form-label"]');
            if (possibleLabel && !prev.querySelector('input:not([type="hidden"]), select, textarea')) {
                label = possibleLabel.textContent.trim();
            }
          }
          prev = prev.previousElementSibling;
        }
        wrapper = wrapper.parentElement;
        depth++;
      }
    }

    if (!label) {
      const matLabel = input.closest('mat-form-field')?.querySelector('mat-label');
      if (matLabel) label = matLabel.textContent.trim();
    }
    
    if (!label) {
      const container = input.closest('[class*="question"], .questionAndAnswerWrap, .form-group, fieldset, mat-card-content, [class*="card" i]');
      if (container) {
        const titleEl = container.querySelector('.question-title-frontend, [class*="question-title" i], [class*="questiontext" i], [class*="question-text" i], h3, legend, .QuestionText, mat-label, p[class*="MuiTypography-body"]');
        if (titleEl) label = titleEl.textContent.trim();
      }
    }
    
    // If still no label, use the question title as label
    if (!label && questionTitle) {
      label = questionTitle;
    }
    
    // Fallback for radio/checkbox if no outer question label was found
    if (!label && directLabel) {
      label = directLabel;
    }
    
    // Add context to generic labels to help the AI distinguish sections (e.g., "SSC" vs "HSC" Roll No)
    if (label) {
      const fieldset = input.closest('fieldset');
      if (fieldset) {
        const legend = fieldset.querySelector('legend');
        if (legend) {
          const legendText = legend.textContent.replace(/\*/g, '').replace(/ADD MORE/ig, '').trim();
          if (legendText && legendText.length < 50 && !label.toLowerCase().includes(legendText.toLowerCase())) {
            label = `${legendText} > ${label}`;
          }
        }
      }
    }
    
    // Skip site controls / non-survey toggles (like "Disable Analytics" in the footer)
    const searchStr = `${input.id || ''} ${input.name || ''} ${label}`.toLowerCase();
    if (
      searchStr.includes('disable analytics') || 
      searchStr.includes('enable analytics') || 
      searchStr.includes('cookie settings') || 
      searchStr.includes('accept cookies')
    ) {
      return;
    }
    
    // Determine field type
    let fieldType = inputType || input.tagName.toLowerCase();
    if (input.isContentEditable) fieldType = 'contenteditable';
    if (fieldType === 'textarea') fieldType = 'textarea';
    else if (fieldType === 'select' || fieldType === 'select-one' || fieldType === 'select-multiple' || input.tagName.toLowerCase() === 'select') fieldType = 'select';
    else if (fieldType === 'radio') fieldType = 'radio-group';
    else if (fieldType === 'checkbox') fieldType = 'checkbox-group';
    else if (fieldType === 'number') fieldType = 'number';
    else if (fieldType === 'date') fieldType = 'date';
    else if (fieldType === 'textbox') fieldType = 'text';
    else fieldType = 'text';
    
    // Image/Captcha Detection
    let imageSrc = null;
    const lblLower = label.toLowerCase();
    
    // Check if the input's wrapper has an image
    let img = null;
    const wrapper = input.closest('.form-group, fieldset, [class*="question"], .questionAndAnswerWrap, .card');
    if (wrapper) {
      img = wrapper.querySelector('img[src*="captcha" i], img[id*="captcha" i], img[alt*="captcha" i]');
      if (!img && (lblLower.includes('code') || lblLower.includes('captcha') || lblLower.includes('verification'))) {
        // Any image in this block might be the captcha
        img = wrapper.querySelector('img:not([src*="logo" i])');
      }
    }
    
    if (img && img.src) {
      imageSrc = getBase64Image(img);
      fieldType = 'captcha';
    }

    // Check if already filled
    let filled = false;
    if (inputType === 'checkbox' || inputType === 'radio') {
      filled = input.checked || input.getAttribute('aria-checked') === 'true';
    } else {
      filled = !!(input.value?.trim() || input.textContent?.trim());
    }
    
    // Get options for select/radio/checkbox groups
    let options = null;
    if (fieldType === 'select') {
      // Get options from the select element
      options = [...input.options]
        .map(o => o.text.trim())
        .filter(t => t && !/^(make selection|choose one|select one|please select)$/i.test(t));
      
      // Also try to get options from bootstrap-select dropdown menu if present
      const selectId = input.id;
      const dropdown = document.querySelector(`.bootstrap-select[data-id="${selectId}"] ul.dropdown-menu`);
      if (dropdown) {
        const liOptions = [...dropdown.querySelectorAll('li a span.text')].map(li => li.textContent.trim()).filter(Boolean);
        if (liOptions.length > options.length) {
          options = liOptions;
        }
      }
    } else if (fieldType === 'radio-group' || fieldType === 'checkbox-group') {
      let groupInputs;
      if (groupContainer) {
        const role = input.getAttribute('role');
        if (role) groupInputs = groupContainer.querySelectorAll(`[role="${role}"]`);
        else groupInputs = groupContainer.querySelectorAll(`input[type="${input.type}"]`);
      } else if (input.name) {
        groupInputs = document.querySelectorAll(`input[name="${input.name}"]`);
      } else {
        groupInputs = [input]; // Standalone unnamed input
      }
      
      options = [...groupInputs].map(inp => {
        // Try to find the label element containing this input
        let lblText = '';
        const labelEl = inp.closest('label');
        if (labelEl) {
          // Clone the label to get text without the input
          const labelClone = labelEl.cloneNode(true);
          const inputClone = labelClone.querySelector('input, select, textarea');
          if (inputClone) inputClone.remove();
          lblText = labelClone.textContent.trim();
        }
        if (!lblText) {
          const externalLabel = document.querySelector(`label[for="${inp.id}"]`);
          if (externalLabel) {
            const labelClone = externalLabel.cloneNode(true);
            const inputClone = labelClone.querySelector('input, select, textarea');
            if (inputClone) inputClone.remove();
            lblText = labelClone.textContent.trim();
          }
        }
        return lblText || inp.value || inp.getAttribute('aria-label') || '';
      }).filter(Boolean);
    }
    
    // Generate a unique field ID
    let fieldId = input.id || input.name;
    if (!fieldId) {
      fieldId = `survey-ai-field-${idx}`;
      input.id = fieldId; // Inject the generated ID into the DOM element
    }
    
    fields.push({
      fieldId: fieldId,
      nameAttr: input.name || input.id || '',
      label: label || input.name || input.placeholder || 'Unlabeled field',
      type: fieldType,
      filled,
      options,
      imageSrc
    });
  });
  
  // Also try to find bootstrap-select dropdowns (they are rendered differently)
  const bootstrapSelects = document.querySelectorAll('.bootstrap-select select');
  bootstrapSelects.forEach((select, idx) => {
    // Skip if already processed
    if (fields.some(f => f.fieldId === select.id)) return;
    if (select.hidden) return; // Allow disabled for dynamically enabled sections
    
    const selectId = select.id;
    const dropdown = document.querySelector(`.bootstrap-select[data-id="${selectId}"]`);
    const dropdownButton = dropdown?.querySelector('button');
    const currentText = dropdownButton?.querySelector('.filter-option')?.textContent?.trim() || '';
    
    // Get label - try parent containers
    let label = '';
    const parentForm = select.closest('form') || select.closest('[class*="question"]');
    const titleEl = parentForm?.querySelector('.question-title-frontend, [class*="question-title"], h3');
    if (titleEl) {
      label = titleEl.textContent.trim();
    }
    
    // Get options from the dropdown menu
    const dropdownMenu = dropdown?.querySelector('ul.dropdown-menu');
    let options = [];
    if (dropdownMenu) {
      options = [...dropdownMenu.querySelectorAll('li a span.text')].map(li => li.textContent.trim()).filter(Boolean);
    }
    if (options.length === 0) {
      options = [...select.options].map(o => o.text.trim()).filter(Boolean);
    }
    
    const filled = currentText && currentText !== 'Choose one' && currentText !== '';
    
    let fieldId = selectId;
    if (!fieldId) {
      fieldId = `survey-ai-bs-select-${idx}`;
      select.id = fieldId;
    }

    fields.push({
      fieldId: fieldId,
      nameAttr: select.name || select.id || '',
      label: label || select.name || 'Unlabeled dropdown',
      type: 'select',
      filled,
      options
    });
  });
  
  return fields;
}

// ── Get all nav questions from left panel ─────────────────────────────────────
function getNavQuestions() {
  const results = [];
  const rows = document.querySelectorAll(
    '.question-row, [class*="question-row"]'
  );
  rows.forEach((row, idx) => {
    const textEl = row.querySelector('.question-text, [class*="question-text"]') || row;
    const text = textEl.textContent.trim();
    if (!text) return;
    results.push({
      index:    idx,
      text,
      answered: row.className.includes('answered'),
      active:   row.className.includes('active')
    });
  });
  return results;
}

// ── Click a nav row and wait for right panel to load ─────────────────────────
async function clickNavAndGetOptions(navIndex) {
  const rows = document.querySelectorAll('.question-row, [class*="question-row"]');
  if (navIndex >= rows.length) {
    return { success: false, error: `Index ${navIndex} out of range (${rows.length})` };
  }

  const row = rows[navIndex];
  const questionEl = row.querySelector('.question-text, [class*="question-text"]') || row;
  const questionText = questionEl.textContent.trim();

  // Click nav item
  row.click();
  row.dispatchEvent(new MouseEvent('click', { bubbles: true }));

  // Wait for right panel options to appear
  await sleep(600);
  await waitForOptions(1500);

  const { options, type, inputType } = getRightPanelOptions();

  return { success: true, questionText, options, type, inputType };
}

function waitForOptions(timeout) {
  return new Promise(resolve => {
    const start = Date.now();
    const check = setInterval(() => {
      const has =
        document.querySelectorAll('mat-radio-button').length > 0 ||
        document.querySelectorAll('mat-checkbox').length > 0 ||
        document.querySelectorAll('.profileOptions input').length > 0 ||
        document.querySelectorAll('.qsn-wrapper input').length > 0;
      if (has || Date.now() - start > timeout) {
        clearInterval(check);
        resolve();
      }
    }, 80);
  });
}

// ── Read options visible in right panel ──────────────────────────────────────
function getRightPanelOptions() {
  // 1. mat-radio-button (Angular Material)
  const matRadios = document.querySelectorAll('mat-radio-button');
  if (matRadios.length > 0) {
    const options = [];
    matRadios.forEach(btn => {
      const lbl = btn.querySelector('label, .mdc-label');
      const t = lbl?.textContent.trim();
      if (t) options.push(t);
    });
    return { options, type: 'single', inputType: 'mat-radio' };
  }

  // 2. mat-checkbox
  const matCBs = document.querySelectorAll('mat-checkbox');
  if (matCBs.length > 0) {
    const options = [];
    matCBs.forEach(cb => {
      const lbl = cb.querySelector('label, .mdc-label');
      const t = lbl?.textContent.trim();
      if (t) options.push(t);
    });
    return { options, type: 'multi', inputType: 'mat-checkbox' };
  }

  // 3. Plain radio inputs
  const radios = document.querySelectorAll('input[type="radio"]');
  if (radios.length > 0) {
    const options = [];
    radios.forEach(inp => {
      const lbl = document.querySelector(`label[for="${inp.id}"]`) ||
                  inp.closest('label') || inp.parentElement?.querySelector('label');
      const t = lbl?.textContent.trim();
      if (t) options.push(t);
    });
    return { options, type: 'single', inputType: 'radio' };
  }

  // 4. Plain checkboxes (skip UI-filter ones)
  const cbs = [...document.querySelectorAll('input[type="checkbox"]')]
    .filter(c => !c.id?.toLowerCase().includes('filter'));
  if (cbs.length > 0) {
    const options = [];
    cbs.forEach(inp => {
      const lbl = document.querySelector(`label[for="${inp.id}"]`) ||
                  inp.closest('label') || inp.parentElement?.querySelector('label');
      const t = lbl?.textContent.trim();
      if (t) options.push(t);
    });
    return { options, type: 'multi', inputType: 'checkbox' };
  }

  // 5. Select dropdown
  const sel = document.querySelector('select');
  if (sel) {
    const options = [...sel.options].map(o => o.text.trim()).filter(Boolean);
    return { options, type: 'single', inputType: 'select' };
  }

  return { options: [], type: 'unknown', inputType: 'unknown' };
}

// ── Apply answer to currently visible right panel ────────────────────────────
function applyAnswer(chosen, type, autoSubmit) {
  try {
    // Parse list of chosen options
    let chosenList = [];
    try {
      const parsed = JSON.parse(chosen);
      chosenList = Array.isArray(parsed) ? parsed.map(n) : [n(chosen)];
    } catch (_) {
      chosenList = [n(chosen)];
    }

    const match = (label, c) => {
      const a = n(label), b = n(c);
      return a === b || a.includes(b) || b.includes(a);
    };

    let clicked = false;

    // mat-radio-button
    const matRadios = document.querySelectorAll('mat-radio-button');
    if (matRadios.length > 0) {
      let found = false;
      matRadios.forEach(btn => {
        const lbl = btn.querySelector('label, .mdc-label');
        if (!lbl) return;
        if (chosenList.some(c => match(lbl.textContent, c))) {
          const inp = btn.querySelector('input[type="radio"]');
          if (inp) { tap(inp); } else { btn.click(); }
          found = true; clicked = true;
        }
      });
      // fallback: pick first option
      if (!found) {
        const first = matRadios[0].querySelector('input[type="radio"]') || matRadios[0];
        tap(first); clicked = true;
      }
      if (autoSubmit && clicked) clickSubmitBtn();
      return clicked;
    }

    // mat-checkbox
    const matCBs = document.querySelectorAll('mat-checkbox');
    if (matCBs.length > 0) {
      matCBs.forEach(cb => {
        const lbl = cb.querySelector('label, .mdc-label');
        if (!lbl) return;
        if (chosenList.some(c => match(lbl.textContent, c))) {
          const inp = cb.querySelector('input[type="checkbox"]');
          if (inp && !inp.checked) { tap(inp); clicked = true; }
        }
      });
      return clicked;
    }

    // Plain radio
    const radios = document.querySelectorAll('input[type="radio"]');
    if (radios.length > 0) {
      let found = false;
      radios.forEach(inp => {
        const lbl = document.querySelector(`label[for="${inp.id}"]`) ||
                    inp.closest('label') || inp.parentElement?.querySelector('label');
        if (!lbl) return;
        if (chosenList.some(c => match(lbl.textContent, c))) {
          tap(inp); found = true; clicked = true;
        }
      });
      if (!found) { tap(radios[0]); clicked = true; }
      if (autoSubmit && clicked) clickSubmitBtn();
      return clicked;
    }

    // Plain checkbox
    const cbs = [...document.querySelectorAll('input[type="checkbox"]')]
      .filter(c => !c.id?.toLowerCase().includes('filter'));
    if (cbs.length > 0) {
      cbs.forEach(inp => {
        const lbl = document.querySelector(`label[for="${inp.id}"]`) ||
                    inp.closest('label') || inp.parentElement?.querySelector('label');
        if (!lbl) return;
        if (chosenList.some(c => match(lbl.textContent, c)) && !inp.checked) {
          tap(inp); clicked = true;
        }
      });
      return clicked;
    }

    // Select
    const sel = document.querySelector('select');
    if (sel) {
      for (const opt of sel.options) {
        if (chosenList.some(c => match(opt.text, c))) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
    }

    return false;
  } catch (e) {
    console.error('[SurveyAI] applyAnswer error:', e);
    return false;
  }
}

function clickSubmitBtn() {
  const btn = document.querySelector(
    'button.activeBtn, [class*="activeBtn"], button[type="submit"], ' +
    '.submit-btn, button[class*="Submit"]'
  );
  if (btn) { btn.click(); return true; }
  return false;
}

// Apply answer to a specific input element
async function applyAnswerToInput(input, answer) {
  try {
    const inputType = input.type || input.getAttribute('role') || input.tagName.toLowerCase();
    
    // For radio buttons
    if (inputType === 'radio') {
      let groupInputs;
      const container = input.closest('fieldset, [role="group"], [role="radiogroup"], div[class*="group" i], div[class*="question" i], .questionAndAnswerWrap');
      
      if (container) {
        groupInputs = container.querySelectorAll('input[type="radio"]');
      } else if (input.name) {
        groupInputs = document.querySelectorAll(`input[name="${input.name}"]`);
      } else {
        groupInputs = [input];
      }
      
      const normalizedAnswer = n(answer);
      
      // Try exact match first
      for (const inp of groupInputs) {
        const label = document.querySelector(`label[for="${inp.id}"]`) || 
                      inp.closest('label') || 
                      inp.parentElement?.querySelector('label');
        const labelText = n(label?.textContent?.trim() || '');
        
        if (labelText === normalizedAnswer) {
          tap(inp);
          return true;
        }
      }

      // Try boundary / substring match
      for (const inp of groupInputs) {
        const label = document.querySelector(`label[for="${inp.id}"]`) || 
                      inp.closest('label') || 
                      inp.parentElement?.querySelector('label');
        const labelText = n(label?.textContent?.trim() || '');
        
        let matches = false;
        if (/^\d+$/.test(normalizedAnswer)) {
          try { matches = new RegExp(`\\b${normalizedAnswer}\\b`, 'i').test(labelText); } catch(e) {}
        } else {
          matches = labelText.includes(normalizedAnswer) || normalizedAnswer.includes(labelText);
        }

        if (matches) {
          tap(inp);
          return true;
        }
      }
      
// Fallback: select last option (e.g., "Never") if available, otherwise first
      const lastInput = groupInputs[groupInputs.length - 1];
      if (lastInput) {
        tap(lastInput);
      } else {
        tap(groupInputs[0]);
      }
      return true;
    }
    
// For checkboxes
    if (inputType === 'checkbox') {
      // Try to parse as JSON array for multi-select
      let answersToSelect = [];
      try {
        const parsed = JSON.parse(answer);
        if (Array.isArray(parsed)) {
          answersToSelect = parsed.map(a => n(a));
        } else {
          answersToSelect = [n(answer)];
        }
      } catch {
        // Not JSON, treat as single value
        answersToSelect = [n(answer)];
      }
      
      let groupInputs;
      let isSingleWithoutGroup = false;

      const container = input.closest('fieldset, [role="group"], div[class*="group" i], div[class*="question" i], .questionAndAnswerWrap');
      
      if (container) {
        groupInputs = container.querySelectorAll('input[type="checkbox"]');
        if (groupInputs.length <= 1) isSingleWithoutGroup = true;
      } else if (input.name) {
        groupInputs = document.querySelectorAll(`input[name="${input.name}"]`);
        if (groupInputs.length <= 1) isSingleWithoutGroup = true;
      } else {
        groupInputs = [input];
        isSingleWithoutGroup = true;
      }

      // If we have multiple answers or an identified group of checkboxes
      if (answersToSelect.length > 1 || (!isSingleWithoutGroup && answersToSelect[0] !== 'false' && answersToSelect[0] !== 'no' && answersToSelect[0] !== 'off' && answersToSelect[0] !== 'unchanged')) {
          for (const inp of groupInputs) {
            // Get the label text for this checkbox
            let labelText = '';
            const labelEl = inp.closest('label');
            if (labelEl) {
              const labelClone = labelEl.cloneNode(true);
              const inputClone = labelClone.querySelector('input');
              if (inputClone) inputClone.remove();
              labelText = n(labelClone.textContent.trim());
            }
            if (!labelText) {
              const externalLabel = document.querySelector(`label[for="${inp.id}"]`);
              if (externalLabel) {
                const labelClone = externalLabel.cloneNode(true);
                const inputClone = labelClone.querySelector('input');
                if (inputClone) inputClone.remove();
                labelText = n(labelClone.textContent.trim());
              }
            }
            
            // Check if this checkbox's label matches any of the answers
            let matches = answersToSelect.some(ans => labelText === ans);
            if (!matches) {
              matches = answersToSelect.some(ans => {
                if (/^\d+$/.test(ans)) {
                  try { return new RegExp(`\\b${ans}\\b`, 'i').test(labelText); } catch(e) {}
                }
                return labelText.includes(ans) || ans.includes(labelText);
              });
            }
            
            if (matches && !inp.checked) {
              tap(inp);
            } else if (!matches && inp.checked) {
              tap(inp); // Uncheck if it was previously checked but shouldn't be
            }
          }
          return true;
      }

      // Single checkbox fallback logic
      const normalizedAnswer = answersToSelect[0];
      const isChecked = normalizedAnswer === 'true' || normalizedAnswer === 'yes' || normalizedAnswer === 'checked' || normalizedAnswer === 'on';
      
      if (isChecked && !input.checked && input.getAttribute('aria-checked') !== 'true') {
        tap(input);
      } else if (!isChecked && (input.checked || input.getAttribute('aria-checked') === 'true')) {
        tap(input);
      }
      return true;
    }
    
// For select dropdowns
    if (inputType === 'select' || inputType === 'select-one' || inputType === 'select-multiple' || input.tagName.toLowerCase() === 'select') {
      const normalizedAnswer = n(answer);
      
      // Check if this is a Bootstrap select picker
      const isBootstrapPicker = input.classList.contains('selectpicker');
      
      // First, try to find and select the matching option
      let found = false;
      
      // 1. Exact match
      for (const opt of input.options) {
        if (n(opt.text) === normalizedAnswer) {
          input.value = opt.value;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('input', { bubbles: true }));
          found = true;
          break;
        }
      }
      
      // 2. Word boundary match (prevents "22" matching "2")
      if (!found && /^\d+$/.test(normalizedAnswer)) {
        try {
          const regex = new RegExp(`\\b${normalizedAnswer}\\b`, 'i');
          for (const opt of input.options) {
            if (regex.test(n(opt.text))) {
              input.value = opt.value;
              input.dispatchEvent(new Event('change', { bubbles: true }));
              input.dispatchEvent(new Event('input', { bubbles: true }));
              found = true;
              break;
            }
          }
        } catch (e) {}
      }
      
      // 3. Substring match (skip if the answer is purely numbers to avoid false positives)
      if (!found && !/^\d+$/.test(normalizedAnswer)) {
        for (const opt of input.options) {
          const optText = n(opt.text);
          if (optText && (optText.includes(normalizedAnswer) || normalizedAnswer.includes(optText))) {
            input.value = opt.value;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('input', { bubbles: true }));
            found = true;
            break;
          }
        }
      }
      
      if (!found && input.options.length > 0) {
        // Fallback: select first option (skip "Choose one" if possible)
        for (let i = 1; i < input.options.length; i++) {
          if (input.options[i].value) {
            input.value = input.options[i].value;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('input', { bubbles: true }));
            found = true;
            break;
          }
        }
      }
      
      // If Bootstrap select picker, also update the UI
      if (isBootstrapPicker || input.classList.contains('bs-select-hidden')) {
        const selectId = input.id;
        
        // Try to find the dropdown by data-id attribute on the div
        let dropdown = document.querySelector(`.bootstrap-select[data-id="${selectId}"]`);
        
        // Also try to find by looking for the button that references this select id
        if (!dropdown) {
          const btn = document.querySelector(`button[data-id="${selectId}"]`);
          dropdown = btn?.closest('.bootstrap-select');
        }
        
        if (dropdown) {
          // If dropdown is open, close it first
          const btn = dropdown.querySelector('button');
          const isOpen = dropdown.classList.contains('open');
          
          // If not open, click to open
          if (!isOpen && btn) {
            btn.click();
            await sleep(100); // Wait for dropdown to open
          }
          
          // Find the matching li element and click it
          const answerLower = (answer || '').toLowerCase().trim();
          const lis = dropdown.querySelectorAll('ul.dropdown-menu li');
          
          // 1. Exact match
          for (const li of lis) {
            const span = li.querySelector('span.text');
            if (span) {
              const liText = span.textContent.trim().toLowerCase();
              if (liText === answerLower) {
                li.querySelector('a').click();
                found = true;
                break;
              }
            }
          }
          
          // 2. Word boundary match
          if (!found && /^\d+$/.test(answerLower)) {
            try {
              const regex = new RegExp(`\\b${answerLower}\\b`, 'i');
              for (const li of lis) {
                const span = li.querySelector('span.text');
                if (span && regex.test(span.textContent.trim().toLowerCase())) {
                  li.querySelector('a').click();
                  found = true;
                  break;
                }
              }
            } catch (e) {}
          }
          
          // 3. Substring match
          if (!found && !/^\d+$/.test(answerLower)) {
            for (const li of lis) {
              const span = li.querySelector('span.text');
              if (span) {
                const liText = span.textContent.trim().toLowerCase();
                if (liText.includes(answerLower) || answerLower.includes(liText)) {
                  li.querySelector('a').click();
                  found = true;
                  break;
                }
              }
            }
          }
          
          // If still not found, select first valid option
          if (!found) {
            for (let i = 1; i < lis.length; i++) {
              const span = lis[i].querySelector('span.text');
              if (span && span.textContent.trim() !== 'Choose one') {
                lis[i].querySelector('a').click();
                found = true;
                break;
              }
            }
          }
        }
      }
      
      return found;
    }
    // For text inputs (text, email, password, textarea, contenteditable, etc.)
    if (inputType === 'text' || inputType === 'textbox' || inputType === 'email' || inputType === 'password' || inputType === 'tel' || inputType === 'number' || inputType === 'date' || inputType === 'textarea' || input.isContentEditable) {
      input.focus();
      
      // Clean up number answers if AI included extra text
      if (inputType === 'number' && typeof answer === 'string') {
        answer = answer.replace(/[^\d.]/g, '');
      }
      
      if (input.isContentEditable) {
        input.textContent = answer;
      } else {
        // Framework-safe value setter (bypasses React/Angular overrides)
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        
        if (input.tagName.toLowerCase() === 'textarea' && nativeTextAreaValueSetter) {
          nativeTextAreaValueSetter.call(input, answer);
        } else if (nativeInputValueSetter) {
          nativeInputValueSetter.call(input, answer);
        } else {
          input.value = answer;
        }
      }
      
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    
    return false;
  } catch (e) {
    console.error('[SurveyAI] applyAnswerToInput error:', e);
    return false;
  }
}

// Utilities
const n = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
function tap(el) {
  // Modern UI Framework fallback: If input is visually hidden, click its label or wrapper
  const isHidden = el.offsetWidth === 0 || el.offsetHeight === 0 || el.style.opacity === '0';
  if (isHidden) {
    const lbl = document.querySelector(`label[for="${el.id}"]`) || el.closest('label, .form-check, [class*="radio"], [class*="checkbox"]');
    if (lbl) {
      lbl.click();
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
  }
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true }));
  el.click();
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('input',  { bubbles: true }));
}

function getBase64Image(img) {
  try {
    if (img.src.startsWith('data:image')) return img.src;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width || 120;
    canvas.height = img.naturalHeight || img.height || 40;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/jpeg');
  } catch (e) {
    return img.src;
  }
}
