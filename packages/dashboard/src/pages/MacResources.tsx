import { useCallback, useEffect, useRef, useState } from 'react'
import { useRelay } from '@/hooks/useRelay'
import { useBreadcrumb } from '@/hooks/useBreadcrumb'
import { useDocumentVisible } from '@/hooks/useDocumentVisible'
import { useFlowingNow } from '@/hooks/useFlowingNow'
import { Monitor } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { scaleTime, scaleLinear } from '@visx/scale'
import { AreaClosed, LinePath, Bar, Line } from '@visx/shape'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridRows } from '@visx/grid'
import { LinearGradient } from '@visx/gradient'
import { Group } from '@visx/group'
import { ParentSize } from '@visx/responsive'
import { localPoint } from '@visx/event'
import { curveMonotoneX } from '@visx/curve'
import { bisector } from 'd3-array'
import {
  HISTORY_POLL_MS,
  RANGE_MS,
  flowIntervalMs,
  formatTick,
  liveHeadFor,
  localTicks,
  roundPercent,
  type Range,
} from '@/lib/resource-chart'
import type { BrowserInbound, SessionInfo } from '@/lib/types'

interface ResourcePoint {
  cpu_percent: number
  mem_percent: number
  recorded_at: string
}

type ChartConfig = Record<string, { label: string; color: string }>

const chartConfig = {
  cpu: { label: 'CPU', color: '#60a5fa' },
  mem: { label: 'RAM', color: '#a78bfa' },
} satisfies ChartConfig

const RANGE_LABELS: Record<Range, string> = { '1h': '1h', '6h': '6h', '24h': '24h', '7d': '7d' }

