<script lang="ts">
  import { onMount } from 'svelte'
  import {
    HOUR,
    allZones,
    cityName,
    formatDiff,
    formatShortDiff,
    formatOffset,
    hourBlocks,
    pad2,
    resolveZone,
    zoned,
  } from './lib/tz'

  const STORAGE_KEY = 'timezone-matcher:zones'
  const PIN_KEY = 'timezone-matcher:pinned'
  const UTC = 'UTC'
  const POPULAR = [
    'America/Los_Angeles',
    'America/New_York',
    'UTC',
    'Europe/London',
    'Europe/Tallinn',
    'Asia/Kolkata',
    'Asia/Tokyo',
    'Europe/Berlin',
    'Asia/Singapore',
    'Australia/Sydney',
  ]
  const SNAP = 15 * 60_000

  const systemZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  function loadZones(): string[] {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
      if (Array.isArray(saved) && saved.every((z) => typeof z === 'string')) {
        return [systemZone, ...saved.filter((z) => z !== systemZone)]
      }
    } catch {}
    return [systemZone, 'America/Los_Angeles', 'America/New_York', 'UTC', 'Europe/London', 'Europe/Tallinn', 'Asia/Kolkata', 'Asia/Tokyo'].filter((z, i, a) => a.indexOf(z) === i)
  }

  function toDateInput(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  }

  function loadPinned(): number | null {
    try {
      const v = Number(JSON.parse(localStorage.getItem(PIN_KEY) ?? 'null'))
      return Number.isFinite(v) && v > 0 ? v : null
    } catch {
      return null
    }
  }

  const savedPin = loadPinned()

  let zones = $state(loadZones())
  let now = $state(Date.now())
  let date = $state(toDateInput(new Date(savedPin ?? Date.now())))
  let hover = $state<number | null>(null)
  let hoverRow = $state<string | null>(null)
  let pinned = $state<number | null>(savedPin)
  let newZone = $state('')
  let error = $state('')
  let open = $state(false)
  let active = $state(-1)
  let tracksEl: HTMLDivElement
  let boardEl: HTMLDivElement
  let labelsEl: HTMLDivElement

  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 1000)
    return () => clearInterval(id)
  })

  $effect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(zones.slice(1)))
    } catch {}
  })

  $effect(() => {
    try {
      if (pinned === null) localStorage.removeItem(PIN_KEY)
      else localStorage.setItem(PIN_KEY, JSON.stringify(pinned))
    } catch {}
  })

  const start = $derived.by(() => {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(y, m - 1, d).getTime()
  })
  const end = $derived.by(() => {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(y, m - 1, d + 1).getTime()
  })
  const span = $derived(end - start)

  const rows = $derived(
    zones
      .map((tz) => ({ tz, offset: zoned(tz, start).offsetMin, blocks: hourBlocks(tz, start, end) }))
      .sort((a, b) => a.offset - b.offset),
  )

  const nowClock = $derived(
    new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).format(now),
  )
  const nowDate = $derived(
    new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(now),
  )
  const nowOffset = $derived(formatOffset(zoned(systemZone, now).offsetMin))

  const pinText = $derived(
    pinned === null
      ? ''
      : new Intl.DateTimeFormat(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(pinned),
  )
  const pinDiff = $derived.by(() => {
    if (pinned === null) return ''
    const mins = Math.round((pinned - now) / 60_000)
    if (mins === 0) return 'now'
    const abs = Math.abs(mins)
    const d = Math.floor(abs / 1440)
    const h = Math.floor((abs % 1440) / 60)
    const m = abs % 60
    const body = [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ')
    return mins > 0 ? `in ${body}` : `${body} ago`
  })

  const cursor = $derived(pinned ?? hover)
  const selected = $derived(cursor ?? now)
  const base = $derived(zoned(systemZone, selected))

  const pct = (ms: number) => ((ms - start) / span) * 100
  const inWindow = (ms: number) => ms >= start && ms <= end

  function msAt(e: MouseEvent): number {
    const rect = tracksEl.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    return start + Math.round((frac * span) / SNAP) * SNAP
  }

  function onMove(e: PointerEvent) {
    if (e.pointerType === 'mouse') hover = msAt(e)
  }

  function onClick(e: MouseEvent) {
    pinned = pinned === null ? msAt(e) : null
  }

  const norm = (z: string) => z.toLowerCase().replace(/_/g, ' ')
  const zoneLabel = (z: string) => (z === UTC ? 'UTC+0' : z)

  const suggestions = $derived.by(() => {
    const q = newZone.trim().toLowerCase().replace(/[\s_]+/g, ' ')
    if (!q) {
      const rest = allZones.filter((z) => !zones.includes(z) && !POPULAR.includes(z))
      return [...POPULAR.filter((z) => !zones.includes(z)), ...rest].slice(0, 100)
    }
    const matches = allZones.filter((z) => !zones.includes(z) && (norm(z).includes(q) || norm(zoneLabel(z)).includes(q)))
    const startsWith = (z: string) => norm(z).split('/').pop()!.startsWith(q)
    return [...matches.filter(startsWith), ...matches.filter((z) => !startsWith(z))].slice(0, 100)
  })

  function commitZone(input: string) {
    const tz = resolveZone(input)
    if (!tz) {
      error = `Unknown timezone "${input}"`
      return
    }
    if (zones.includes(tz)) {
      error = `${cityName(tz)} is already added`
      return
    }
    zones.push(tz)
    newZone = ''
    error = ''
    open = false
  }

  function addZone(e: SubmitEvent) {
    e.preventDefault()
    commitZone(active >= 0 && open ? suggestions[active] : newZone)
  }

  function onComboKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      open = true
      const n = suggestions.length
      if (n) active = (active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n
    } else if (e.key === 'Escape') {
      open = false
    }
  }

  function removeZone(tz: string) {
    zones = zones.filter((z) => z !== tz)
  }

  function isIsoDate(v: string): boolean {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
    if (!m) return false
    const [y, mo, d] = [+m[1], +m[2], +m[3]]
    const t = new Date(y, mo - 1, d)
    return t.getFullYear() === y && t.getMonth() === mo - 1 && t.getDate() === d
  }

  function onDateText(input: HTMLInputElement) {
    const v = input.value.trim()
    if (isIsoDate(v)) setDate(v)
    else input.value = date
  }

  let picker: HTMLInputElement

  function scrollToMoment(ms: number) {
    if (!inWindow(ms)) return
    const board = boardEl.getBoundingClientRect()
    const tracks = tracksEl.getBoundingClientRect()
    const x = tracks.left - board.left + boardEl.scrollLeft + ((ms - start) / span) * tracks.width
    const visible = boardEl.clientWidth - labelsEl.offsetWidth
    boardEl.scrollLeft = x - labelsEl.offsetWidth - visible / 2
  }

  onMount(() => scrollToMoment(pinned ?? now))

  function setDate(v: string) {
    if (!v) return
    date = v
    pinned = null
  }
</script>

<svelte:window onpointermove={onMove} />

<main>
  <header>
    <div>
      <h1>Timezone matcher</h1>
      <p class="muted">
        Hover the timeline (or click to pin a moment) to compare the same instant across zones.
      </p>
    </div>
    <div class="controls">
      <div class="date-field">
        <input
          class="date-text"
          type="text"
          inputmode="numeric"
          maxlength="10"
          placeholder="YYYY-MM-DD"
          value={date}
          onchange={(e) => onDateText(e.currentTarget)}
          onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          aria-label="Date (YYYY-MM-DD)"
        />
        <button type="button" class="cal" onclick={() => picker.showPicker()} aria-label="Open calendar">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="3" width="12" height="11" />
            <path d="M2 7h12M5 1.5v3M11 1.5v3" />
          </svg>
        </button>
        <input
          bind:this={picker}
          class="date-native"
          type="date"
          value={date}
          onchange={(e) => e.currentTarget.value && setDate(e.currentTarget.value)}
          tabindex="-1"
          aria-hidden="true"
        />
      </div>
      <button onclick={() => setDate(toDateInput(new Date()))}>Today</button>
    </div>
  </header>

  <div class="now-bar">
    <span class="now-time">{nowClock}</span>
    <span class="now-date">{nowDate}</span>
    <span class="now-zone">{systemZone} · {nowOffset}</span>
    {#if pinned !== null}
      <div class="now-pin">
        <span class="muted small">Pinned</span>
        <span class="pin-time">{pinText}</span>
        <span class="pin-diff">{pinDiff}</span>
      </div>
    {/if}
  </div>

  <div class="board" bind:this={boardEl}>
    <div class="grid">
      <div class="labels" bind:this={labelsEl}>
        {#each rows as row (row.tz)}
          {@const z = zoned(row.tz, selected)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="label"
            class:own={row.tz === systemZone}
            class:muted={row.tz === UTC}
            class:hot={hoverRow === row.tz}
            onpointerenter={() => (hoverRow = row.tz)}
            onpointerleave={() => (hoverRow = null)}
          >
            <div class="label-top">
              <strong class="city">{row.tz === UTC ? 'UTC+0' : cityName(row.tz)}</strong>
              {#if row.tz !== systemZone}
                <button class="remove" onclick={() => removeZone(row.tz)} aria-label="Remove {row.tz}">
                  ×
                </button>
              {/if}
            </div>
            <div class="clock">
              {pad2(z.hour)}:{pad2(z.minute)}
              <span class="muted small date">{z.weekday} {z.day}</span>
            </div>
            <div class="muted small">
              <span class="full">
                {formatOffset(z.offsetMin)}{row.tz !== systemZone ? ` · ${formatDiff(z.offsetMin - base.offsetMin)}` : ''}
              </span>
              <span class="short">
                {row.tz !== systemZone ? formatShortDiff(z.offsetMin - base.offsetMin) : 'you'}
              </span>
            </div>
          </div>
        {/each}
      </div>

      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div
        class="tracks"
        bind:this={tracksEl}
        onclick={onClick}
      >
        {#each rows as row (row.tz)}
          <div
            class="track"
            class:own={row.tz === systemZone}
            class:muted={row.tz === UTC}
            class:hot={hoverRow === row.tz}
            onpointerenter={() => (hoverRow = row.tz)}
            onpointerleave={() => (hoverRow = null)}
          >
            {#each row.blocks as b (b.start)}
              <div
                class="block {b.kind}"
                class:midnight={b.hour === 0}
                style:left="{pct(b.start)}%"
                style:width="{(HOUR / span) * 100}%"
              >
                {pad2(b.hour)}
                {#if b.dayLabel}<span class="day">{b.dayLabel}</span>{/if}
              </div>
            {/each}
          </div>
        {/each}

        {#if inWindow(now)}
          <div class="line now" style:left="{pct(now)}%"><span>now</span></div>
        {/if}
        {#if cursor !== null && inWindow(cursor)}
          <div class="line cursor" style:left="{pct(cursor)}%"></div>
        {/if}
      </div>
    </div>
  </div>

  <div class="legend muted small">
    <span><i class="swatch work"></i>9–18</span>
    <span><i class="swatch edge"></i>7–9, 18–24</span>
    <span><i class="swatch night"></i>0–7</span>
    <span><i class="swatch now"></i>now</span>
    <span><i class="swatch pin"></i>pinned</span>
  </div>

  <form class="add" onsubmit={addZone}>
    <div class="combo">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls="zone-list"
        autocomplete="off"
        placeholder="Add a timezone, e.g. Tokyo or Europe/Berlin"
        bind:value={newZone}
        onfocus={() => (open = true)}
        onblur={() => (open = false)}
        oninput={() => {
          error = ''
          open = true
          active = -1
        }}
        onkeydown={onComboKey}
      />
      {#if open && suggestions.length}
        <ul id="zone-list" class="options" role="listbox">
          {#each suggestions as z, i (z)}
            <li
              role="option"
              aria-selected={i === active}
              class:active={i === active}
              onmousedown={(e) => {
                e.preventDefault()
                commitZone(z)
              }}
              onmouseenter={() => (active = i)}
            >
              {zoneLabel(z)}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
    <button type="submit">Add</button>
    {#if error}<span class="error">{error}</span>{/if}
  </form>
</main>

<style>
  main {
    max-width: 1400px;
    margin: 0 auto;
    padding: 24px 16px 48px;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 20px;
  }

  h1 {
    margin: 0 0 4px;
    font-size: 24px;
  }

  p {
    margin: 0;
  }

  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 12px;
  }

  .controls,
  .add {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }

  input,
  button {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 0;
    padding: 6px 12px;
  }
  button {
    cursor: pointer;
  }
  button:hover {
    border-color: var(--accent);
  }
  .date-field {
    position: relative;
    display: flex;
    gap: 4px;
  }
  .date-text {
    width: 118px;
    font-variant-numeric: tabular-nums;
  }
  .cal {
    display: flex;
    align-items: center;
    padding: 6px 8px;
  }
  .date-native {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 1px;
    height: 1px;
    padding: 0;
    border: 0;
    opacity: 0;
    pointer-events: none;
  }

  .combo {
    position: relative;
    flex: 1;
    min-width: 260px;
    max-width: 420px;
  }
  .combo input {
    width: 100%;
  }
  .combo input:focus-visible {
    outline: none;
    border-color: var(--accent);
  }
  .options {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 10;
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 260px;
    overflow-y: auto;
    background: var(--panel);
    border: 1px solid var(--accent);
    border-top: 0;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
  }
  .options li {
    padding: 6px 12px;
    cursor: pointer;
  }
  .options li.active {
    background: var(--accent);
    color: var(--panel);
  }
  .error {
    color: var(--now);
    font-size: 13px;
  }

  .now-bar {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin-bottom: 12px;
    padding: 10px 16px;
    background: var(--panel);
    border: 1px solid var(--border);
  }
  .now-time {
    font-size: 28px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }
  .now-date {
    font-size: 16px;
  }
  .now-pin {
    margin-left: auto;
    display: flex;
    align-items: baseline;
    gap: 4px;
    text-align: right;
    color: var(--accent);
  }
  .pin-time {
    font-size: 16px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .pin-diff {
    font-size: 13px;
    min-width: 5.5em;
  }
  .now-zone {
    color: var(--muted);
    font-size: 13px;
  }

  .board {
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .grid {
    --row-h: 72px;
    display: flex;
    min-width: max-content;
  }

  .labels {
    position: sticky;
    left: 0;
    z-index: 5;
    background: var(--bg);
    flex: 0 0 212px;
    padding-right: 12px;
  }
  .tracks {
    flex: 1 0 1200px;
  }

  .labels,
  .tracks {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tracks {
    position: relative;
    cursor: crosshair;
    user-select: none;
  }

  .label {
    height: var(--row-h);
    padding: 8px 6px 8px 12px;
    background: var(--panel);
    border: 2px solid var(--border);
    border-radius: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .short {
    display: none;
  }
  .city {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .label-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .clock {
    font-variant-numeric: tabular-nums;
    font-size: 18px;
    font-weight: 600;
    line-height: 1;
  }
  .label.own,
  .label.hot {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--panel));
    outline: 1px solid var(--accent);
    outline-offset: -1px;
  }
  .track.own,
  .track.hot {
    border-color: var(--accent);
  }
  .track.own::after,
  .track.hot::after {
    content: '';
    position: absolute;
    inset: 0;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    box-shadow: inset 0 0 0 1px var(--accent);
    pointer-events: none;
  }
  .remove {
    padding: 0 6px;
    line-height: 1.2;
    border-radius: 0;
    color: var(--muted);
  }

  .track {
    position: relative;
    height: var(--row-h);
    border: 1px solid var(--border);
    border-radius: 0;
    overflow: hidden;
    background: var(--night);
  }

  .block {
    position: absolute;
    top: 0;
    bottom: 0;
    padding: 6px 0 0 6px;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    border-left: 1px solid var(--border);
    white-space: nowrap;
    overflow: hidden;
  }
  .block.night {
    background: var(--night);
    color: var(--muted);
  }
  .block.edge {
    background: var(--edge);
  }
  .block.work {
    background: var(--work);
  }
  .block .day {
    display: block;
    margin-top: 1px;
    font-size: 10px;
    font-weight: 600;
    color: var(--muted);
  }
  .block.midnight {
    font-weight: 700;
    padding-left: 4px;
  }

  .line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 0;
    pointer-events: none;
  }
  .line::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: -1px;
    width: 2px;
  }
  .line.now::before {
    background: var(--now);
  }
  .line.cursor::before {
    background: var(--accent);
    left: -1px;
  }
  .line.now span {
    position: absolute;
    bottom: 2px;
    left: 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--now);
  }

  .legend {
    display: flex;
    gap: 16px;
    margin: 12px 0 20px;
  }
  .swatch {
    display: inline-block;
    width: 12px;
    height: 12px;
    margin-right: 6px;
    vertical-align: -1px;
    border: 1px solid var(--border);
    border-radius: 0;
  }
  .swatch.work {
    background: var(--work);
  }
  .swatch.edge {
    background: var(--edge);
  }
  .swatch.night {
    background: var(--night);
  }
  .swatch.pin {
    background: var(--accent);
    border-color: var(--accent);
  }
  .swatch.now {
    background: var(--now);
    border-color: var(--now);
  }

  @media (max-width: 640px) {
    main {
      padding: 12px 8px 32px;
    }
    .labels {
      flex-basis: 92px;
      padding-right: 6px;
    }
    .label {
      padding: 6px 6px;
    }
    .clock {
      font-size: 16px;
    }
    .date,
    .full {
      display: none;
    }
    .short {
      display: inline;
    }
    .remove {
      padding: 0 2px;
      border: 0;
      background: transparent;
    }
    .now-time {
      font-size: 22px;
    }
  }
</style>
