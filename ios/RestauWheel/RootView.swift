import SwiftUI

struct RootView: View {
    @StateObject private var model = WebViewModel()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var launchedAt = Date()
    @State private var spinning = false
    @State private var coverLifted = false
    @State private var coverGone = false
    @State private var exitScheduled = false

    var body: some View {
        ZStack(alignment: .top) {
            // Le webview va jusqu'aux bords. La page décale son contenu
            // avec les safe areas ; ce fond ne se voit qu'au chargement.
            Theme.background
                .ignoresSafeArea()

            WebView(model: model)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ignoresSafeArea()
                .opacity(model.loadError == nil ? 1 : 0)

            if coverGone, model.isLoading, model.progress < 1 {
                ProgressBar(value: model.progress)
            }

            // Le geste de retour de WKWebView existe, mais rien à l'écran ne
            // l'annonce : sur /client et /admin il n'y a aucun lien de retour.
            // D'où cette pastille, visible seulement quand il y a un historique.
            if coverGone, model.canGoBack, model.loadError == nil {
                BackButton { model.goBack() }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                    .padding(.leading, 16)
                    .padding(.bottom, 108)
                    .transition(.opacity.combined(with: .scale(scale: 0.8)))
            }

            if let error = model.loadError {
                ConnectionErrorView(error: error) { model.reload() }
                    .transition(.opacity)
            }

            if !coverGone {
                LaunchCover(spinning: spinning, lifted: coverLifted)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: model.loadError == nil)
        .animation(.spring(response: 0.3, dampingFraction: 0.75), value: model.canGoBack)
        .preferredColorScheme(.light)
        .task {
            await Task.yield()
            if !reduceMotion {
                withAnimation(.linear(duration: 1.05).repeatForever(autoreverses: false)) {
                    spinning = true
                }
            }
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(150))
                if Task.isCancelled || exitScheduled { return }
                model.probeContentReady()
                let timedOut = Date().timeIntervalSince(launchedAt) > 8
                if model.contentReady || model.loadError != nil || timedOut {
                    scheduleExit()
                    return
                }
            }
        }
    }

    private func scheduleExit() {
        exitScheduled = true
        let elapsed = Date().timeIntervalSince(launchedAt)
        let wait = reduceMotion ? 0.05 : max(0, 1.15 - elapsed)
        let slide = reduceMotion ? 0.2 : 0.78
        DispatchQueue.main.asyncAfter(deadline: .now() + wait) {
            withAnimation(.timingCurve(0.22, 1, 0.36, 1, duration: slide)) {
                coverLifted = true
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + wait + slide + 0.05) {
            coverGone = true
        }
    }
}

/// Roue plein écran au lancement. Elle tourne, puis tout l’écran remonte
/// et laisse voir le tableau de bord déjà chargé en dessous.
private struct LaunchCover: View {
    let spinning: Bool
    let lifted: Bool

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Theme.background
                ZStack {
                    WheelMark(
                        colors: [
                            Theme.gold, Theme.ink, Theme.pink,
                            Theme.cyan, Theme.ink, Color(hex: 0x00E5C8),
                        ],
                        rimmed: true
                    )
                    .frame(width: 228, height: 228)
                    .rotationEffect(.degrees(spinning ? 360 : 0))

                    Text("RW")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.ivory)
                        .frame(width: 54, height: 54)
                        .background(Circle().fill(Theme.ink))
                        .overlay(Circle().stroke(Theme.gold, lineWidth: 4))

                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(Theme.ink)
                        .frame(width: 22, height: 22)
                        .rotationEffect(.degrees(45))
                        .offset(y: -122)
                }
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
            .offset(y: lifted ? -geometry.size.height - 40 : 0)
        }
        .ignoresSafeArea()
    }
}

private struct BackButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "chevron.left")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(Theme.ink)
                .frame(width: 44, height: 44)
                .background(Color.white.opacity(0.92))
                .overlay(Circle().stroke(Color.black.opacity(0.08), lineWidth: 1))
                .clipShape(Circle())
                .shadow(color: .black.opacity(0.12), radius: 10, y: 3)
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
                        .foregroundStyle(Theme.ink)

                    Text(message)
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.ink.opacity(0.55))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 36)
                }

                Button(action: retry) {
                    Text("Réessayer")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Theme.ink)
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
    var colors: [Color] = [
        Theme.gold, Theme.pink, Theme.ivory, Theme.cyan,
        Theme.gold, Theme.pink, Theme.ivory, Theme.cyan,
    ]
    var rimmed = false

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

                if rimmed {
                    Circle()
                        .stroke(Theme.gold, lineWidth: 12)
                        .frame(width: size, height: size)
                } else {
                    Circle()
                        .fill(Theme.ink)
                        .frame(width: size * 0.22, height: size * 0.22)
                }
            }
            .frame(width: size, height: size)
        }
    }
}

#Preview {
    RootView()
}