export function MacResources() {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [knownAgents, setKnownAgents] = useState<string[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [range, setRange] = useState<Range>('24h')
  // **Tagged with the Mac and range it was fetched for.** A response can then never be drawn under a
  // different selection, and "loading" is just "nothing yet for this key" — so a refresh of the same key
  // keeps the chart up instead of replacing it with a spinner every poll.
  const [history, setHistory] = useState<{ key: string; points: ResourcePoint[] } | null>(null)

  const visible = useDocumentVisible()
  // **The window's edge is the clock, not the fetch** (#751). It was the moment the history arrived, so an
  // open page kept that moment forever — and the space between the last tick and the edge, `now mod step`,
  // read as an axis skewed to one side rather than as time about to arrive.
  const now = useFlowingNow(flowIntervalMs(range), visible)

  const { setNode: setBreadcrumb } = useBreadcrumb()
  useEffect(() => {
    setBreadcrumb(<span className="text-sm font-medium">Mac Resources</span>)
    return () => setBreadcrumb(null)
  }, [setBreadcrumb])

  const handleMessage = useCallback((msg: BrowserInbound) => {
    if (msg.type === 'agents:listed') setSessions(msg.sessions ?? [])
  }, [])
  const { send, connected } = useRelay(handleMessage)

  useEffect(() => {
    if (!connected) return
    send({ type: 'agents:list' })
    const id = setInterval(() => send({ type: 'agents:list' }), 10_000)
    return () => clearInterval(id)
  }, [connected, send])

  useEffect(() => {
    fetch('/api/v1/agents', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then(setKnownAgents)
  }, [])

  const connectedNames = sessions.map((s) => s.agentName).filter(Boolean) as string[]
  const allAgents = [...new Set([...connectedNames, ...knownAgents])]
  const connectedSet = new Set(connectedNames)

  useEffect(() => {
    if (!selectedAgent && allAgents.length > 0) setSelectedAgent(allAgents[0])
  }, [allAgents.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const historyKey = selectedAgent ? `${selectedAgent}\n${range}` : null
  // When a history last finished loading, and for which key — so a tab brought back does not re-send the
  // whole window (about 10,080 rows on 7d) before its interval has come due. **Finished, not started**: a
  // first load cut short by hiding the tab would otherwise count as fresh, and the page would sit on Loading
  // for the rest of the interval.
  const loadedAt = useRef<{ key: string; at: number } | null>(null)

  useEffect(() => {
    if (!selectedAgent || !visible) return
    const key = `${selectedAgent}\n${range}`
    const poll = HISTORY_POLL_MS[range]
    const controller = new AbortController()
    let latest = 0
    const load = () => {
      const seq = ++latest
      // **Checked on both paths rather than left to `fetch` to reject.** An abort that lands after the body
      // has been read rejects nothing, and that late response is exactly the one that would draw the range
      // the reader just left. `seq` does the same for two polls of one key answering out of order.
      const current = () => !controller.signal.aborted && seq === latest
      fetch(`/api/v1/agents/${encodeURIComponent(selectedAgent)}/resources?range=${range}`, {
        credentials: 'include',
        signal: controller.signal,
      })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json() as Promise<ResourcePoint[]>
        })
        .then((points) => {
          if (!current()) return
          loadedAt.current = { key, at: Date.now() }
          setHistory({ key, points })
        })
        // A failed refresh keeps what is drawn: one dropped request emptying a monitoring chart reports an
        // outage that did not happen. A failed *first* load still settles on the empty state.
        .catch(() => {
          if (!current()) return
          loadedAt.current = { key, at: Date.now() }
          setHistory((prev) => (prev?.key === key ? prev : { key, points: [] }))
        })
    }
    const last = loadedAt.current
    const wait = last?.key === key ? Math.max(0, poll - (Date.now() - last.at)) : 0
    let id: ReturnType<typeof setInterval> | undefined
    const start = () => {
      load()
      id = setInterval(load, poll)
    }
    const deferred = wait > 0 ? setTimeout(start, wait) : undefined
    if (wait === 0) start()
    return () => {
      controller.abort()
      clearTimeout(deferred)
      clearInterval(id)
    }
  }, [selectedAgent, range, visible])

  const loaded = history !== null && history.key === historyKey
  const loading = historyKey !== null && !loaded
  const chartData = (loaded ? history.points : []).map((p) => ({
    time: p.recorded_at,
    cpu: roundPercent(p.cpu_percent),
    mem: roundPercent(p.mem_percent),
  }))
  const head = selectedAgent ? liveHeadFor(sessions, selectedAgent, now) : null

  return (
    <div className="flex h-full min-h-0">
      <h1 className="sr-only">Mac Resources</h1>
      {/* Macs sidebar. The title is a heading rather than a styled span for the same reason the chart
          titles are: with the charts now landmarked by `h2`, this list would be the one region of the page
          a screen-reader user could not jump to. */}
      <aside aria-labelledby="macs-heading" className="w-64 shrink-0 border-r flex flex-col gap-1 p-3 overflow-y-auto">
        <h2 id="macs-heading" className="px-2 pb-1 font-mono text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Macs
        </h2>
        {allAgents.length === 0 ? (
          <span className="px-2 text-sm text-muted-foreground">
            {connected ? 'No agents yet.' : 'Connecting…'}
          </span>
        ) : (
          allAgents.map((name) => {
            const isOnline = connectedSet.has(name)
            const isSelected = selectedAgent === name
            return (
              <button
                key={name}
                onClick={() => setSelectedAgent(name)}
                aria-current={isSelected ? 'true' : undefined}
                className={[
                  'flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent transition-colors',
                  isSelected ? 'bg-accent font-medium' : '',
                ].join(' ')}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                    isOnline ? 'bg-emerald-400' : 'bg-muted-foreground/40'
                  }`}
                  aria-hidden="true"
                />
                <span className="truncate min-w-0">{name}</span>
                <span className="sr-only">{isOnline ? 'Online' : 'Offline'}</span>
              </button>
            )
          })
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 overflow-auto">
        {!selectedAgent ? (
          <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
            <Monitor className="h-8 w-8" />
            <p className="text-sm">Select a Mac to view resource history.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">{selectedAgent}</h2>
              <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
                <TabsList>
                  {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
                    <TabsTrigger key={r} value={r}>{RANGE_LABELS[r]}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            {loading ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>
            ) : chartData.length === 0 ? (
              // The live head does not stand in for an empty history: a single point draws no line, and the
              // first stored row is at most a minute away.
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                No data yet for this range. Data is collected every minute while the agent is connected.
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                <ChartCard title="CPU %" color="cpu" data={chartData} dataKey="cpu" range={range} now={now} live={head?.cpu ?? null} />
                <ChartCard title="RAM %" color="mem" data={chartData} dataKey="mem" range={range} now={now} live={head?.mem ?? null} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

type Datum = { time: string; cpu: number; mem: number }
/** A point on the line: a stored sample, or the live report at its end. */
type Point = { t: number; v: number; live?: true }

const getTime = (d: Datum) => new Date(d.time).getTime()

/** The sample's time, in words. **One function, called by the tooltip and by `aria-valuetext`.** They used
 *  to format separately and diverged twice — a date the axis format had already truncated, then a rounding
 *  that gave the screen-reader user one digit less than the sighted one from the same cursor. The comment
 *  claiming the two agreed was the thing that was false.
 *
 *  `undefined` locale, not `'ko-KR'`: the document is `lang="en"`, an English synthesizer is handed this
 *  string, and every other date in the dashboard already follows the reader's own locale. */
const stampOf = (t: number) =>
  new Date(t).toLocaleString(undefined, {
    // `hourCycle`, not `hour12: false`: en-US maps that flag to h24, which speaks midnight as "24:00" —
    // an hour that is on no axis in this page. h23 is the cycle the axis labels use.
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
const percentOf = (v: number) => `${Math.round(v * 10) / 10}%`
const bisectTime = bisector<Datum, number>(getTime).left
const bisectPoint = bisector<Point, number>((p) => p.t).left

const MARGIN = { top: 8, right: 24, bottom: 24, left: 40 }
// Headroom above the 100% line, so its label is not cut off by the top of the plot. **Vertical only.**
// It was the horizontal padding too, which put the window's own edges 16px inside the grid at both
// ends — a strip the gridlines frame and no sample can ever reach, which reads as missing data for
// the same reason the axis running past `now` did.
const INSET = 16
// The live dot's outer ring. The dot is centred on the plot's right edge, so the hover surface reaches this
// far past it — otherwise half of the one thing to hover would not answer.
const HEAD_RING_R = 6
// How far past an edge a tick is still drawn: half a label ("00:00" at 11px), while some of it overlaps the plot.
const LABEL_HALF_PX = 20
// The fade at each end of the time axis. Wider than half a label, so a label crossing an edge is already faint
// before the mask starts cutting it.
const AXIS_FADE_PX = 40

function ChartCard({
  title,
  color,
  data,
  dataKey,
  range,
  now,
  live,
}: {
  title: string
  color: keyof typeof chartConfig
  data: Datum[]
  dataKey: 'cpu' | 'mem'
  range: Range
  now: number
  live: number | null
}) {
  const hex = chartConfig[color].color

  return (
    <div className="rounded-lg border p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: hex }} />
        {/* A heading, not a styled span: it is a section title in every respect, and it is what names the
            chart below it — an outline of one `h1` and nothing else gives a screen-reader user no way to
            move between the two charts. */}
        <h2 className="text-sm font-medium">{title}</h2>
      </div>
      <div className="relative h-[220px] w-full">
        <ParentSize>
          {({ width, height }) =>
            width > 0 && height > 0 ? (
              <AreaChartInner width={width} height={height} data={data} dataKey={dataKey} hex={hex} range={range} now={now} live={live} label={title} />
            ) : null
          }
        </ParentSize>
      </div>
    </div>
  )
}

/** Exported for `MacResources.chart.test.tsx` only. `ParentSize` measures 0 in jsdom, so the chart never
 *  renders through the page — and the clip below is the kind of thing that regresses silently. */
export function AreaChartInner({
  width,
  height,
  data,
  dataKey,
  hex,
  range,
  now,
  live = null,
  label,
}: {
  width: number
  height: number
  data: Datum[]
  dataKey: 'cpu' | 'mem'
  hex: string
  range: Range
  now: number
  /** The agent's latest report for this series, not yet stored. Drawn at the end of the line, and the last
   *  stop of the reading. */
  live?: number | null
  label: string
}) {
  const hintId = `chart-hint-${dataKey}`
  // **Its own state, not a view of the tooltip.** Derived, every path that hides the reading — Escape,
  // blur — snapped the announced value back to the last sample: a change the user never made, and the next
  // arrow key resumed from the end rather than where they were reading.
  // `null` until the reader places it, which is not the same as the oldest sample: an unplaced cursor should
  // open at the newest point, and a placed one should still be there after Escape or a blur. Focus used to
  // jump to the end unconditionally, so leaving and returning silently moved the reader to the other end of
  // the series and the next arrow key stepped from there.
  // **A timestamp, not an index.** The history refreshes under a reader while the window advances, and an
  // index moved the reading one sample newer for every row that aged out of the left edge. **`'live'` for
  // the live value**, which has no time of its own to hold on to — it moves with `now`, and a reader who
  // chose it should stay on it while rows are stored behind it.
  const [cursor, setCursor] = useState<number | 'live' | null>(null)
  const [readingShown, setReadingShown] = useState(false)
  // **What AT has been told, held until the reader acts.** Derived each render, the focused slider's value
  // changed with every live report (~10s) and every row that aged out, and a screen reader speaks every change
  // to a focused slider's value — with no key pressed, for as long as focus stays (WCAG 2.2.2). Set only in
  // `showAt`, which focus, keys and the pointer all go through; cleared on blur, where nothing is spoken.
  const [told, setTold] = useState<{ now: number; text: string } | null>(null)

  const innerW = width - MARGIN.left - MARGIN.right
  const innerH = height - MARGIN.top - MARGIN.bottom

  // **The window ends at `now`, and the ticks are what get rounded — not the window.** Rounding the edge
  // up to the next clean step (`ceil(now / step) * step`) kept the tick times round at the cost of up to a
  // full step of axis that no sample can ever reach: an hour of empty 6h chart, and 63px of 504 on 7d.
  // Empty because it has not happened yet, which reads as a gap in the data rather than as the edge.
  const maxT = now
  const minT = maxT - RANGE_MS[range]
  const xScale = scaleTime({ domain: [minT, maxT], range: [0, Math.max(0, innerW)] })
  const yScale = scaleLinear({ domain: [0, 100], range: [innerH, INSET] })
  // Every local boundary whose label overlaps the plot, whether or not data exists there. **Past the window,
  // not just inside it**: its span is a whole number of steps, so a tick just inside one edge always has a
  // twin just outside the other, and drawing only the inside ones left the left edge looking empty while
  // the right one faded. The axis mask cuts and fades whatever reaches past the plot. See `TICK_INTERVAL`
  // for why local, and why a DST day is allowed to space them unevenly.
  const labelReachMs = innerW > 0 ? (LABEL_HALF_PX / innerW) * RANGE_MS[range] : 0
  const ticks = localTicks(minT - labelReachMs, maxT + labelReachMs, range)
  const axisFade = innerW > 0 ? Math.min(0.5, AXIS_FADE_PX / innerW) : 0

  const gradId = `fill-${dataKey}`
  const clipId = `plot-${dataKey}`
  const axisMaskId = `axis-fade-${dataKey}`

  const latest = data[data.length - 1]
  // **The live report closes the gap between the newest stored row and `now`.** The relay stores one
  // averaged row a minute, so with the window's edge on `now` the line would stop up to a minute short —
  // ~8px on 1h — and catch up once a minute.
  // Placed at `now` on the browser's clock, but never left of the newest row, which carries the relay's: a
  // relay running ahead would otherwise bend the monotone curve back on itself. That position is also its
  // date in the reading, like any other point's: the moment it is drawn at, never before the row behind it.
  const liveHead: Point | null =
    live !== null && latest ? { t: Math.max(maxT, getTime(latest) + 1), v: live, live: true } : null
  // What is drawn and what is read are one list, so the pointer, the keyboard and the line end at the same
  // point. Stored rows keep their `data` index; the live head, when there is one, is appended.
  const line: Point[] = data.map((d) => ({ t: getTime(d), v: d[dataKey] }))
  if (liveHead) line.push(liveHead)
  // Kept on the plot: the dot marks now, which is the right edge, and a relay-ahead head lands just beyond it.
  const xIn = (t: number) => Math.min(xScale(t), innerW)
  const headX = liveHead ? xIn(liveHead.t) : 0
  const headY = liveHead ? yScale(liveHead.v) : 0

  // Clamped on render: switching 7d → 1h shrinks `data` under a cursor that was valid, which left
  // `aria-valuenow` above `aria-valuemax` and `aria-valuetext` undefined — a slider announcing a bare
  // out-of-range index instead of a reading. A sample that aged out resolves to the oldest one remaining,
  // and a live value that went away to the newest stored row.
  const lastStored = Math.max(0, data.length - 1)
  const idx =
    cursor === null ? Math.max(0, line.length - 1)
    : cursor === 'live' ? (liveHead ? line.length - 1 : lastStored)
    : Math.min(bisectTime(data, cursor), lastStored)

  const tooltipData = readingShown ? line[idx] : undefined
  // **Placed from the point on every render, not stored when the reading opened.** The window moves under
  // an open reading, and a stored position left the guide line where the sample used to be.
  const tooltipLeft = tooltipData ? xIn(tooltipData.t) : 0
  const tooltipTop = tooltipData ? yScale(tooltipData.v) : 0

  // Named, because the page renders two of these side by side — an unattributed "02:50, 57%" does not say
  // which chart answered — and by the series rather than the card title, which is "CPU %" and printed the
  // unit twice. Date and value come from `stampOf`/`percentOf`, which the visible tooltip also calls: this
  // is the only reading AT gets, since that tooltip is `aria-hidden`, so the two must not drift.
  // **"latest" for AT only.** The newest stored row is often in the same minute as the live value, and what
  // marks the live value for a sighted reader — the dot at the edge — is `aria-hidden`.
  const series = chartConfig[dataKey].label
  const reading = (p: Point) => `${series}, ${stampOf(p.t)}, ${p.live ? 'latest, ' : ''}${percentOf(p.v)}`

  /** Show the point at `i`, the way a pointer move would. The keyboard path lands here too, and this is the
   *  one place what AT is told gets updated. */
  const showAt = (i: number) => {
    const p = line[i]
    if (!p) return
    setCursor(p.live ? 'live' : p.t)
    setReadingShown(true)
    setTold({ now: i, text: reading(p) })
  }
  const hideReading = () => setReadingShown(false)

  // Dismissible without moving the pointer or focus (WCAG 1.4.13), however the reading opened. The slider's
  // own key handler runs only with focus, and a hover never gives it focus.
  useEffect(() => {
    if (!readingShown) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setReadingShown(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [readingShown])

  // **The values in this chart were mouse-only.** The tooltip is the only place a reading is written down,
  // and it opened on `mousemove` alone — so a keyboard user could reach the page and read nothing from it.
  // Arrow keys walk the points, Home/End jump to the ends, and the focused reading is announced through
  // `aria-valuetext` rather than inferred from a tooltip nobody can see.
  const handleKey = (e: React.KeyboardEvent<SVGRectElement>) => {
    if (line.length === 0) return
    // Vertical arrows too: they are half of the slider pattern's key set, and a screen-reader user in
    // focus mode reaches for them as readily as the horizontal pair.
    const current = idx
    const next =
      e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? Math.max(0, current - 1)
      : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? Math.min(line.length - 1, current + 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? line.length - 1
      : null
    if (next === null) return
    e.preventDefault()
    showAt(next)
  }

  const handleMove = (e: React.MouseEvent<SVGRectElement> | React.TouchEvent<SVGRectElement>) => {
    const point = localPoint(e)
    if (!point) return
    const x0 = point.x - MARGIN.left
    const i = bisectPoint(line, xScale.invert(x0).getTime())
    // **Nearest where the points are drawn, not nearest in time.** The live head is drawn at the plot's edge,
    // but a relay running ahead stamps rows later than any time the pointer can reach, and nearest-in-time
    // then handed every hover on the dot to a stored row. Ties go to the later point.
    const p = [line[i - 1], line[i], liveHead].reduce<Point | undefined>(
      (best, c) => (c && (!best || Math.abs(xIn(c.t) - x0) <= Math.abs(xIn(best.t) - x0)) ? c : best),
      undefined,
    )
    if (!p) return
    // Through `showAt`, so the cursor is the one source of position. Calling `showTooltip` directly here
    // moved what is drawn while `aria-valuenow` kept reporting the keyboard's index — the slider's state
    // then described something other than what it was showing.
    showAt(line.indexOf(p))
  }

  return (
    <>
      {/* `group`, not `img`: `img` takes presentational children, and the focusable surface below lives
          inside this subtree — under `img` the one element the keyboard path depends on is in a subtree
          AT is told not to expose, so the support would exist and never be advertised. */}
      <svg
        width={width}
        height={height}
        role="group"
        aria-label={
          // The live value is announced here: the dot that marks it is `aria-hidden`, and no value is printed
          // on the plot, so this is where AT hears it on the way in.
          liveHead
            ? `${label}, last ${range}. Now ${percentOf(liveHead.v)}.`
            : latest
              ? `${label}, last ${range}. Latest ${percentOf(latest[dataKey])}.`
              : `${label}, last ${range}. No samples.`
        }
      >
        <LinearGradient id={gradId} from={hex} to={hex} fromOpacity={0.3} toOpacity={0} fromOffset="5%" toOffset="95%" />
        {/* **The series is clipped to the plot, and the axis labels live outside it.** The window runs
            `now - interval` to `now` on the dashboard's clock, while the relay selects the samples from
            *its own* — two clocks only ever approximately equal, so a relay running behind returns points
            older than the window's left edge. `scaleTime` does not clamp, so those points map to a
            negative x and the area painted straight through the y-axis labels, worst on a series sitting
            where the labels are (RAM at ~57% covers 50% and 25%).
            Clipping rather than dropping them: a point just off-window still shapes the curve at the edge,
            which is what an off-screen sample should do. */}
        <clipPath id={clipId}>
          <rect x={0} y={0} width={Math.max(0, innerW)} height={Math.max(0, innerH)} />
        </clipPath>
        {/* The time axis is seen through this: clear across the plot, fading to nothing over the last
            `AXIS_FADE_PX` at each end, and nothing at all past them — so a label straddling an edge is cut and
            faded glyph by glyph, and none can paint over the y-axis labels. `userSpaceOnUse` throughout, so it
            is laid out in the plot's own coordinates, those of the group that references it. */}
        <linearGradient id={`${axisMaskId}-grad`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={Math.max(0, innerW)} y2={0}>
          <stop offset={0} stopColor="white" stopOpacity={0} />
          <stop offset={axisFade} stopColor="white" stopOpacity={1} />
          <stop offset={1 - axisFade} stopColor="white" stopOpacity={1} />
          <stop offset={1} stopColor="white" stopOpacity={0} />
        </linearGradient>
        <mask id={axisMaskId} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x={0} y={innerH} width={Math.max(0, innerW)} height={MARGIN.bottom * 2}>
          <rect x={0} y={innerH} width={Math.max(0, innerW)} height={MARGIN.bottom * 2} fill={`url(#${axisMaskId}-grad)`} />
        </mask>
        <Group left={MARGIN.left} top={MARGIN.top}>
          <GridRows scale={yScale} width={innerW} tickValues={[0, 25, 50, 75, 100]} strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <g clipPath={`url(#${clipId})`}>
            <AreaClosed<Point>
              data={line}
              x={(p) => xScale(p.t)}
              y={(p) => yScale(p.v)}
              yScale={yScale}
              curve={curveMonotoneX}
              fill={`url(#${gradId})`}
            />
            <LinePath<Point>
              data={line}
              x={(p) => xScale(p.t)}
              y={(p) => yScale(p.v)}
              curve={curveMonotoneX}
              stroke={hex}
              strokeWidth={1.5}
            />
          </g>
          <g mask={`url(#${axisMaskId})`}>
            <AxisBottom
              top={innerH}
              scale={xScale}
              tickValues={ticks}
              tickFormat={(v) => formatTick(+v, range)}
              hideAxisLine
              hideTicks
              tickLength={0}
              tickLabelProps={() => ({
                fontSize: 11,
                fill: 'currentColor',
                // **Centred, and left to the mask at both edges** rather than anchored inward. The window
                // advances, so ticks enter on the right and leave on the left; anchored `end`/`start`, the
                // outermost label jumped half its width each time one crossed.
                textAnchor: 'middle',
                dy: 6,
                className: 'fill-muted-foreground',
              })}
            />
          </g>
          <AxisLeft
            scale={yScale}
            tickValues={[0, 25, 50, 75, 100]}
            tickFormat={(v) => `${v}%`}
            hideAxisLine
            hideTicks
            tickLabelProps={() => ({ fontSize: 11, fill: 'currentColor', textAnchor: 'end', dx: -4, dy: 3, className: 'fill-muted-foreground' })}
          />
          {liveHead && (
            // **A dot, and no value beside it.** A printed value is a second rendering of what hovering the dot
            // shows, in a box that looks like the tooltip without behaving like one — the reading is the one
            // place a value is written.
            <g className="live-head" aria-hidden="true" pointerEvents="none">
              <circle cx={headX} cy={headY} r={HEAD_RING_R} fill={hex} fillOpacity={0.2} />
              <circle cx={headX} cy={headY} r={3} fill={hex} stroke="hsl(var(--background))" strokeWidth={1.5} />
            </g>
          )}
          {tooltipData && (
            <g style={{ transition: 'transform 0.25s ease-out', transform: `translateX(${tooltipLeft}px)` }} pointerEvents="none">
              <Line from={{ x: 0, y: INSET }} to={{ x: 0, y: innerH }} stroke="hsl(var(--border))" strokeWidth={1} />
              <circle cx={0} cy={0} r={3} fill={hex} stroke="hsl(var(--background))" strokeWidth={1.5} style={{ transition: 'transform 0.25s ease-out', transform: `translateY(${tooltipTop}px)` }} />
            </g>
          )}
          <Bar
            x={0}
            y={0}
            width={Math.max(0, innerW) + HEAD_RING_R}
            height={Math.max(0, innerH)}
            fill="transparent"
            tabIndex={0}
            // **`slider`, over the points drawn — the live value last.** `img` was worse than useless here: a
            // non-widget role leaves NVDA and JAWS in browse mode, where the virtual cursor swallows the arrow
            // keys before `onKeyDown` sees them — the keyboard path would exist for exactly the users who
            // could not reach it. A slider's native key model *is* arrow keys, and `aria-valuetext` speaks
            // the reading on every move, which is why there is no live region here any more.
            // The live value was once left off, so its reading could not change under a reader parked on it.
            // That made the newest thing drawn the one thing nobody could read, and a reader who moves to
            // "now" is asking for the value that changes.
            role="slider"
            aria-label={`${label} samples`}
            aria-valuemin={0}
            aria-valuemax={Math.max(0, line.length - 1)}
            // What AT was last told rather than what is under the cursor now — see `told`. Clamped, because the
            // series can shrink under a held value (7d → 1h) and a slider must not report past its maximum.
            aria-valuenow={told ? Math.min(told.now, Math.max(0, line.length - 1)) : idx}
            aria-valuetext={told ? told.text : line[idx] ? reading(line[idx]!) : undefined}
            aria-describedby={hintId}
            // No inline `outlineColor`: `outline-none` is a *transparent* 2px outline, so colouring it
            // here painted a black box around the plot at rest. The colour belongs in the focus variant.
            className="outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onFocus={() => showAt(idx)}
            onBlur={() => {
              hideReading()
              setTold(null)
            }}
            onKeyDown={handleKey}
            onMouseMove={handleMove}
            onMouseLeave={hideReading}
            onTouchMove={handleMove}
            onTouchEnd={hideReading}
            onTouchCancel={hideReading}
          />
        </Group>
      </svg>
      <p id={hintId} className="sr-only">Use the arrow keys to read individual samples; End reads the latest value again. Escape hides the reading.</p>
      {tooltipData && (
        <div
          // The reading rides on `aria-valuetext`; this is the same value drawn, and exposing both gave a
          // browse-mode reader two renderings of it that disagreed on date format and rounding.
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 whitespace-nowrap rounded-lg border bg-background px-3 py-2 text-xs text-foreground shadow-md"
          style={{
            // transform (not left/top) so position eases smoothly like recharts
            transform: `translate(${tooltipLeft + MARGIN.left}px, ${tooltipTop + MARGIN.top}px) translate(${tooltipLeft > innerW * 0.6 ? 'calc(-100% - 12px)' : '12px'}, -50%)`,
            transition: 'transform 0.25s ease-out',
          }}
        >
          <p className="mb-1">
            Date: {stampOf(tooltipData.t)}
          </p>
          <p>
            {series}: {percentOf(tooltipData.v)}
          </p>
        </div>
      )}
    </>
  )
}
