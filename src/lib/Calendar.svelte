<script lang="ts">
  import { onMount, tick, untrack } from 'svelte'
  import type { WeekInfo } from './week'

  interface Props {
    value: string
    today: string
    week: WeekInfo
    /** clicks inside this element (e.g. the toggle button) don't close the popup */
    anchor?: HTMLElement
    onpick: (v: string) => void
    onclose: () => void
  }
  let { value, today, week, anchor, onpick, onclose }: Props = $props()

  const pad2 = (n: number) => String(n).padStart(2, '0')
  const iso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  const parse = (v: string) => {
    const [y, m, d] = v.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const isoDow = (d: Date) => d.getDay() || 7

  let focused = $state(untrack(() => value))
  let root: HTMLDivElement

  const view = $derived(parse(focused))
  const title = $derived(
    new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(view),
  )

  const cells = $derived.by(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1)
    const lead = (isoDow(first) - week.firstDay + 7) % 7
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(first.getFullYear(), first.getMonth(), 1 - lead + i)
      return { d, key: iso(d), inMonth: d.getMonth() === first.getMonth() }
    })
  })

  // 2024-01-01 is a Monday, so 2024-01-n is ISO weekday n
  const heads = $derived(
    Array.from({ length: 7 }, (_, i) => {
      const dow = ((week.firstDay - 1 + i) % 7) + 1
      return {
        dow,
        name: new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(2024, 0, dow)),
      }
    }),
  )

  async function move(days: number, months = 0) {
    const d = parse(focused)
    if (months) {
      const target = new Date(d.getFullYear(), d.getMonth() + months, 1)
      const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
      target.setDate(Math.min(d.getDate(), last))
      focused = iso(target)
    } else {
      focused = iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days))
    }
    await tick()
    root.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus()
  }

  function onKey(e: KeyboardEvent) {
    const steps: Record<string, [number, number?]> = {
      ArrowLeft: [-1],
      ArrowRight: [1],
      ArrowUp: [-7],
      ArrowDown: [7],
      PageUp: [0, -1],
      PageDown: [0, 1],
    }
    if (e.key in steps) {
      e.preventDefault()
      move(...steps[e.key])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onclose()
    }
  }

  function onOutside(e: PointerEvent) {
    const t = e.target as Node
    if (!root.contains(t) && !anchor?.contains(t)) onclose()
  }

  onMount(() => {
    root.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus()
  })
</script>

<svelte:window onpointerdown={onOutside} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="cal-pop" bind:this={root} onkeydown={onKey} role="dialog" aria-label="Choose date" tabindex="-1">
  <div class="head">
    <button type="button" class="nav" onclick={() => move(0, -1)} aria-label="Previous month">‹</button>
    <span class="title">{title}</span>
    <button type="button" class="nav" onclick={() => move(0, 1)} aria-label="Next month">›</button>
  </div>
  <div class="grid" role="grid">
    {#each heads as h (h.dow)}
      <span class="dow" class:weekend={week.weekend.includes(h.dow)} role="columnheader">{h.name}</span>
    {/each}
    {#each cells as c (c.key)}
      <button
        type="button"
        class="day"
        class:out={!c.inMonth}
        class:weekend={week.weekend.includes(isoDow(c.d))}
        class:today={c.key === today}
        class:selected={c.key === value}
        data-day={c.key}
        tabindex={c.key === focused ? 0 : -1}
        aria-pressed={c.key === value}
        aria-label={c.d.toDateString()}
        onclick={() => onpick(c.key)}>{c.d.getDate()}</button
      >
    {/each}
  </div>
  <div class="foot">
    <button type="button" class="link" onclick={() => onpick(today)}>Today</button>
  </div>
</div>

<style>
  .cal-pop {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 20;
    width: 272px;
    padding: 10px 12px 8px;
    background: var(--panel);
    border: 1px solid var(--accent);
    border-top-width: 2px;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.12);
  }
  @media (max-width: 640px) {
    .cal-pop {
      right: auto;
      left: 0;
    }
  }
  .cal-pop:focus {
    outline: none;
  }

  button {
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 8px;
    margin-bottom: 6px;
    border-bottom: 1px solid var(--border);
  }
  .title {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .nav {
    width: 26px;
    height: 26px;
    font-size: 18px;
    line-height: 1;
    color: var(--accent);
  }
  .nav:hover {
    background: var(--accent);
    color: var(--on-accent);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px 0;
  }
  .dow {
    padding: 2px 0 4px;
    text-align: center;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .dow.weekend {
    color: var(--now);
  }
  .day {
    position: relative;
    height: 30px;
    font-size: 13px;
    text-align: center;
  }
  .day.weekend {
    background: var(--edge);
  }
  .day.out {
    color: var(--muted);
    opacity: 0.55;
  }
  .day:hover {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .day:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  /* today: the red "now" mark from the timeline */
  .day.today::after {
    content: '';
    position: absolute;
    left: 30%;
    right: 30%;
    bottom: 3px;
    height: 2px;
    background: var(--now);
  }
  .day.selected {
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 600;
  }

  .foot {
    display: flex;
    justify-content: flex-end;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--border);
  }
  .link {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
    padding: 4px 6px;
  }
  .link:hover {
    background: var(--accent);
    color: var(--on-accent);
  }
</style>
