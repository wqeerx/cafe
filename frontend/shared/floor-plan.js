/**
 * Схема зала Zerno — стол + обязательные стулья (кол-во = capacity).
 * Режимы: edit (админ, drag) | select (клиент, клик).
 */
(function (global) {
  'use strict';

  const MARKER_META = {
    entrance: { label: 'Вход', w: 96, h: 56 },
    wall: { label: 'Стена', w: 128, h: 22 },
    cashier: { label: 'Касса', w: 80, h: 72 }
  };

  function getTableSize(capacity) {
    const c = Math.max(1, Math.min(6, capacity || 1));
    if (c <= 2) return 50;
    if (c <= 4) return 60;
    return 72;
  }

  function getChairOrbit(capacity) {
    return getTableSize(capacity) * 0.52 + 18;
  }

  /** Углы стульев вокруг стола (градусы, 0 = справа, по часовой) */
  function getChairAngles(capacity) {
    const n = Math.max(1, Math.min(6, capacity || 1));
    if (n === 1) return [-90];
    if (n === 2) return [-90, 90];
    if (n === 3) return [-90, 30, 150];
    if (n === 4) return [-90, 0, 90, 180];
    const start = -90;
    return Array.from({ length: n }, (_, i) => start + (360 / n) * i);
  }

  function getNodeSize(capacity) {
    const orbit = getChairOrbit(capacity);
    return (orbit + 20) * 2;
  }

  function isPlaced(table) {
    if (table.placed === 1 || table.placed === true || table.placed === '1') return true;
    if (table.placed === 0 || table.placed === false || table.placed === '0') return false;
    const x = parseFloat(table.x);
    const y = parseFloat(table.y);
    return (!isNaN(x) && x > 0) || (!isNaN(y) && y > 0);
  }

  function normalizeTable(table) {
    const t = Object.assign({}, table);
    const onFloor = t.placed === 1 || t.placed === true || t.placed === '1' || isPlaced(t);
    if (onFloor) {
      t.placed = 1;
      const x = parseFloat(t.x);
      const y = parseFloat(t.y);
      if (isNaN(x) || isNaN(y) || (x === 0 && y === 0)) {
        t.x = 50;
        t.y = 50;
      }
    }
    return t;
  }

  function formatMinutesLeft(mins) {
    const m = Math.max(0, parseInt(mins, 10) || 0);
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h > 0 && r > 0) return `${h} ч ${r} мин`;
    if (h > 0) return `${h} ч`;
    return `${r} мин`;
  }

  function employeeTooltip(table) {
    const b = table.booking;
    if (!b) return `Стол №${table.number} — свободен`;
    if (b.status === 'завершено') {
      const left = formatMinutesLeft(b.minutes_left);
      return `Стол №${table.number} — занят\nГость за столом\nДо освобождения: ${left}`;
    }
    const grace = formatMinutesLeft(b.grace_minutes_left);
    return `Стол №${table.number} — занят\nЖдём гостя (подтверждено)\nДо снятия брони: ${grace}`;
  }

  const TABLE_OUTLET_HINT = 'У стола есть розетка';

  function clientSelectTooltip(table, showLiveNow, slotLabel) {
    const lines = [`Стол №${table.number} · ${table.capacity} мест`, TABLE_OUTLET_HINT];
    const slotBusy = !!table.is_booked;
    const slotLine = slotLabel ? `На ${slotLabel}` : 'На выбранное время';

    if (slotBusy) {
      const end = table.conflict_end || (table.conflict && table.conflict.end);
      lines.push(`${slotLine} — занят${end ? ` (до ${end})` : ''}`);
      if (end) lines.push(`Нажмите — перейти к ${end}`);
    } else {
      lines.push(`${slotLine} — свободен`);
    }
    if (!slotBusy) lines.push('Можно выбрать');
    return lines.join('\n');
  }

  function tableIdEquals(a, b) {
    if (a == null || b == null) return false;
    return Number(a) === Number(b);
  }

  function stateClass(table, mode, selectedId, showLiveNow) {
    if (mode === 'employee') {
      if (table.booking) return tableIdEquals(selectedId, table.booking.id) ? 'fp-booked fp-emp-pick' : 'fp-booked';
      return 'fp-free';
    }
    if (mode !== 'select') return '';
    if (table.is_booked) return showLiveNow && table.is_active_now ? 'fp-booked fp-live-now' : 'fp-booked';
    if (showLiveNow && table.is_active_now) return 'fp-live-now';
    if (table.too_small) return 'fp-too-small';
    if (tableIdEquals(selectedId, table.id)) return 'fp-selected';
    return 'fp-free';
  }

  function buildChairs(capacity) {
    const orbit = getChairOrbit(capacity);
    const angles = getChairAngles(capacity);
    return angles.map((deg) => {
      const rad = (deg * Math.PI) / 180;
      const x = Math.cos(rad) * orbit;
      const y = Math.sin(rad) * orbit;
      const rot = deg + 90;
      return `<span class="fp-chair" style="transform: translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) rotate(${rot.toFixed(1)}deg)" aria-hidden="true"></span>`;
    }).join('');
  }

  function createTableNode(table, options) {
    const mode = options.mode || 'edit';
    const capacity = Math.max(1, Math.min(6, parseInt(table.capacity, 10) || 1));
    const size = getNodeSize(capacity);
    const showLiveNow = !!options.showLiveNow;
    const slotLabel = options.slotLabel || '';
    const cls = ['fp-table-node', `fp-mode-${mode}`, stateClass(table, mode, options.selectedId, showLiveNow)].filter(Boolean).join(' ');
    const draggable = mode === 'edit' && options.draggable !== false;

    const el = document.createElement('div');
    el.className = cls;
    el.dataset.id = table.id;
    el.dataset.number = table.number;
    el.dataset.capacity = capacity;
    el.style.width = size + 'px';
    el.style.height = size + 'px';

    if (isPlaced(table)) {
      el.style.left = parseFloat(table.x) + '%';
      el.style.top = parseFloat(table.y) + '%';
    }

    if (mode === 'select') {
      const slotBusy = !!table.is_booked;
      const liveBusy = showLiveNow && table.is_active_now;
      const jumpEnd = slotBusy
        ? (table.conflict_end || (table.conflict && table.conflict.end))
        : (liveBusy ? table.active_end : null);
      const canJump = !!jumpEnd;
      const canSelect = !slotBusy && !table.too_small;
      el.tabIndex = canSelect || canJump ? 0 : -1;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `Стол ${table.number}, ${capacity} мест`);
      if (!canSelect && !canJump) el.setAttribute('aria-disabled', 'true');
      el.setAttribute('title', clientSelectTooltip(table, showLiveNow, slotLabel));
      if (canJump) el.classList.add('fp-booked-jump');
    }

    if (mode === 'employee') {
      el.setAttribute('title', employeeTooltip(table));
      if (table.booking && typeof options.onTableClick === 'function') {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => options.onTableClick(table));
      }
    }

    const surfaceSize = getTableSize(capacity);
    el.innerHTML =
      `<div class="fp-chairs">${buildChairs(capacity)}</div>` +
      `<div class="fp-table-surface" style="width:${surfaceSize}px;height:${surfaceSize}px">` +
      `<span class="fp-table-num">${table.number}</span></div>`;

    if (draggable) {
      attachDrag(el, options);
    }

    return el;
  }

  function attachDrag(node, options) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    let floor = null;
    const isMarker = node.classList.contains('fp-marker');

    function onPointerDown(e) {
      if (e.button !== 0) return;
      if (e.target.closest('.fp-marker-btn')) return;
      floor = node.closest('.fp-floor');
      if (!floor) return;
      dragging = true;
      node.setPointerCapture(e.pointerId);
      node.classList.add('fp-dragging');
      startX = e.clientX;
      startY = e.clientY;
      const rect = floor.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      originLeft = nodeRect.left + nodeRect.width / 2 - rect.left;
      originTop = nodeRect.top + nodeRect.height / 2 - rect.top;
      e.preventDefault();
    }

    function onPointerMove(e) {
      if (!dragging || !floor) return;
      const rect = floor.getBoundingClientRect();
      let cx = originLeft + (e.clientX - startX);
      let cy = originTop + (e.clientY - startY);
      const halfW = node.offsetWidth / 2;
      const halfH = node.offsetHeight / 2;
      cx = Math.max(halfW, Math.min(rect.width - halfW, cx));
      cy = Math.max(halfH, Math.min(rect.height - halfH, cy));
      const xPct = (cx / rect.width) * 100;
      const yPct = (cy / rect.height) * 100;
      node.style.left = xPct + '%';
      node.style.top = yPct + '%';
    }

    function onPointerUp(e) {
      if (!dragging) return;
      dragging = false;
      node.classList.remove('fp-dragging');
      node.releasePointerCapture(e.pointerId);
      const id = parseInt(isMarker ? node.dataset.markerId : node.dataset.id, 10);
      const x = parseFloat(node.style.left);
      const y = parseFloat(node.style.top);
      if (typeof options.onDragEnd === 'function') {
        if (isMarker) {
          options.onDragEnd({
            id,
            x,
            y,
            rotation: parseFloat(node.dataset.rotation) || 0,
            isMarker: true
          });
        } else {
          options.onDragEnd({ id, x, y, placed: true });
        }
      }
    }

    node.addEventListener('pointerdown', onPointerDown);
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerup', onPointerUp);
    node.addEventListener('pointercancel', onPointerUp);
  }

  function createMarkerNode(marker, options) {
    const mode = options.mode || 'edit';
    const readOnly = mode !== 'edit';
    const meta = MARKER_META[marker.kind] || MARKER_META.wall;
    const rot = parseFloat(marker.rotation) || 0;
    const el = document.createElement('div');
    el.className = `fp-marker fp-marker-${marker.kind} fp-mode-${mode}`;
    el.dataset.markerId = marker.id;
    el.dataset.kind = marker.kind;
    el.dataset.rotation = rot;
    el.style.width = meta.w + 'px';
    el.style.height = meta.h + 'px';
    el.style.left = marker.x + '%';
    el.style.top = marker.y + '%';
    el.style.transform = `translate(-50%, -50%) rotate(${rot}deg)`;

    el.innerHTML =
      `<span class="fp-marker-label">${meta.label}</span>` +
      (!readOnly
        ? `<button type="button" class="fp-marker-btn fp-marker-rotate" title="Повернуть">↻</button>` +
          `<button type="button" class="fp-marker-btn fp-marker-delete" title="Удалить">×</button>`
        : '');

    if (!readOnly) {
      attachDrag(el, options);
      el.querySelector('.fp-marker-rotate')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = ((parseFloat(el.dataset.rotation) || 0) + 90) % 360;
        el.dataset.rotation = next;
        el.style.transform = `translate(-50%, -50%) rotate(${next}deg)`;
        if (typeof options.onRotate === 'function') {
          options.onRotate({ id: marker.id, rotation: next, x: parseFloat(el.style.left), y: parseFloat(el.style.top) });
        }
      });
      el.querySelector('.fp-marker-delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof options.onDelete === 'function') options.onDelete(marker);
      });
      el.addEventListener('dblclick', (e) => {
        e.preventDefault();
        el.querySelector('.fp-marker-rotate')?.click();
      });
    }

    return el;
  }

  function createMarkerPreview(kind) {
    const meta = MARKER_META[kind] || MARKER_META.wall;
    const el = document.createElement('div');
    el.className = `fp-marker fp-marker-${kind} fp-marker-preview`;
    el.dataset.kind = kind;
    el.style.width = meta.w + 'px';
    el.style.height = meta.h + 'px';
    el.innerHTML = `<span class="fp-marker-label">${meta.label}</span>`;
    return el;
  }

  function renderMarkers(container, markers, options) {
    if (!container) return;
    container.querySelectorAll('.fp-marker').forEach((n) => n.remove());
    (markers || []).forEach((m) => container.appendChild(createMarkerNode(m, options)));
  }

  function renderMarkerPalette(container) {
    if (!container) return;
    container.innerHTML = '';
    Object.keys(MARKER_META).forEach((kind) => {
      const wrap = document.createElement('div');
      wrap.className = 'fp-palette-item fp-marker-palette-item';
      wrap.dataset.kind = kind;
      wrap.appendChild(createMarkerPreview(kind));
      const meta = document.createElement('div');
      meta.className = 'fp-palette-meta';
      meta.textContent = MARKER_META[kind].label + ' — на зал';
      wrap.appendChild(meta);
      container.appendChild(wrap);
    });
  }

  function attachMarkerPaletteToFloor(paletteContainer, floorContainer, options) {
    if (!paletteContainer || !floorContainer) return;
    if (paletteContainer.dataset.fpMarkerBound === '1') return;
    paletteContainer.dataset.fpMarkerBound = '1';

    paletteContainer.addEventListener('pointerdown', (e) => {
      const item = e.target.closest('.fp-marker-palette-item');
      if (!item || e.button !== 0) return;
      const kind = item.dataset.kind;
      const preview = item.querySelector('.fp-marker-preview');
      if (!preview) return;

      const ghost = preview.cloneNode(true);
      ghost.classList.add('fp-drag-ghost');
      document.body.appendChild(ghost);

      const floor = floorContainer;
      const rect = floor.getBoundingClientRect();
      let overFloor = false;

      function moveGhost(ev) {
        ghost.style.left = ev.clientX + 'px';
        ghost.style.top = ev.clientY + 'px';
        overFloor = ev.clientX >= rect.left && ev.clientX <= rect.right &&
          ev.clientY >= rect.top && ev.clientY <= rect.bottom;
        floor.classList.toggle('fp-drop-target', overFloor);
      }

      function up(ev) {
        document.removeEventListener('pointermove', moveGhost);
        document.removeEventListener('pointerup', up);
        ghost.remove();
        floor.classList.remove('fp-drop-target');
        if (overFloor && typeof options.onPlace === 'function') {
          options.onPlace({
            kind,
            x: Math.max(5, Math.min(95, ((ev.clientX - rect.left) / rect.width) * 100)),
            y: Math.max(5, Math.min(95, ((ev.clientY - rect.top) / rect.height) * 100)),
            rotation: 0
          });
        }
      }

      moveGhost(e);
      document.addEventListener('pointermove', moveGhost);
      document.addEventListener('pointerup', up);
      e.preventDefault();
    });
  }

  function renderFloor(container, tables, options) {
    if (!container) return;
    options = options || {};
    container.querySelectorAll('.fp-table-node').forEach((n) => n.remove());
    const placed = tables.filter(isPlaced).map(normalizeTable);
    placed.forEach((table) => {
      container.appendChild(createTableNode(table, options));
    });
  }

  function renderPalette(container, tables, options) {
    if (!container) return;
    options = Object.assign({ draggable: true }, options || {});
    container.innerHTML = '';
    const unplaced = tables.filter((t) => !isPlaced(t));
    if (!unplaced.length) {
      container.innerHTML = '<p class="fp-palette-empty">Все столы на схеме</p>';
      return;
    }
    unplaced.forEach((table) => {
      const wrap = document.createElement('div');
      wrap.className = 'fp-palette-item';
      wrap.dataset.id = table.id;
      const node = createTableNode(table, Object.assign({}, options, { draggable: false }));
      wrap.appendChild(node);
      const meta = document.createElement('div');
      meta.className = 'fp-palette-meta';
      meta.textContent = `№${table.number} · ${table.capacity} ${chairLabel(table.capacity)}`;
      wrap.appendChild(meta);
      container.appendChild(wrap);
    });
  }

  function renderLegend(container, tables) {
    if (!container) return;
    const list = [...tables].sort((a, b) => a.number - b.number);
    if (!list.length) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = list.map((t) =>
      `<span class="fp-legend-item"><strong>№${t.number}</strong> · ${t.capacity} ${chairLabel(t.capacity)}</span>`
    ).join('');
  }

  function chairLabel(n) {
    const num = parseInt(n, 10);
    if (num === 1) return 'стул';
    if (num >= 2 && num <= 4) return 'стула';
    return 'стульев';
  }

  function attachPaletteToFloor(paletteContainer, floorContainer, options) {
    if (!paletteContainer || !floorContainer) return;
    if (paletteContainer.dataset.fpBound === '1') return;
    paletteContainer.dataset.fpBound = '1';

    paletteContainer.addEventListener('pointerdown', (e) => {
      const item = e.target.closest('.fp-palette-item');
      if (!item || e.button !== 0) return;
      const tableId = parseInt(item.dataset.id, 10);
      const table = (options.tables || []).find((t) => t.id === tableId);
      if (!table) return;

      const node = item.querySelector('.fp-table-node');
      if (!node) return;

      const ghost = node.cloneNode(true);
      ghost.classList.add('fp-drag-ghost');
      document.body.appendChild(ghost);

      const floor = floorContainer;
      const rect = floor.getBoundingClientRect();
      let overFloor = false;

      function moveGhost(ev) {
        ghost.style.left = ev.clientX + 'px';
        ghost.style.top = ev.clientY + 'px';
        overFloor = ev.clientX >= rect.left && ev.clientX <= rect.right &&
          ev.clientY >= rect.top && ev.clientY <= rect.bottom;
        floor.classList.toggle('fp-drop-target', overFloor);
      }

      function up(ev) {
        document.removeEventListener('pointermove', moveGhost);
        document.removeEventListener('pointerup', up);
        ghost.remove();
        floor.classList.remove('fp-drop-target');
        if (overFloor && typeof options.onPlace === 'function') {
          const cx = ev.clientX - rect.left;
          const cy = ev.clientY - rect.top;
          options.onPlace({
            id: tableId,
            x: Math.max(5, Math.min(95, (cx / rect.width) * 100)),
            y: Math.max(5, Math.min(95, (cy / rect.height) * 100)),
            placed: true
          });
        }
      }

      moveGhost(e);
      document.addEventListener('pointermove', moveGhost);
      document.addEventListener('pointerup', up);
      e.preventDefault();
    });
  }

  global.ZernoFloorPlan = {
    MARKER_META,
    getTableSize,
    getChairAngles,
    getNodeSize,
    isPlaced,
    normalizeTable,
    createTableNode,
    createMarkerNode,
    renderFloor,
    renderMarkers,
    renderPalette,
    renderMarkerPalette,
    renderLegend,
    attachPaletteToFloor,
    attachMarkerPaletteToFloor,
    chairLabel
  };
})(typeof window !== 'undefined' ? window : global);
