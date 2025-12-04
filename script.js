/* Full functionality:
   - Codex categories mapped to entries/<category>/manifest.json
   - GM Mode toggled with G (hidden), unlocks persist via localStorage
   - Destiny Pool GM Tool stored in localStorage (sw_destiny_pool, sw_destiny_log)
*/

document.addEventListener('DOMContentLoaded', () => {
  const categories   = ['planets','characters','vehicles','items','factions','missions','threats'];
  const entryContent = document.getElementById('entryContent');
  const breadcrumbs  = document.getElementById('breadcrumbs');
  const categoryBtns = document.querySelectorAll('.category-btn');
  const gmDestinyBtn = document.getElementById('gmDestinyBtn');
  const searchInput  = document.getElementById('search');
  const homeBtn      = document.getElementById('homeBtn');
  const flicker      = document.getElementById('flicker');
  const distortion   = document.getElementById('distortion');
  const screen       = document.getElementById('screen');
  const cursorDot    = document.getElementById('cursor-dot');
  const dotFlicker   = document.getElementById('dotFlicker');
  const gmIndicator  = document.getElementById('gmIndicator');

  let activeCategory = null;
  let activeEntry    = null;
  let activeTool     = null; // e.g. "destiny"
  let isGM           = false;

  // cache loaded entries per category to avoid refetching unless user wants to refresh
  const cache = {};

  // Destiny pool storage keys
  const DESTINY_STATE_KEY = 'sw_destiny_pool';
  const DESTINY_LOG_KEY   = 'sw_destiny_log';

  let destinyState = loadDestinyState();
  let destinyLog   = loadDestinyLog();

  // helper localStorage key for codex unlocks
  const lsKey = id => `entry_unlocked__${id}`;

  // utility: safe fetch JSON or null
  async function fetchJson(path) {
    try {
      const r = await fetch(path, { cache: "no-cache" });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      console.error('fetch error', path, e);
      return null;
    }
  }

  // load manifest (simple array) and then each entry JSON
  async function loadCategoryEntries(category) {
    // return cached if present
    if (cache[category]) return cache[category];

    const manifestPath = `entries/${category}/manifest.json`;
    const files = await fetchJson(manifestPath);
    if (!Array.isArray(files)) {
      console.warn('manifest missing or invalid for', category, manifestPath);
      cache[category] = [];
      return [];
    }

    const entries = [];
    for (const file of files) {
      const filePath = `entries/${category}/${file}`;
      const data = await fetchJson(filePath);
      if (!data) {
        console.warn('failed to load entry', filePath);
        continue;
      }
      // ensure id exists (use filename if not)
      if (!data.id) {
        data.id = file.replace(/\.[^/.]+$/, "");
      }
      data.category = category;
      entries.push(data);
    }
    cache[category] = entries;
    return entries;
  }

  /* ----------------- BREADCRUMBS ----------------- */

  function updateBreadcrumbs() {
    breadcrumbs.innerHTML = '';
    if (activeTool === 'destiny') {
      const gmSpan   = document.createElement('span');
      gmSpan.textContent = 'GM Tools';
      const sep      = document.createElement('span');
      sep.textContent = ' > ';
      const toolSpan = document.createElement('span');
      toolSpan.textContent = 'Destiny Pool';
      breadcrumbs.appendChild(gmSpan);
      breadcrumbs.appendChild(sep);
      breadcrumbs.appendChild(toolSpan);
      return;
    }

    if (!activeCategory) return;
    const catSpan = document.createElement('span');
    catSpan.textContent = activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1);
    catSpan.addEventListener('click', () => {
      activeEntry = null;
      renderListForActiveCategory();
    });
    breadcrumbs.appendChild(catSpan);
    if (activeEntry) {
      const sep       = document.createElement('span');
      sep.textContent = ' > ';
      const entrySpan = document.createElement('span');
      entrySpan.textContent = activeEntry.name;
      breadcrumbs.appendChild(sep);
      breadcrumbs.appendChild(entrySpan);
    }
  }

  /* ----------------- CODEX LIST / DETAIL ----------------- */

  async function renderListForActiveCategory() {
    entryContent.innerHTML = '';
    activeTool = null; // ensure we are not in a GM tool when listing codex
    if (!activeCategory) {
      entryContent.innerHTML = `
        <h1>Rebel Alliance Field Codex</h1>
        <p>Entries are not loaded until a category is selected. Click a category on the left to begin.</p>
      `;
      updateBreadcrumbs();
      return;
    }

    const entries = await loadCategoryEntries(activeCategory);
    const q = (searchInput.value || '').trim().toLowerCase();

    // list container
    const list = document.createElement('div');

    for (const entry of entries) {
      const isGMOnly = Boolean(entry.gmMode);
      const unlocked = isGMOnly ? (localStorage.getItem(lsKey(entry.id)) === "true") : true;

      // if not unlocked for player and not in GM Mode, hide
      if (!unlocked && !isGM) continue;

      // apply search filter
      const textMatch =
        entry.name.toLowerCase().includes(q) ||
        (entry.description || '').toLowerCase().includes(q);
      if (q && !textMatch) continue;

      const row = document.createElement('div');
      row.className = 'entry-row';

      const titleBtn = document.createElement('button');
      titleBtn.className = 'entry-title';
      titleBtn.textContent = entry.name;

      if (unlocked)         titleBtn.classList.add('unlocked');
      else if (isGM)        titleBtn.classList.add('gm-locked');
      else                  titleBtn.classList.add('locked');

      titleBtn.addEventListener('click', () => {
        activeEntry = entry;
        renderEntryDetail(entry);
      });

      row.appendChild(titleBtn);

      // GM controls for gmMode entries
      if (isGM && isGMOnly) {
        const btn = document.createElement('button');
        const currentlyUnlocked = localStorage.getItem(lsKey(entry.id)) === "true";
        btn.className = 'unlock-btn ' + (currentlyUnlocked ? 'remove' : 'add');
        btn.textContent = currentlyUnlocked ? 'Remove' : 'Add';
        btn.title = currentlyUnlocked ? 'Remove from player view' : 'Add to player view';
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (currentlyUnlocked) {
            localStorage.removeItem(lsKey(entry.id));
          } else {
            localStorage.setItem(lsKey(entry.id), "true");
          }
          renderListForActiveCategory();
        });
        row.appendChild(btn);
      }

      list.appendChild(row);
    }

    if (!list.childElementCount) {
      const msg = document.createElement('p');
      msg.textContent = isGM
        ? 'No entries match the current filter.'
        : 'No entries available (locked or none).';
      entryContent.appendChild(msg);
    } else {
      entryContent.appendChild(list);
    }
    updateBreadcrumbs();
  }

  function renderEntryDetail(entry) {
    entryContent.innerHTML = '';
    activeTool = null;

    const title = document.createElement('h1');
    title.textContent = entry.name;
    entryContent.appendChild(title);

    if (entry.image) {
      const img = document.createElement('img');
      img.src = entry.image;
      img.alt = entry.name;
      entryContent.appendChild(img);
    }

    const p = document.createElement('p');
    p.textContent = entry.description || '';
    entryContent.appendChild(p);

    if (isGM && entry.gmMode) {
      const unlocked = localStorage.getItem(lsKey(entry.id)) === "true";
      const gmBtn = document.createElement('button');
      gmBtn.className = 'unlock-btn ' + (unlocked ? 'remove' : 'add');
      gmBtn.textContent = unlocked ? 'Remove' : 'Add';
      gmBtn.style.marginTop = '10px';
      gmBtn.addEventListener('click', () => {
        if (unlocked) localStorage.removeItem(lsKey(entry.id));
        else          localStorage.setItem(lsKey(entry.id), "true");
        renderListForActiveCategory();
      });
      entryContent.appendChild(gmBtn);
    }

    const back = document.createElement('button');
    back.className = 'category-btn';
    back.textContent = 'Back';
    back.style.marginTop = '12px';
    back.addEventListener('click', () => {
      activeEntry = null;
      renderListForActiveCategory();
    });
    entryContent.appendChild(back);

    updateBreadcrumbs();
  }

  /* ----------------- DESTINY POOL STORAGE HELPERS ----------------- */

  function loadDestinyState() {
    try {
      const raw = localStorage.getItem(DESTINY_STATE_KEY);
      if (!raw) return { light: 0, dark: 0 };
      const parsed = JSON.parse(raw);
      return {
        light: Number.isFinite(parsed.light) ? parsed.light : 0,
        dark:  Number.isFinite(parsed.dark)  ? parsed.dark  : 0
      };
    } catch {
      return { light: 0, dark: 0 };
    }
  }

  function loadDestinyLog() {
    try {
      const raw = localStorage.getItem(DESTINY_LOG_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveDestinyState() {
    try {
      localStorage.setItem(DESTINY_STATE_KEY, JSON.stringify(destinyState));
    } catch {}
  }

  function saveDestinyLog() {
    try {
      localStorage.setItem(DESTINY_LOG_KEY, JSON.stringify(destinyLog));
    } catch {}
  }

  function addDestinyLogEntry(text) {
    const stamp = new Date();
    const time  = stamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    destinyLog.unshift(`[${time}] ${text}`);
    if (destinyLog.length > 50) destinyLog.length = 50;
    saveDestinyLog();
  }

  /* ----------------- DESTINY POOL PANEL RENDER ----------------- */

  function renderDestinyPoolPanel() {
    entryContent.innerHTML = '';

    if (!isGM) {
      entryContent.innerHTML = `
        <h1>GM Tools – Destiny Pool</h1>
        <p>GM Tools are restricted. Toggle GM Mode (press <strong>G</strong>) to manage the Destiny Pool.</p>
      `;
      updateBreadcrumbs();
      return;
    }

    activeTool     = 'destiny';
    activeCategory = null;
    activeEntry    = null;

    entryContent.innerHTML = `
      <h1>GM Destiny Pool</h1>
      <p style="font-size:13px; margin-bottom:10px; opacity:0.85;">
        Track and adjust the session's Light and Dark Side Destiny tokens. Changes are saved on this device.
      </p>

      <div class="destiny-grid">
        <div class="destiny-column">
          <h2>Light Side</h2>
          <div id="destinyLightRow" class="destiny-token-row"></div>
          <div class="destiny-controls">
            <button id="addLight">+ Token</button>
            <button id="removeLight">- Token</button>
          </div>
        </div>
        <div class="destiny-column">
          <h2>Dark Side</h2>
          <div id="destinyDarkRow" class="destiny-token-row"></div>
          <div class="destiny-controls">
            <button id="addDark">+ Token</button>
            <button id="removeDark">- Token</button>
          </div>
        </div>
      </div>

      <div class="destiny-actions">
        <button id="flipLightToDark">Flip Light → Dark</button>
        <button id="flipDarkToLight">Flip Dark → Light</button>
        <button id="resetDestiny">Reset Pool</button>
      </div>

      <div class="destiny-log">
        <h3>Destiny Log</h3>
        <div id="destinyLogEntries"></div>
      </div>
    `;

    const lightRow    = document.getElementById('destinyLightRow');
    const darkRow     = document.getElementById('destinyDarkRow');
    const logContainer = document.getElementById('destinyLogEntries');

    function drawTokens() {
      lightRow.innerHTML = '';
      darkRow.innerHTML  = '';

      for (let i = 0; i < destinyState.light; i++) {
        const t = document.createElement('div');
        t.className = 'destiny-token light';
        lightRow.appendChild(t);
      }
      for (let i = 0; i < destinyState.dark; i++) {
        const t = document.createElement('div');
        t.className = 'destiny-token dark';
        darkRow.appendChild(t);
      }
    }

    function drawLog() {
      logContainer.innerHTML = '';
      if (!destinyLog.length) {
        const empty = document.createElement('div');
        empty.className = 'destiny-log-entry';
        empty.style.opacity = '0.7';
        empty.textContent = 'No changes logged yet.';
        logContainer.appendChild(empty);
        return;
      }
      destinyLog.forEach(entry => {
        const div = document.createElement('div');
        div.className = 'destiny-log-entry';
        div.textContent = entry;
        logContainer.appendChild(div);
      });
    }

    // Button handlers
    document.getElementById('addLight').addEventListener('click', () => {
      destinyState.light++;
      saveDestinyState();
      addDestinyLogEntry('Added one Light Side token.');
      drawTokens();
      drawLog();
    });

    document.getElementById('removeLight').addEventListener('click', () => {
      if (destinyState.light > 0) {
        destinyState.light--;
        saveDestinyState();
        addDestinyLogEntry('Removed one Light Side token.');
        drawTokens();
        drawLog();
      }
    });

    document.getElementById('addDark').addEventListener('click', () => {
      destinyState.dark++;
      saveDestinyState();
      addDestinyLogEntry('Added one Dark Side token.');
      drawTokens();
      drawLog();
    });

    document.getElementById('removeDark').addEventListener('click', () => {
      if (destinyState.dark > 0) {
        destinyState.dark--;
        saveDestinyState();
        addDestinyLogEntry('Removed one Dark Side token.');
        drawTokens();
        drawLog();
      }
    });

    document.getElementById('flipLightToDark').addEventListener('click', () => {
      if (destinyState.light > 0) {
        destinyState.light--;
        destinyState.dark++;
        saveDestinyState();
        addDestinyLogEntry('Flipped one Light Side token to Dark.');
        drawTokens();
        drawLog();
      }
    });

    document.getElementById('flipDarkToLight').addEventListener('click', () => {
      if (destinyState.dark > 0) {
        destinyState.dark--;
        destinyState.light++;
        saveDestinyState();
        addDestinyLogEntry('Flipped one Dark Side token to Light.');
        drawTokens();
        drawLog();
      }
    });

    document.getElementById('resetDestiny').addEventListener('click', () => {
      destinyState = { light: 0, dark: 0 };
      saveDestinyState();
      addDestinyLogEntry('Reset Destiny Pool.');
      drawTokens();
      drawLog();
    });

    drawTokens();
    drawLog();
    updateBreadcrumbs();
  }

  /* ----------------- SIDEBAR WIRING ----------------- */

  // Category buttons (Codex)
  categoryBtns.forEach(btn => {
    if (btn.id === 'homeBtn') return;
    if (btn.classList.contains('gm-tool-btn')) return; // GM tools handled separately

    btn.addEventListener('click', async () => {
      const cat = btn.dataset.category;
      if (!categories.includes(cat)) {
        console.warn('unknown category', cat);
        return;
      }
      categoryBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      activeTool     = null;
      activeCategory = cat;
      activeEntry    = null;

      await loadCategoryEntries(cat);
      renderListForActiveCategory();
    });
  });

  // GM Destiny Pool button
  gmDestinyBtn.addEventListener('click', () => {
    categoryBtns.forEach(b => b.classList.remove('active'));
    gmDestinyBtn.classList.add('active');

    activeTool     = 'destiny';
    activeCategory = null;
    activeEntry    = null;

    renderDestinyPoolPanel();
  });

  // Home button
  homeBtn.addEventListener('click', () => {
    categoryBtns.forEach(b => b.classList.remove('active'));
    activeCategory = null;
    activeEntry    = null;
    activeTool     = null;
    searchInput.value = '';
    entryContent.innerHTML = `
      <h1>Rebel Alliance Field Codex</h1>
      <p>Entries are not loaded until a category is selected. Click a category on the left to begin.</p>
    `;
    breadcrumbs.innerHTML = '';
  });

  // Search handler (filters current category list)
  searchInput.addEventListener('input', () => {
    if (activeCategory) renderListForActiveCategory();
  });

  /* ----------------- GM MODE TOGGLE ----------------- */

  document.addEventListener('keydown', (ev) => {
    if (ev.key.toLowerCase() === 'g') {
      isGM = !isGM;
      gmIndicator.classList.toggle('active', isGM);

      if (activeTool === 'destiny') {
        renderDestinyPoolPanel();
      } else if (activeCategory) {
        renderListForActiveCategory();
      } else {
        renderListForActiveCategory();
      }

      console.log('GM Mode', isGM ? 'ON' : 'OFF');
    }
  });

  /* ----------------- VISUAL FX ----------------- */

  function randomFlicker() {
    if (Math.random() < 0.4) {
      flicker.style.opacity = (0.08 + Math.random() * 0.32).toFixed(2);
      setTimeout(() => {
        flicker.style.opacity = 0;
      }, 50 + Math.random() * 180);
    }
  }
  setInterval(randomFlicker, 80);

  function randomDistortion() {
    if (Math.random() < 0.06) {
      const x = (Math.random() * 10 - 5).toFixed(1);
      const y = (Math.random() * 10 - 5).toFixed(1);
      distortion.style.transform = `translate(${x}px, ${y}px)`;
      setTimeout(() => {
        distortion.style.transform = 'translate(0,0)';
      }, 60 + Math.random() * 140);
    }
  }
  setInterval(randomDistortion, 120);

  screen.addEventListener('mousemove', (e) => {
    const r = screen.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    cursorDot.style.left = x + 'px';
    cursorDot.style.top  = y + 'px';
  });

  function createRandomDot() {
    const d = document.createElement('div');
    d.className = 'dot';
    d.style.left = Math.random() * 100 + '%';
    d.style.top  = Math.random() * 100 + '%';
    dotFlicker.appendChild(d);
    setTimeout(() => d.remove(), 120 + Math.random() * 220);
  }
  setInterval(() => {
    if (Math.random() < 0.28) createRandomDot();
  }, 55);

  // initial clean state (no category loaded)
  homeBtn.click();
});
