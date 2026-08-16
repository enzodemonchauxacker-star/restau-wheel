import Foundation

/// Point de configuration unique de l'app iOS.
/// Pour pointer vers un autre serveur (prod perso, tunnel local…), change `baseURL`.
enum AppConfig {

    /// URL de l'application web Restau Wheel.
    static let baseURL = URL(string: "https://restauwheel.com")!

    /// Page ouverte au lancement.
    /// Pour démarrer directement sur le dashboard : `baseURL.appending(path: "admin")`.
    static let startURL = baseURL

    /// Domaines qui restent affichés dans l'app.
    /// Stripe en fait partie : le tunnel de paiement redirige ensuite vers `/admin?paid=1`,
    /// sortir dans Safari casserait le retour.
    /// Tout le reste (liens externes cliqués par l'utilisateur) part dans Safari.
    static let internalDomains: Set<String> = [
        "restauwheel.com",
        "www.restauwheel.com",
        "restau-wheel-main.vercel.app",
        "stripe.com",
        "stripe.network",
    ]

    static func isInternal(_ url: URL) -> Bool {
        guard let host = url.host()?.lowercased() else { return false }
        return internalDomains.contains { host == $0 || host.hasSuffix("." + $0) }
    }
}
