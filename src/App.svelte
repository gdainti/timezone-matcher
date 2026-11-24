<script lang="ts">
  import { onMount, tick, untrack } from 'svelte'
  import Calendar from './lib/Calendar.svelte'
  import { weekInfo } from './lib/week'
  import {
    HOUR,
    allZones,
    cityName,
    formatDiff,
    formatShortDiff,
    formatOffset,
    hourBlocks,
    isValidZone,
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
    return [systemZone, 'America/New_York', 'Asia/Tokyo'].filter((z, i, a) => a.indexOf(z) === i)
  }

  function toDateInput(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  }

  function loadPinned(): number | null {
    try {
      const v = Number(JSON.parse(localStorage.getItem(PIN_KEY) ?? 'null'))
      const t = new Date()
      const dayStart = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()
      const dayEnd = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1).getTime()
      return Number.isFinite(v) && v >= dayStart && v <= dayEnd ? v : null
    } catch {
      return null
    }
  }

  const savedPin = loadPinned()

  // A shared link: ?z=<zone>,<zone>…&t=<UTC time, e.g. 2026-11-25T14:00Z>. It shows the sender's
  // zones and pinned moment without touching the visitor's saved setup, until they change something.
  function readLink(): { zones: string[]; pinned: number | null } | null {
    const params = new URLSearchParams(location.search)
    const zs = (params.get('z') ?? '')
      .split(',')
      .map((z) => z.trim())
      .filter((z) => z && isValidZone(z))
    const t = params.has('t') ? Date.parse(params.get('t')!) : NaN
    if (!zs.length && !Number.isFinite(t)) return null
    return { zones: zs, pinned: Number.isFinite(t) ? t : null }
  }

  const link = readLink()

  function linkZones(shared: string[]): string[] {
    return [systemZone, ...shared].filter((z, i, a) => a.indexOf(z) === i)
  }

  let zones = $state(link?.zones.length ? linkZones(link.zones) : loadZones())
  let now = $state(Date.now())
  let date = $state(toDateInput(link?.pinned != null ? new Date(link.pinned) : new Date()))
  /** false while showing a shared link the visitor has not changed: their saved setup is kept */
  let persist = $state(!link)
  let hover = $state<number | null>(null)
  let hoverRow = $state<string | null>(null)
  let pinned = $state<number | null>(link ? link.pinned : savedPin)
  let copied = $state(false)
  let newZone = $state('')
  let error = $state('')
  let open = $state(false)
  let active = $state(-1)
  let tracksEl: HTMLDivElement
  let boardEl: HTMLDivElement

  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 1000)
    return () => clearInterval(id)
  })

  $effect(() => {
    const saved = JSON.stringify(zones.slice(1))
    if (!persist) return
    try {
      localStorage.setItem(STORAGE_KEY, saved)
    } catch {}
  })

  $effect(() => {
    const p = pinned
    if (!persist) return
    try {
      if (p === null) localStorage.removeItem(PIN_KEY)
      else localStorage.setItem(PIN_KEY, JSON.stringify(p))
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

  /** The visitor changed something: from now on this is their own setup */
  function adopt() {
    if (persist) return
    persist = true
    history.replaceState(null, '', location.pathname + location.hash)
  }

  function shareUrl(): string {
    // '+' (Etc/GMT+5) would read back as a space
    const z = zones.map((tz) => tz.replace(/\+/g, '%2B')).join(',')
    const t = pinned === null ? '' : `&t=${new Date(pinned).toISOString().slice(0, 16)}Z`
    return `${location.origin}${location.pathname}?z=${z}${t}`
  }

  async function share() {
    const url = shareUrl()
    try {
      await navigator.clipboard.writeText(url)
      copied = true
      setTimeout(() => (copied = false), 2000)
    } catch {
      prompt('Copy this link', url)
    }
  }

  function onClick(e: MouseEvent) {
    adopt()
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
    adopt()
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
    adopt()
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

  let calOpen = $state(false)
  let dateField = $state<HTMLDivElement>()
  const week = weekInfo(systemZone)

  function scrollToMoment(ms: number) {
    if (!inWindow(ms)) return
    boardEl.scrollLeft = ((ms - start) / span) * tracksEl.offsetWidth - boardEl.clientWidth / 2
  }

  onMount(() => scrollToMoment(pinned ?? now))

  const today = $derived(toDateInput(new Date(now)))
  let lastToday = toDateInput(new Date())

  $effect(() => {
    const t = today
    if (t === lastToday) return
    const previous = lastToday
    lastToday = t
    untrack(() => {
      if (date !== previous) return
      date = t
      pinned = null
      tick().then(() => scrollToMoment(now))
    })
  })

  function setDate(v: string) {
    if (!v) return
    adopt()
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
      <div class="date-field" bind:this={dateField}>
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
        <button
          type="button"
          class="cal"
          class:on={calOpen}
          onclick={() => (calOpen = !calOpen)}
          aria-label="Open calendar"
          aria-expanded={calOpen}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="3" width="12" height="11" />
            <path d="M2 7h12M5 1.5v3M11 1.5v3" />
          </svg>
        </button>
        {#if calOpen}
          <Calendar
            value={date}
            {today}
            {week}
            anchor={dateField}
            onpick={(v) => {
              setDate(v)
              calOpen = false
            }}
            onclose={() => (calOpen = false)}
          />
        {/if}
      </div>
      <button onclick={() => setDate(toDateInput(new Date()))}>Today</button>
      <button
        class="share"
        onclick={share}
        title={pinned === null ? 'Copy a link to these zones' : 'Copy a link to these zones and the pinned time'}
        >{copied ? 'Link copied' : 'Share'}</button
      >
    </div>
  </header>

  {#if !persist}
    <div class="shared-note">
      <span>You're viewing a shared link. Your own saved zones are unchanged.</span>
      <button onclick={adopt}>Keep these zones</button>
      <a href={location.pathname}>Show mine</a>
    </div>
  {/if}

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

  <div class="board">
    <div class="grid">
      <div class="labels">
        {#each rows as row (row.tz)}
          {@const z = zoned(row.tz, selected)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="label"
            class:own={row.tz === systemZone}
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

      <div class="scroller" bind:this={boardEl}>
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
          <div class="line cursor" style:left="{pct(cursor)}%">
            {#if pinned !== null}<span>pinned</span>{/if}
          </div>
        {/if}
      </div>
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
    max-width: 1600px;
    margin: 0 auto;
    padding: 32px 24px 48px;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
    flex-wrap: wrap;
    padding-bottom: 14px;
    border-bottom: 2px solid var(--accent);
  }

  h1 {
    margin: 0 0 6px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent);
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
    gap: 8px;
    flex-wrap: wrap;
  }

  input {
    background: transparent;
    border: 0;
    border-bottom: 1px solid var(--rule);
    padding: 6px 2px;
  }
  input:focus-visible {
    outline: none;
    border-bottom: 2px solid var(--accent);
    padding-bottom: 5px;
  }
  input::placeholder {
    color: var(--muted);
  }

  button {
    cursor: pointer;
    background: var(--panel);
    color: var(--accent);
    border: 1px solid var(--accent);
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  button:hover {
    background: var(--accent);
    color: var(--on-accent);
  }

  .date-field {
    position: relative;
    display: flex;
    gap: 6px;
  }
  .date-text {
    width: 112px;
    font-size: 14px;
  }
  .cal.on {
    background: var(--accent);
    color: var(--on-accent);
  }
  .cal {
    display: flex;
    align-items: center;
    padding: 6px 8px;
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
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.12);
  }
  .options li {
    padding: 6px 12px;
    cursor: pointer;
    border-bottom: 1px solid var(--border);
  }
  .options li:last-child {
    border-bottom: 0;
  }
  .options li.active {
    background: var(--accent);
    color: var(--on-accent);
  }
  .error {
    color: var(--now);
    font-size: 13px;
  }

  .share {
    min-width: 7.5em;
  }

  .shared-note {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 16px;
    margin-top: 12px;
    padding: 8px 12px;
    font-size: 13px;
    border-left: 3px solid var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .shared-note button {
    padding: 3px 10px;
    font-size: 11px;
  }
  .shared-note a {
    color: var(--accent);
    font-size: 13px;
  }

  /* big readout, no box */
  .now-bar {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px 20px;
    padding: 18px 0 16px;
    margin-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }
  .now-time {
    font-size: 48px;
    font-weight: 500;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .now-date {
    font-size: 17px;
    font-weight: 500;
  }
  .now-zone {
    color: var(--muted);
    font-size: 12px;
    letter-spacing: 0.04em;
  }
  .now-pin {
    margin-left: auto;
    display: flex;
    align-items: baseline;
    gap: 10px;
    text-align: right;
  }
  .now-pin .muted {
    color: var(--accent);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-size: 11px;
  }
  .pin-time {
    font-size: 17px;
    font-weight: 600;
    color: var(--accent);
  }
  .pin-diff {
    font-size: 13px;
    color: var(--muted);
    min-width: 5.5em;
  }

  .grid {
    --row-h: 72px;
    display: flex;
  }

  .labels {
    flex: 0 0 190px;
    padding-top: 18px;
  }

  .scroller {
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .tracks {
    min-width: 1180px;
  }

  .labels,
  .tracks {
    display: flex;
    flex-direction: column;
  }

  .tracks {
    position: relative;
    padding-top: 18px;
    padding-bottom: 18px;
    cursor: crosshair;
    user-select: none;
  }

  /* timetable rows: hairlines, no cards */
  .label,
  .track {
    height: var(--row-h);
    border-bottom: 1px solid var(--border);
  }
  .label:first-child,
  .track:first-child {
    border-top: 1px solid var(--rule);
  }
  .label:last-child,
  .track:last-child {
    border-bottom-color: var(--rule);
  }

  .label {
    position: relative;
    padding: 9px 12px 8px 14px;
    border-right: 1px solid var(--rule);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .label.own::before {
    content: '';
    position: absolute;
    left: 0;
    top: 8px;
    bottom: 8px;
    width: 3px;
    background: var(--accent);
  }
  .label.own {
    background: color-mix(in srgb, var(--accent) 6%, transparent);
  }
  .label.hot {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .short {
    display: none;
  }
  .city {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .label-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .label.own .clock {
    color: var(--accent);
  }
  .clock {
    font-size: 20px;
    font-weight: 500;
    line-height: 1;
  }
  .clock .date {
    margin-left: 4px;
  }
  .label > .muted {
    font-size: 11px;
  }
  .remove {
    padding: 0 4px;
    line-height: 1.2;
    border: 0;
    color: var(--muted);
    font-size: 15px;
    letter-spacing: 0;
  }
  .remove:hover {
    background: transparent;
    color: var(--now);
  }

  .track {
    position: relative;
    overflow: hidden;
    background: var(--night);
  }
  .track.own::before,
  .track.hot::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 1;
    background: color-mix(in srgb, var(--accent) 7%, transparent);
    pointer-events: none;
  }
  .track.hot::before {
    background: color-mix(in srgb, var(--accent) 13%, transparent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .block {
    position: absolute;
    top: 0;
    bottom: 0;
    padding: 7px 0 0 6px;
    font-size: 12px;
    border-left: 1px solid var(--border);
    white-space: nowrap;
    overflow: hidden;
  }
  .block.night {
    color: var(--muted);
    background: repeating-linear-gradient(
      135deg,
      transparent 0 5px,
      var(--hatch) 5px 6px
    ),
    var(--night);
  }
  .block.edge {
    background: var(--edge);
  }
  /* working hours: an ink bar along the bottom, like a timetable service line */
  .block.work {
    background: var(--work);
  }
  .block.work::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 5px;
    background: var(--work-bar);
  }
  .block .day {
    display: block;
    margin-top: 2px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .block.midnight {
    font-weight: 600;
    padding-left: 5px;
    border-left: 2px solid var(--accent);
  }

  .line {
    position: absolute;
    z-index: 2;
    top: 18px;
    bottom: 18px;
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
  }
  .line span {
    position: absolute;
    left: 4px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--now);
  }
  /* now label above its line, pinned label below, so they never overlap */
  .line.now span {
    bottom: 100%;
    margin-bottom: 3px;
  }
  .line.cursor span {
    top: 100%;
    margin-top: 3px;
    color: var(--accent);
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 20px;
    margin: 6px 0 28px;
    letter-spacing: 0.04em;
  }
  .swatch {
    display: inline-block;
    position: relative;
    width: 18px;
    height: 12px;
    margin-right: 7px;
    vertical-align: -1px;
    border: 1px solid var(--border);
  }
  .swatch.work {
    background: var(--work);
    border-bottom: 3px solid var(--work-bar);
  }
  .swatch.edge {
    background: var(--edge);
  }
  .swatch.night {
    background: repeating-linear-gradient(135deg, transparent 0 3px, var(--hatch) 3px 4px), var(--night);
  }
  .swatch.pin,
  .swatch.now {
    width: 2px;
    border: 0;
    margin-right: 8px;
  }
  .swatch.pin {
    background: var(--accent);
  }
  .swatch.now {
    background: var(--now);
  }

  @media (max-width: 640px) {
    main {
      padding: 16px 10px 32px;
    }
    .labels {
      flex-basis: 96px;
    }
    .label {
      padding: 7px 6px 6px 9px;
    }
    .city {
      font-size: 11px;
      letter-spacing: 0.06em;
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
    }
    .now-time {
      font-size: 34px;
    }
  }
</style>
