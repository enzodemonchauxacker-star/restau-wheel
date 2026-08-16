import SwiftUI

struct RootView: View {
    @StateObject private var model = WebViewModel()

    var body: some View {
        ZStack(alignment: .top) {
            // Le site est sombre partout (--felt) : on peint les safe areas de la
            // même couleur plutôt que de lire le fond de la page, qui n'est pas
            // fiable (/admin peint son canvas sur #login-screen, pas sur body).
            Theme.background
                .ignoresSafeArea()

            WebView(model: model)
                .opacity(model.loadError == nil ? 1 : 0)

            if model.isLoading, model.progress < 1 {
                ProgressBar(value: model.progress)
            }

            // Le geste de retour de WKWebView existe, mais rien à l'écran ne
            // l'annonce : sur /client et /admin il n'y a aucun lien de retour.
            // D'où cette pastille, visible seulement quand il y a un historique.
            if model.canGoBack, model.loadError == nil {
                BackButton { model.goBack() }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                    .padding(.leading, 16)
                    .padding(.bottom, 20)
                    .transition(.opacity.combined(with: .scale(scale: 0.8)))
            }

            if let error = model.loadError {
                ConnectionErrorView(error: error) { model.reload() }
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: model.loadError == nil)
        .animation(.spring(response: 0.3, dampingFraction: 0.75), value: model.canGoBack)
        .preferredColorScheme(.dark)
    }
}

private struct BackButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "chevron.left")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(Theme.gold)
                .frame(width: 44, height: 44)
                .background(Theme.background.opacity(0.82))
                .overlay(Circle().stroke(Theme.gold.opacity(0.5), lineWidth: 1.5))
                .clipShape(Circle())
                .shadow(color: .black.opacity(0.45), radius: 10, y: 3)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Retour")
    }
}

/// Fine barre dorée en haut, à la place du spinner plein écran :
/// la page reste visible pendant les navigations internes.
private struct ProgressBar: View {
    let value: Double

    var body: some View {
        GeometryReader { geometry in
            Theme.gold
                .frame(width: geometry.size.width * value, height: 2)
                .animation(.easeOut(duration: 0.2), value: value)
        }
        .frame(height: 2)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct ConnectionErrorView: View {
    let error: Error
    let retry: () -> Void

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()

            VStack(spacing: 24) {
                WheelMark()
                    .frame(width: 92, height: 92)

                VStack(spacing: 10) {
                    Text("Pas de connexion")
                        .font(.system(size: 26, weight: .heavy))
                        .foregroundStyle(Theme.ivory)

                    Text(message)
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.ivory.opacity(0.6))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 36)
                }

                Button(action: retry) {
                    Text("Réessayer")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Theme.background)
                        .padding(.vertical, 14)
                        .padding(.horizontal, 34)
                        .background(Theme.gold)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var message: String {
        let error = error as NSError
        switch error.code {
        case NSURLErrorNotConnectedToInternet:
            return "Ton iPhone n'est pas connecté à Internet. Vérifie le Wi-Fi ou les données mobiles."
        case NSURLErrorTimedOut:
            return "Le serveur met trop de temps à répondre."
        case NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost:
            return "Impossible de joindre \(AppConfig.baseURL.host() ?? "le serveur")."
        default:
            return error.localizedDescription
        }
    }
}

/// Petite roue dessinée en natif — évite de dépendre d'une image
/// pour l'écran affiché justement quand le réseau est coupé.
private struct WheelMark: View {
    private let colors: [Color] = [
        Theme.gold, Theme.pink, Theme.ivory, Theme.cyan,
        Theme.gold, Theme.pink, Theme.ivory, Theme.cyan,
    ]

    var body: some View {
        GeometryReader { geometry in
            let size = min(geometry.size.width, geometry.size.height)
            let center = CGPoint(x: size / 2, y: size / 2)

            ZStack {
                ForEach(colors.indices, id: \.self) { index in
                    let start = Angle.degrees(Double(index) / Double(colors.count) * 360 - 90)
                    let end = Angle.degrees(Double(index + 1) / Double(colors.count) * 360 - 90)

                    Path { path in
                        path.move(to: center)
                        path.addArc(
                            center: center,
                            radius: size / 2,
                            startAngle: start,
                            endAngle: end,
                            clockwise: false
                        )
                        path.closeSubpath()
                    }
                    .fill(colors[index])
                }

                Circle()
                    .fill(Theme.background)
                    .frame(width: size * 0.22, height: size * 0.22)
            }
            .frame(width: size, height: size)
        }
    }
}

#Preview {
    RootView()
}
