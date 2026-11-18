// Builds the /analysis/ tour's recordings (src/assets/analysis-tour/<id>.json) from the race recordings, with the
// app's own engine: the Electron frontend's native addon (libtnrp), loaded in Node. Each file holds the player's
// featured laps and a rival's three fastest, each lap's trace (every 4th sample), and libtnrp's map layers, braking
// zones and delta for every ordered pair of those laps.
//
//   node tools/analysis-data.mjs [--recordings <dir>] [--addon <protocol_parser.node>] [--out <dir>]
//
// Defaults: the recordings in ~/Documents/Track-N-Race, the addon from ../Track-N-Race/electron-frontend (build it
// there first with the engine you want the data from).
import { createRequire } from 'node:module'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { ROOT, parseArgs } from './analysis-page.mjs'

const RECORDINGS = [
    {
        id: 'interlagos', file: 'f1_26_16_s__o_paulo_grand_prix_race_2026-10-19T10-55-14-088Z-all.tnrd',
        // Lap A of the tour first; the player's laps the session clock can play
        playerLaps: [58, 71, 70], rival: /ALONSO/i,
    },
    {
        id: 'spa', file: 'f1_26_10_belgian_grand_prix_race_2026-10-17T16-37-19-562Z-all.tnrd',
        playerLaps: [42, 34, 14], rival: /ALONSO/i,
    },
]
const RIVAL_LAPS = 3
const TRACE_STRIDE = 4
const DELTA_STRIDE = 6
const MODES = ['dominance', 'inputs', 'speed', 'ers', 'harvest', 'braking']

const args = parseArgs()
const recordingsDir = resolve(args.option('recordings', join(homedir(), 'Documents', 'Track-N-Race')))
const addonPath = resolve(args.option('addon', join(ROOT, '..', 'Track-N-Race', 'electron-frontend', 'node_addon', 'build', 'Release', 'protocol_parser.node')))
if (!existsSync(addonPath)) throw new Error(`No engine addon at ${addonPath}`)
const addon = createRequire(import.meta.url)(addonPath)
const outDir = resolve(args.option('out', join(ROOT, 'src', 'assets', 'analysis-tour')))

const round = (v, places) => {
    if (v === null || v === undefined || !Number.isFinite(v)) return null
    const k = 10 ** places
    return Math.round(v * k) / k
}
/** Every float in a libtnrp result to 3 places, as the page needs no more */
const tidy = value => Array.isArray(value) ? value.map(tidy)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, tidy(v)]))
        : typeof value === 'number' && !Number.isInteger(value) ? round(value, 3) : value

const lapKey = (driver, lap, playerIndex) => driver === playerIndex ? String(lap) : `${driver}:${lap}`

/** The row in `rows` in effect at `time` (the last at or before it, else the first) */
function rowAt(rows, time, from) {
    let i = from.i
    while (i + 1 < rows.length && rows[i + 1].session_time <= time) i++
    from.i = i
    return rows[i]
}

