import SwiftUI

/// Couleurs reprises de `public/css/theme.css` pour que le chrome natif
/// (safe areas, écran de chargement, écran d'erreur) colle au site.
enum Theme {
    /// --felt / --ink : #0a0a0a
    static let background = Color(hex: 0x0A0A0A)
    /// --brass : #ffd60a
    static let gold = Color(hex: 0xFFD60A)
    /// --wine : #ff2d6a
    static let pink = Color(hex: 0xFF2D6A)
    /// --ivory : #fff8e7
    static let ivory = Color(hex: 0xFFF8E7)
    /// --cyan : #00c2ff
    static let cyan = Color(hex: 0x00C2FF)
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}
