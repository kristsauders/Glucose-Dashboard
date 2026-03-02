import SwiftUI
import WidgetKit
import Charts

let APP_GROUP = "group.com.auders.t1dsage"

func sharedGlucoseEntry() -> GlucoseEntry {
    let defaults = UserDefaults(suiteName: APP_GROUP)
    let glucose = defaults?.integer(forKey: "currentGlucose") ?? 0
    let trend   = defaults?.string(forKey: "currentTrend") ?? "→"
    let ts      = defaults?.double(forKey: "currentTimestamp") ?? 0
    let date    = ts > 0 ? Date(timeIntervalSince1970: ts) : Date()
    return GlucoseEntry(date: date, glucose: glucose, trend: trend)
}

func glucoseColor(_ g: Int) -> Color {
    if g < 55  { return Color(red: 0.94, green: 0.27, blue: 0.27) }  // critically low — red
    if g < 70  { return Color(red: 0.98, green: 0.62, blue: 0.04) }  // low — yellow
    if g <= 140 { return Color(red: 0.13, green: 0.77, blue: 0.37) } // in target — green
    if g <= 180 { return Color(red: 0.98, green: 0.62, blue: 0.04) } // above target — yellow
    return Color(red: 0.94, green: 0.27, blue: 0.27)                 // high — red
}


// MARK: - Timeline entry & provider

struct GlucoseEntry: TimelineEntry {
    let date: Date
    let glucose: Int
    let trend: String
}

struct GlucoseProvider: TimelineProvider {
    func placeholder(in context: Context) -> GlucoseEntry {
        GlucoseEntry(date: Date(), glucose: 120, trend: "→")
    }
    func getSnapshot(in context: Context, completion: @escaping (GlucoseEntry) -> Void) {
        completion(sharedGlucoseEntry())
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<GlucoseEntry>) -> Void) {
        let entry = sharedGlucoseEntry()
        let next  = Calendar.current.date(byAdding: .minute, value: 5, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - Widget views

struct GlucoseCircularView: View {
    let entry: GlucoseEntry
    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Text(entry.glucose > 0 ? "\(entry.glucose)" : "--")
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .minimumScaleFactor(0.6)
                Text(entry.trend).font(.system(size: 11))
            }
            .widgetAccentable()
        }
    }
}

struct GlucoseRectangularView: View {
    let entry: GlucoseEntry
    var body: some View {
        HStack(spacing: 4) {
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 3) {
                    Text(entry.glucose > 0 ? "\(entry.glucose)" : "--")
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                    Text(entry.trend).font(.system(size: 18))
                }
                Text(entry.date, style: .relative).font(.caption2).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .widgetAccentable()
    }
}

struct GlucoseInlineView: View {
    let entry: GlucoseEntry
    var body: some View {
        Text(entry.glucose > 0 ? "\(entry.glucose) \(entry.trend)" : "-- →").widgetAccentable()
    }
}

struct GlucoseSmallView: View {
    let entry: GlucoseEntry
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12).fill(glucoseColor(entry.glucose).opacity(0.15))
            VStack(spacing: 4) {
                Text(entry.glucose > 0 ? "\(entry.glucose)" : "--")
                    .font(.system(size: 44, weight: .bold, design: .rounded))
                    .foregroundStyle(glucoseColor(entry.glucose))
                Text(entry.trend).font(.system(size: 22)).foregroundStyle(glucoseColor(entry.glucose))
                Text(entry.date, style: .relative).font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(8)
    }
}

struct GlucoseWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: GlucoseEntry
    var body: some View {
        switch family {
        case .accessoryCircular:    GlucoseCircularView(entry: entry)
        case .accessoryRectangular: GlucoseRectangularView(entry: entry)
        case .accessoryInline:      GlucoseInlineView(entry: entry)
        default:                    GlucoseSmallView(entry: entry)
        }
    }
}