/** A lap's trace and its details, from libtnrp's lap data */
function buildLap(engine, block, driver, playerIndex) {
    const json = engine.analysisGetLapData(block.lapNum, 0xFFFFFFFF, true, driver)
    if (!json) throw new Error(`No data for driver ${driver} lap ${block.lapNum}`)
    const p = JSON.parse(json)
    const tel = p.telemetry, status = p.statusHistory, motion = p.motionHistory, motionEx = p.motionExHistory
    const progress = p.lapProgress, positions = p.playerPositions
    if (!tel.length) throw new Error(`Driver ${driver} lap ${block.lapNum} has no telemetry`)
    for (const [name, rows] of [['status', status], ['motion', motion], ['lapProgress', progress], ['positions', positions]]) {
        if (!rows.length) throw new Error(`Driver ${driver} lap ${block.lapNum}: no ${name} rows`)
    }
    const start = p.startSessionTime
    // Each history is read at the telemetry row's time: they are not always one row per telemetry row
    const damage = { i: 0 }, at = { status: { i: 0 }, motion: { i: 0 }, motionEx: { i: 0 }, progress: { i: 0 }, positions: { i: 0 } }
    const trace = Object.fromEntries(['t', 'd', 'x', 'z', 'spd', 'thr', 'brk', 'str', 'gear', 'ers', 'rpm', 'glat', 'glong', 'rhf', 'rhr',
        'ice', 'mguk', 'hk', 'hh', 'fuel', 'sfl', 'ifl', 'bfl', 'wfl', 'sfr', 'ifr', 'bfr', 'wfr', 'srl', 'irl', 'brl', 'wrl', 'srr', 'irr', 'brr', 'wrr']
        .map(k => [k, []]))
    for (let i = 0; i < tel.length; i += TRACE_STRIDE) {
        // (the histories' times are rounded to the millisecond, so a row stamped up to 2 ms after the telemetry row is
        // the same moment)
        const tm = tel[i], time = tm.session_time + 0.002
        const st = rowAt(status, time, at.status), mo = rowAt(motion, time, at.motion), pr = rowAt(progress, time, at.progress)
        const po = rowAt(positions, time, at.positions), mx = motionEx.length ? rowAt(motionEx, time, at.motionEx) : null
        const dm = p.damageHistory.length ? rowAt(p.damageHistory, tm.session_time, damage) : null
        trace.t.push(round(tm.session_time - start, 3))
        trace.d.push(round(pr.lap_distance_m, 1))
        trace.x.push(round(po.x, 1)); trace.z.push(round(po.z, 1))
        trace.spd.push(round(tm.speed_kph, 0)); trace.thr.push(round(tm.throttle, 2)); trace.brk.push(round(tm.brake, 2))
        trace.str.push(round(tm.steering, 2)); trace.gear.push(tm.gear); trace.rpm.push(round(tm.rpm, 0))
        trace.ers.push(round(st.ers_pct, 1))
        trace.glat.push(round(mo.g_lat, 2)); trace.glong.push(round(mo.g_long, 2))
        // The game sends ride heights for the player's car only
        trace.rhf.push(mx ? round(mx.front_aero_height_mm, 1) : null); trace.rhr.push(mx ? round(mx.rear_aero_height_mm, 1) : null)
        trace.ice.push(round(st.engine_power_ice_kw, 1)); trace.mguk.push(round(st.engine_power_mguk_kw, 1))
        trace.hk.push(round(st.ers_harvested_mguk_j / 1000, 1)); trace.hh.push(round(st.ers_harvested_mguh_j / 1000, 1))
        trace.fuel.push(round(st.fuel_kg, 2))
        for (const c of ['fl', 'fr', 'rl', 'rr']) {
            trace[`s${c}`].push(round(tm[`tyre_temp_surface_${c}`], 0))
            trace[`i${c}`].push(round(tm[`tyre_temp_inner_${c}`], 0))
            trace[`b${c}`].push(round(tm[`brake_temp_${c}`], 0))
            trace[`w${c}`].push(dm ? round(dm[`tyre_wear_${c}`], 1) : null)
        }
    }
    const time = round(block.endSessionTime - block.startSessionTime, 3)
    // Sector times from the lap's progress (the last rows can already read the next lap's zeros, so the largest);
    // where they start along the lap from the block, else from where the progress first reads the next sector
    const s1 = round(Math.max(...progress.map(r => r.s1_ms || 0)) / 1000, 3)
    const s2 = round(Math.max(...progress.map(r => r.s2_ms || 0)) / 1000, 3)
    const sectorStart = sector => progress.find(r => r.sector >= sector)?.lap_distance_m ?? null
    const lapEnd = block.statusHistory.at(-1) ?? {}
    const timing = p.timingHistory[0]?.cars?.find(car => car.idx === driver)
    return {
        lap: block.lapNum, key: lapKey(driver, block.lapNum, playerIndex), driver,
        time, s1, s2, s3: round(time - s1 - s2, 3),
        compound: lapEnd.visual_compound ?? st0(status).visual_compound, actual: lapEnd.tyre_compound ?? st0(status).tyre_compound,
        start: round(start, 3), tyreAge: status[0].tyre_age_laps, fuel: round(status[0].fuel_kg, 1), ersStart: round(status[0].ers_pct, 1),
        position: timing?.position ?? null,
        topSpeed: Math.max(...tel.map(r => r.speed_kph)),
        s1EndM: round(block.sector1EndDistanceM > 0 ? block.sector1EndDistanceM : sectorStart(1), 1),
        s2EndM: round(block.sector2EndDistanceM > 0 ? block.sector2EndDistanceM : sectorStart(2), 1),
        trace,
    }
}
const st0 = rows => rows[0] ?? {}

