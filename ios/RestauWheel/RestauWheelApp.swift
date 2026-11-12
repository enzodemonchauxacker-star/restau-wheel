import SwiftUI

@main
struct RestauWheelApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ignoresSafeArea()
                .background(Theme.background.ignoresSafeArea())
        }
    }
}