struct GlucoseWidget: Widget {
    let kind = "GlucoseWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GlucoseProvider()) { entry in
            GlucoseWidgetEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Glucose")
        .description("Current glucose reading at a glance.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

// MARK: - Mini chart for Live Activity

struct GlucoseMiniChart: View {
    let history: [GlucosePoint]
    let color: Color

    var body: some View {
        // Sort oldest → newest so the line draws left to right
        let sorted = history.sorted { $0.minutesAgo > $1.minutesAgo }
        let values = sorted.map { $0.glucose }
        let rawMin = values.min() ?? 70
        let rawMax = values.max() ?? 180
        // Give the line breathing room above and below, clamped to sensor range
        let yMin = max(40, rawMin - 15)
        let yMax = min(400, rawMax + 15)
        // X domain: oldest point (negative minutesAgo) to 0 (now)
        let xMin = -(sorted.first?.minutesAgo ?? 120)

        Chart {
            ForEach(sorted.indices, id: \.self) { i in
                AreaMark(
                    x: .value("t", -sorted[i].minutesAgo),
                    y: .value("g", sorted[i].glucose)
                )
                .foregroundStyle(
                    LinearGradient(
                        colors: [color.opacity(0.20), color.opacity(0.0)],
                        startPoint: .top, endPoint: .bottom
                    )
                )
                .interpolationMethod(.catmullRom)

                LineMark(
                    x: .value("t", -sorted[i].minutesAgo),
                    y: .value("g", sorted[i].glucose)
                )
                .foregroundStyle(color)
                .lineStyle(StrokeStyle(lineWidth: 1.5))
                .interpolationMethod(.catmullRom)
            }
            // Low threshold
            RuleMark(y: .value("Low", 70))
                .lineStyle(StrokeStyle(lineWidth: 0.5, dash: [3, 2]))
                .foregroundStyle(.red.opacity(0.35))
            // High threshold
            RuleMark(y: .value("High", 180))
                .lineStyle(StrokeStyle(lineWidth: 0.5, dash: [3, 2]))
                .foregroundStyle(.orange.opacity(0.35))
        }
        .chartXScale(domain: xMin...0)
        .chartYScale(domain: yMin...yMax)
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .chartLegend(.hidden)
    }
}

// MARK: - Live Activity view

// Shared helpers for Live Activity views
func insulinLabel(units: Double?, date: Date?, compact: Bool = false) -> String? {
    guard let units, let date else { return nil }
    let u = units.truncatingRemainder(dividingBy: 1) == 0
        ? String(format: "%.0f", units)
        : String(format: "%.1f", units)
    let mins = Int(Date().timeIntervalSince(date) / 60)
    if compact {
        if mins < 60 { return "💉\(u)u \(mins)m" }
        let hrs = mins / 60; let rem = mins % 60
        return rem == 0 ? "💉\(u)u \(hrs)h" : "💉\(u)u \(hrs)h\(rem)m"
    }
    if mins < 60 { return "💉 \(u)u · \(mins)m ago" }
    let hrs = mins / 60; let rem = mins % 60
    return rem == 0 ? "💉 \(u)u · \(hrs)h ago" : "💉 \(u)u · \(hrs)h \(rem)m ago"
}

// iPhone lock screen layout
struct GlucoseLiveActivityPhoneView: View {
    let state: GlucoseActivityAttributes.ContentState
    var color: Color { glucoseColor(state.glucose) }
    var isStale: Bool { Date().timeIntervalSince(state.readingDate) > 15 * 60 }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Left column: glucose value + metadata (takes its natural width)
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(isStale ? "--" : "\(state.glucose)")
                        .font(.system(size: 52, weight: .bold, design: .rounded))
                        .foregroundStyle(isStale ? Color.secondary : color)
                    Text(isStale ? "?" : state.trend)
                        .font(.system(size: 36))
                        .foregroundStyle(isStale ? Color.secondary : color)
                }
                if isStale {
                    Label("No data", systemImage: "exclamationmark.circle")
                        .font(.caption.bold()).foregroundStyle(Color.orange)
                } else {
                    Text(state.readingDate, style: .relative)
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let label = insulinLabel(units: state.lastInsulinUnits, date: state.lastInsulinDate) {
                    Text(label).font(.caption).foregroundStyle(.secondary)
                }
            }

            // Right column: chart fills remaining width; minHeight anchors the dynamic height
            if let hist = state.history, !hist.isEmpty, !isStale {
                GlucoseMiniChart(history: hist, color: color)
                    .frame(maxWidth: .infinity, minHeight: 70)
            }
        }
        .padding(12)
    }
}

// Apple Watch layout — compact
struct GlucoseLiveActivityWatchView: View {
    let state: GlucoseActivityAttributes.ContentState
    var color: Color { glucoseColor(state.glucose) }
    var isStale: Bool { Date().timeIntervalSince(state.readingDate) > 15 * 60 }

    var body: some View {
        HStack(alignment: .top, spacing: 6) {
            // Left column: glucose value + metadata
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(isStale ? "--" : "\(state.glucose)")
                        .font(.system(size: 40, weight: .bold, design: .rounded))
                        .foregroundStyle(isStale ? Color.secondary : color)
                        .minimumScaleFactor(0.7)
                    Text(isStale ? "?" : state.trend)
                        .font(.system(size: 22))
                        .foregroundStyle(isStale ? Color.secondary : color)
                }
                if isStale {
                    Image(systemName: "exclamationmark.circle.fill").foregroundStyle(Color.orange)
                } else {
                    Text(state.readingDate, style: .relative)
                        .font(.caption2).foregroundStyle(.secondary)
                }
                if let label = insulinLabel(units: state.lastInsulinUnits, date: state.lastInsulinDate, compact: true) {
                    Text(label).font(.caption2).foregroundStyle(.secondary)
                }
            }

            // Right column: chart fills remaining width; minHeight anchors the dynamic height
            if let hist = state.history, !hist.isEmpty, !isStale {
                GlucoseMiniChart(history: hist, color: color)
                    .frame(maxWidth: .infinity, minHeight: 50)
            }
        }
        .padding(8)
    }
}

// Entry point: routes to phone or watch layout. Deployment target 18.0 so activityFamily is always available.
@available(iOS 16.2, *)
struct GlucoseLiveActivityView: View {
    let state: GlucoseActivityAttributes.ContentState
    @Environment(\.activityFamily) var activityFamily
    var body: some View {
        if activityFamily == .small {
            GlucoseLiveActivityWatchView(state: state)
        } else {
            GlucoseLiveActivityPhoneView(state: state)
        }
    }
}