/** A lap's pit flag: the car in the pit lane at any point of it */
function pitted(engine, lapNum, driver) {
    const json = engine.analysisGetLapData(lapNum, 0xFFFFFFFF, true, driver)
    if (!json) return 0
    return JSON.parse(json).timingHistory.some(row => row.cars?.some(car => car.idx === driver && car.pit_status > 0)) ? 1 : 0
}

/** [lap, seconds, pit, visual compound, actual compound, start session time] for each lap a driver completed */
function lapTimes(blocks, pit = () => 0) {
    return blocks.filter(b => b.lapNum > 0).sort((a, b) => a.lapNum - b.lapNum).map(b => {
        const end = b.statusHistory.at(-1) ?? {}
        return [b.lapNum, round(b.endSessionTime - b.startSessionTime, 3), pit(b.lapNum), end.visual_compound ?? 0, end.tyre_compound ?? 0, round(b.startSessionTime, 3)]
    })
}

/** One libtnrp map result cut down to what the page reads for `mode` */
function mapFields(mode, r) {
    switch (mode) {
        case 'dominance': return { dominance: r.dominance }
        case 'inputs': return { current: r.currentInputs, comparison: r.comparisonInputs }
        case 'speed': return { current: r.currentSpeed, comparison: r.comparisonSpeed, min: r.speedScaleMinKph, max: r.speedScaleMaxKph }
        case 'ers': return { current: r.current, comparison: r.comparison, normalPeakMismatch: r.normalPeakMismatch, reducedPeakMismatch: r.reducedPeakMismatch }
        case 'harvest': return { current: r.currentHarvest, comparison: r.comparisonHarvest, harvestPeakMismatch: r.harvestPeakMismatch }
        case 'braking': return { braking: r.braking }
    }
}

