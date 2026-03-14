import AppIntents
import Foundation

// MARK: - Shared helpers

private func sharedDefaults() -> UserDefaults? {
    UserDefaults(suiteName: APP_GROUP)
}

private func quickLogRequest(type: String, data: [String: Any]) async throws {
    let ud = sharedDefaults()
    guard let token = ud?.string(forKey: "authToken"), !token.isEmpty else {
        throw QuickLogError.notAuthenticated
    }
    guard let baseUrl = ud?.string(forKey: "serverBaseUrl"), !baseUrl.isEmpty,
          let url = URL(string: "\(baseUrl)/quick-actions/log") else {
        throw QuickLogError.serverError
    }

    let body: [String: Any] = [
        "type": type,
        "timestamp": ISO8601DateFormatter().string(from: Date()),
        "data": data,
    ]

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    request.timeoutInterval = 10

    let (_, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, http.statusCode < 300 else {
        throw QuickLogError.serverError
    }
}

enum QuickLogError: Error, CustomLocalizedStringResourceConvertible {
    case notAuthenticated
    case serverError

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .notAuthenticated: return "Open Sage first to sign in."
        case .serverError: return "Could not reach Sage. Check your connection."
        }
    }
}

// MARK: - Log Insulin

struct LogInsulinIntent: AppIntent {
    static var title: LocalizedStringResource = "Log Insulin"
    static var description = IntentDescription("Log an insulin dose in Sage.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Units", description: "Units of insulin to log",
               requestValueDialog: "How many units?")
    var units: Double

    func perform() async throws -> some IntentResult & ProvidesDialog {
        try await quickLogRequest(type: "insulin", data: [
            "insulinType": "bolus",
            "units": units,
            "purpose": "meal",
        ])
        let formatted = units.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f", units) : String(format: "%.1f", units)
        return .result(dialog: "Logged \(formatted)u insulin in Sage.")
    }
}

// MARK: - Log Meal

struct LogMealIntent: AppIntent {
    static var title: LocalizedStringResource = "Log Meal"
    static var description = IntentDescription("Log a meal with carb count in Sage.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Carbs (g)", description: "Grams of carbohydrates",
               requestValueDialog: "How many grams of carbs?")
    var carbs: Int

    @Parameter(title: "Description", description: "Optional — what did you eat?")
    var mealDescription: String?

    func perform() async throws -> some IntentResult & ProvidesDialog {
        var data: [String: Any] = ["carbs": carbs]
        if let desc = mealDescription, !desc.isEmpty { data["description"] = desc }
        try await quickLogRequest(type: "meal", data: data)
        return .result(dialog: "Logged \(carbs)g carbs in Sage.")
    }
}

// MARK: - Log Exercise

struct LogExerciseIntent: AppIntent {
    static var title: LocalizedStringResource = "Log Exercise"
    static var description = IntentDescription("Log an exercise session in Sage.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Activity", description: "Type of exercise (e.g. walk, run, bike)",
               requestValueDialog: "What activity did you do?")
    var activityType: String

    @Parameter(title: "Duration (minutes)", description: "How many minutes?",
               requestValueDialog: "How many minutes?")
    var duration: Int

    func perform() async throws -> some IntentResult & ProvidesDialog {
        try await quickLogRequest(type: "exercise", data: [
            "activityType": activityType,
            "duration": duration,
            "intensity": "moderate",
        ])
        return .result(dialog: "Logged \(duration) min \(activityType) in Sage.")
    }
}

// MARK: - App Shortcuts (Siri phrases — iOS 16.4+)
//
// Declaring SageAppShortcuts makes the three intents available via Siri and as
// suggested shortcuts on the lock screen with zero user setup.

struct SageAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: LogInsulinIntent(),
            phrases: [
                "Log insulin in \(.applicationName)",
                "Log a dose in \(.applicationName)",
                "Record insulin in \(.applicationName)",
            ],
            shortTitle: "Log Insulin",
            systemImageName: "syringe.fill"
        )
        AppShortcut(
            intent: LogMealIntent(),
            phrases: [
                "Log a meal in \(.applicationName)",
                "Log carbs in \(.applicationName)",
                "Record what I ate in \(.applicationName)",
            ],
            shortTitle: "Log Meal",
            systemImageName: "fork.knife"
        )
        AppShortcut(
            intent: LogExerciseIntent(),
            phrases: [
                "Log exercise in \(.applicationName)",
                "Log a workout in \(.applicationName)",
                "Record exercise in \(.applicationName)",
            ],
            shortTitle: "Log Exercise",
            systemImageName: "figure.run"
        )
    }
}
