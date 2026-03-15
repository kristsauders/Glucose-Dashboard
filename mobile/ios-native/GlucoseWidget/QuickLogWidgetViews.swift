import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Timeline plumbing (static — no data needed, layout never changes)

struct QuickLogEntry: TimelineEntry {
    let date: Date
}

struct QuickLogProvider: TimelineProvider {
    func placeholder(in context: Context) -> QuickLogEntry { QuickLogEntry(date: Date()) }
    func getSnapshot(in context: Context, completion: @escaping (QuickLogEntry) -> Void) {
        completion(QuickLogEntry(date: Date()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<QuickLogEntry>) -> Void) {
        let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date())!
        completion(Timeline(entries: [QuickLogEntry(date: Date())], policy: .after(next)))
    }
}

// MARK: - Deep link URLs
//
// These open the app (after biometric unlock on lock screen) and navigate
// directly to the Log tab with the right type pre-selected.

private let insulinURL  = URL(string: "sage:///(tabs)/log?type=insulin")!
private let mealURL     = URL(string: "sage:///(tabs)/log?type=meal")!
private let exerciseURL = URL(string: "sage:///(tabs)/log?type=exercise")!

// MARK: - Lock screen rectangular view

struct QuickLogAccessoryView: View {
    var body: some View {
        HStack(spacing: 0) {
            Link(destination: insulinURL) {
                VStack(spacing: 4) {
                    Image(systemName: "syringe.fill")
                        .font(.system(size: 20, weight: .semibold))
                    Text("Insulin")
                        .font(.system(size: 11, weight: .semibold))
                        .minimumScaleFactor(0.8)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

            Rectangle()
                .frame(width: 0.5)
                .foregroundStyle(.secondary.opacity(0.4))

            Link(destination: mealURL) {
                VStack(spacing: 4) {
                    Image(systemName: "fork.knife")
                        .font(.system(size: 20, weight: .semibold))
                    Text("Meal")
                        .font(.system(size: 11, weight: .semibold))
                        .minimumScaleFactor(0.8)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

            Rectangle()
                .frame(width: 0.5)
                .foregroundStyle(.secondary.opacity(0.4))

            Link(destination: exerciseURL) {
                VStack(spacing: 4) {
                    Image(systemName: "figure.run")
                        .font(.system(size: 20, weight: .semibold))
                    Text("Exercise")
                        .font(.system(size: 11, weight: .semibold))
                        .minimumScaleFactor(0.8)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .widgetAccentable()
    }
}

// MARK: - Home screen small view

struct QuickLogSmallView: View {
    var body: some View {
        VStack(spacing: 6) {
            Text("Sage")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.secondary)

            HStack(spacing: 6) {
                QuickLogTileButton(url: insulinURL,  icon: "syringe.fill",  label: "Insulin",  tint: Color(red: 0.23, green: 0.51, blue: 0.96))
                QuickLogTileButton(url: mealURL,     icon: "fork.knife",    label: "Meal",     tint: Color(red: 0.98, green: 0.62, blue: 0.04))
                QuickLogTileButton(url: exerciseURL, icon: "figure.run",    label: "Exercise", tint: Color(red: 0.13, green: 0.77, blue: 0.37))
            }
        }
        .padding(10)
    }
}

struct QuickLogTileButton: View {
    let url: URL
    let icon: String
    let label: String
    let tint: Color

    var body: some View {
        Link(destination: url) {
            VStack(spacing: 4) {
                ZStack {
                    Circle()
                        .fill(tint.opacity(0.15))
                        .frame(width: 34, height: 34)
                    Image(systemName: icon)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(tint)
                }
                Text(label)
                    .font(.system(size: 8, weight: .medium))
                    .foregroundStyle(.secondary)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
        }
    }
}

// MARK: - Widget entry view & widget struct

struct QuickLogEntryView: View {
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .accessoryRectangular: QuickLogAccessoryView()
        default:                    QuickLogSmallView()
        }
    }
}

struct QuickLogWidget: Widget {
    let kind = "QuickLogWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: QuickLogProvider()) { _ in
            QuickLogEntryView()
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Quick Log")
        .description("Log insulin, meals, or exercise with one tap.")
        .supportedFamilies([.systemSmall, .accessoryRectangular])
    }
}