async function build(recording, catalog) {
    const path = join(recordingsDir, recording.file)
    const engine = new addon.Engine({ port: 29999 }, () => { })
    try {
        const loaded = await engine.analysisLoadFile(path)
        if (!loaded.ok) throw new Error(`${recording.file}: ${loaded.error}`)
        const info = JSON.parse(loaded.blocksJson)
        const playerIndex = info.playbackDriverIndex
        const player = info.analysisDrivers.find(d => d.driverIndex === playerIndex)
        const rival = info.analysisDrivers.find(d => recording.rival.test(d.driverName))
        if (!player || !rival) throw new Error(`${recording.file}: player or rival not found`)
        const rivalLaps = rival.laps.filter(l => l.lapTimeMs > 0).sort((a, b) => a.lapTimeMs - b.lapTimeMs).slice(0, RIVAL_LAPS).map(l => l.lapNum)
        const team = id => catalog.find(t => t.id === id)
        const describe = (d, fastestLap, times) => ({
            index: d.driverIndex, name: d.driverName, number: d.raceNumber, player: d.isPlayer,
            teamId: d.teamId, teamName: team(d.teamId)?.name ?? '', teamColor: team(d.teamId)?.color ?? '#5794F2',
            fastestLap, lapTimes: times,
        })
        const fastestOf = d => d.laps.filter(l => l.lapTimeMs > 0).sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0]?.lapNum ?? null

        console.log(`${recording.id}: player ${player.driverName} laps ${recording.playerLaps.join(', ')}; ${rival.driverName} laps ${rivalLaps.join(', ')}`)
        const laps = {}
        for (const [driver, nums] of [[player, recording.playerLaps], [rival, rivalLaps]]) {
            for (const n of nums) {
                const block = driver.blocks.find(b => b.lapNum === n)
                const lap = buildLap(engine, block, driver.driverIndex, playerIndex)
                laps[lap.key] = lap
            }
        }
        const keys = Object.keys(laps)
        const maps = {}, deltas = {}
        for (const a of keys) for (const b of keys) {
            if (a === b) continue
            const A = laps[a], B = laps[b], pair = `${a}-${b}`
            maps[pair] = {}
            for (const mode of MODES) {
                const json = await engine.analysisMap(mode, A.lap, true, A.driver, B.lap, true, B.driver)
                if (!json) throw new Error(`${pair} ${mode}: no result`)
                maps[pair][mode] = tidy(mapFields(mode, JSON.parse(json)))
            }
            const delta = JSON.parse(await engine.analysisCompareLaps(A.lap, true, A.driver, B.lap, true, B.driver, false))
            deltas[pair] = {
                max: round(delta.maxAbsDeltaSeconds, 3),
                samples: delta.samples.filter((_, i) => i % DELTA_STRIDE === 0).map(s => [round(s.lap_distance_m, 1), round(s.delta_seconds, 3), s.valid ? 1 : 0]),
            }
        }
        const sessionEnd = info.blocks.find(b => b.lapNum === 0)?.startSessionTime
            ?? Math.max(...info.blocks.map(b => b.endSessionTime))
        const map = JSON.parse(readFileSync(join(ROOT, 'src', 'assets', 'analysis-tour', `track_${loaded.trackId}.json`), 'utf8'))
        const playerTimes = lapTimes(player.blocks.length ? player.blocks : info.blocks, n => pitted(engine, n, playerIndex))
        return {
            id: recording.id, file: recording.file, track: loaded.trackName, trackId: loaded.trackId, session: 'Race',
            trackLengthM: info.trackLengthM,
            featured: recording.playerLaps,
            // The tour's Lap A (the player) and Lap B (the rival's fastest)
            tour: { lapA: lapKey(playerIndex, recording.playerLaps[0], playerIndex), lapB: lapKey(rival.driverIndex, rivalLaps[0], playerIndex) },
            lapTimes: playerTimes,
            laps, maps, deltas,
            driver: { name: player.driverName, number: player.raceNumber, index: playerIndex },
            drivers: [describe(player, info.fastestLapNum ?? fastestOf(player), playerTimes), describe(rival, fastestOf(rival), lapTimes(rival.blocks))],
            fastestLap: info.fastestLapNum ?? null,
            sessionTotal: round(sessionEnd, 3),
            rotation: map.rotation_deg ?? 0,
            format: `${info.tnrdRevision ?? info.tnrdVersion} · chunked zstd`,
            bytes: statSync(path).size,
        }
    } finally {
        engine.destroy()
    }
}

const catalogEngine = new addon.Engine({ port: 29999 }, () => { })
const catalogs = JSON.parse(catalogEngine.teamColorCatalog())
catalogEngine.destroy()
const catalog = Object.keys(catalogs).sort().reverse().flatMap(year => catalogs[year])
for (const recording of RECORDINGS) {
    const data = await build(recording, catalog)
    const out = join(outDir, `${recording.id}.json`)
    writeFileSync(out, JSON.stringify(data))
    console.log(`${recording.id}: ${Object.keys(data.laps).length} laps, ${Object.keys(data.maps).length} pairs, ${(statSync(out).size / 1e6).toFixed(2)} MB → ${out}`)
}
process.exit(0)
