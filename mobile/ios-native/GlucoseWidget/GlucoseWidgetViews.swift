import SwiftUI
import WidgetKit

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
    if g < 70  { return Color(red: 0.94, green: 0.27, blue: 0.27) }
    if g > 180 { return Color(red: 0.98, green: 0.62, blue: 0.04) }
    return Color(red: 0.13, green: 0.77, blue: 0.37)
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

// MARK: - Live Activity view

@available(iOS 16.2, *)
struct GlucoseLiveActivityView: View {
    let state: GlucoseActivityAttributes.ContentState
    var color: Color { glucoseColor(state.glucose) }
    // Data older than 15 minutes hasn't been refreshed in ≥3 CGM cycles — warn the user.
    var isStale: Bool { Date().timeIntervalSince(state.readingDate) > 15 * 60 }

    var insulinLabel: String? {
        guard let units = state.lastInsulinUnits, let date = state.lastInsulinDate else { return nil }
        let u = units.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f", units)
            : String(format: "%.1f", units)
        let mins = Int(Date().timeIntervalSince(date) / 60)
        if mins < 60 {
            return "💉 \(u)u · \(mins)m ago"
        } else {
            let hrs = mins / 60
            let rem = mins % 60
            return rem == 0 ? "💉 \(u)u · \(hrs)h ago" : "💉 \(u)u · \(hrs)h \(rem)m ago"
        }
    }

    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            // Left: glucose value + trend arrow + timestamp
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(isStale ? "--" : "\(state.glucose)")
                        .font(.system(size: 48, weight: .bold, design: .rounded))
                        .foregroundStyle(isStale ? Color.secondary : color)
                    Text(isStale ? "?" : state.trend)
                        .font(.system(size: 30))
                        .foregroundStyle(isStale ? Color.secondary : color)
                }
                if isStale {
                    Label("No recent data", systemImage: "exclamationmark.circle")
                        .font(.caption2.bold())
                        .foregroundStyle(Color.orange)
                } else {
                    Text(state.readingDate, style: .relative)
                        .font(.caption).foregroundStyle(.secondary)
                }
            }

            Spacer()

            // Right: alert badge (if any) + last insulin dose
            VStack(alignment: .trailing, spacing: 6) {
                if isStale {
                    Text("DELAYED")
                        .font(.caption.bold()).foregroundStyle(Color.orange)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Color.orange.opacity(0.15), in: Capsule())
                } else if state.isLow || state.isHigh {
                    Text(state.isLow ? "LOW" : "HIGH")
                        .font(.caption.bold()).foregroundStyle(color)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(color.opacity(0.15), in: Capsule())
                }
                if let label = insulinLabel {
                    Text(label)
                        .font(.caption2).foregroundStyle(.secondary)
                        .multilineTextAlignment(.trailing)
                }
            }
        }
        .padding(12)
    }
}
