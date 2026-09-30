/**
 * Restau Wheel — 30s motion-design SaaS explainer (Higgsedit / Fable)
 * Brand: black #0A0A0A, pink #FF2D6A, yellow #F5C518, cyan #2EE6D6, white
 */
export default async ({ project }) => {
  const W = 1920;
  const H = 1080;
  // Project dir is relative to /home/user/work (Fable cwd) — do NOT prefix with work/
  const p = await project({
    dir: "restau-wheel-md",
    size: `${W}x${H}`,
    fps: 30,
    background: "#0A0A0A",
  });

  // Paths relative to project dir (restau-wheel-md)
  const landing = await p.add("assets/landing.png");
  const client = await p.add("assets/client.png");
  const phone = await p.add("assets/phone.jpg");
  const voice = await p.add("assets/voice.mp3");

  // Voice bed (~24.8s); visual timeline continues to 30s for CTA hold
  p.cut(voice, { from: 0, dur: 24.78, at: 0, fit: "none" });

  const pink = "#FF2D6A";
  const yellow = "#F5C518";
  const cyan = "#2EE6D6";
  const white = "#FFFFFF";
  const muted = "rgba(255,255,255,0.62)";

  // ========== SCENE 1 — Hook (0–5.5s) ==========
  p.compose(
    <frame width={W} height={H} layout="none" background="#0A0A0A">
      <rect
        width={W}
        height={H}
        fill={{
          kind: "radial",
          stops: [
            { offset: 0, color: "#1a0a14" },
            { offset: 0.55, color: "#0A0A0A" },
            { offset: 1, color: "#050508" },
          ],
        }}
      />
      <rect
        x={-120}
        y={180}
        width={520}
        height={520}
        radius={260}
        fill="rgba(255,45,106,0.14)"
        animate={[
          { property: "opacity", from: 0, to: 1, duration: 0.8 },
          { property: "scale", from: 0.7, to: 1.15, duration: 5, easing: "linear" },
        ]}
      />
      <rect
        x={1480}
        y={420}
        width={420}
        height={420}
        radius={210}
        fill="rgba(245,197,24,0.12)"
        animate={[
          { property: "opacity", from: 0, to: 1, at: 0.2, duration: 0.8 },
          { property: "scale", from: 0.8, to: 1.2, duration: 5, easing: "linear" },
        ]}
      />
      <text
        x={120}
        y={340}
        width={1680}
        height={90}
        fontFamily="Bebas Neue"
        fontSize={88}
        letterSpacing={8}
        color={white}
        align="center"
        animate={[{ property: "opacity", keyframes: [{ at: 0, value: 0 }, { at: 0.4, value: 1 }, { at: 4.8, value: 1 }, { at: 5.4, value: 0 }] }, { property: "offsetY", from: 28, to: 0, duration: 0.55, easing: "house" }]}
      >
        RESTAU WHEEL
      </text>
      <text
        x={180}
        y={450}
        width={1560}
        height={70}
        fontFamily="DM Sans"
        fontWeight={700}
        fontSize={48}
        color={yellow}
        align="center"
        animate={[{ property: "opacity", keyframes: [{ at: 0, value: 0 }, { at: 0.7, value: 1 }, { at: 4.8, value: 1 }, { at: 5.4, value: 0 }] }, { property: "offsetY", from: 20, to: 0, at: 0.25, duration: 0.5, easing: "house" }]}
      >
        Une roue de fortune sur chaque table
      </text>
      <text
        x={260}
        y={540}
        width={1400}
        height={50}
        fontFamily="DM Sans"
        fontSize={28}
        color={muted}
        align="center"
        animate={[{ property: "opacity", keyframes: [{ at: 0, value: 0 }, { at: 1.1, value: 1 }, { at: 4.8, value: 1 }, { at: 5.4, value: 0 }] }]}
      >
        Le SaaS de fidélisation pour restaurants
      </text>
    </frame>,
    { at: 0, dur: 5.5, name: "hook" },
  );

  // ========== SCENE 2 — Comment ça marche (5.5–14s) ==========
  p.compose(
    <frame width={W} height={H} layout="none" background="#0A0A0A">
      <text
        x={100}
        y={70}
        width={900}
        height={60}
        fontFamily="Bebas Neue"
        fontSize={56}
        letterSpacing={4}
        color={pink}
        animate={[{ property: "opacity", from: 0, to: 1, duration: 0.4 }, { property: "offsetX", from: -40, to: 0, duration: 0.5, easing: "house" }]}
      >
        COMMENT ÇA MARCHE
      </text>

      {/* Step cards */}
      <frame
        x={80}
        y={180}
        width={560}
        height={720}
        layout="column"
        gap={18}
        padding={28}
        background="rgba(255,255,255,0.04)"
        radius={24}
        animate={[{ property: "opacity", from: 0, to: 1, duration: 0.45 }, { property: "offsetY", from: 30, to: 0, duration: 0.5, easing: "house" }]}
      >
        <text width={500} height={40} fontFamily="DM Sans" fontWeight={700} fontSize={26} color={yellow}>
          1 · Scan QR
        </text>
        <text width={500} height={70} fontFamily="DM Sans" fontSize={24} color={muted} lineHeight={1.35}>
          Le client scanne le QR sur la table
        </text>
        <text width={500} height={40} fontFamily="DM Sans" fontWeight={700} fontSize={26} color={yellow} at={1.2} duration={6}>
          2 · Ticket
        </text>
        <text width={500} height={70} fontFamily="DM Sans" fontSize={24} color={muted} lineHeight={1.35} at={1.2} duration={6}>
          Il remplit son ticket d'entrée
        </text>
        <text width={500} height={40} fontFamily="DM Sans" fontWeight={700} fontSize={26} color={yellow} at={2.4} duration={5}>
          3 · TOURNER
        </text>
        <text width={500} height={70} fontFamily="DM Sans" fontSize={24} color={muted} lineHeight={1.35} at={2.4} duration={5}>
          Il fait tourner la roue et gagne un lot
        </text>
      </frame>

      <frame
        x={720}
        y={160}
        width={1080}
        height={760}
        layout="none"
        radius={28}
        clip
        background="#111"
        animate={[{ property: "opacity", from: 0, to: 1, at: 0.15, duration: 0.5 }, { property: "offsetX", from: 60, to: 0, at: 0.15, duration: 0.55, easing: "house" }]}
      >
        <media file={landing} width={1080} height={760} fit="cover" />
      </frame>
    </frame>,
    { at: 5.5, dur: 8.5, name: "howto" },
  );

  // ========== SCENE 3 — Produit UI (14–21s) ==========
  p.compose(
    <frame width={W} height={H} layout="none" background="#0A0A0A">
      <text
        x={100}
        y={60}
        width={1720}
        height={50}
        fontFamily="Bebas Neue"
        fontSize={52}
        letterSpacing={3}
        color={cyan}
        align="center"
        animate={[{ property: "opacity", from: 0, to: 1, duration: 0.4 }]}
      >
        VOS CLIENTS REVIENNENT
      </text>

      <frame
        x={80}
        y={160}
        width={860}
        height={780}
        layout="none"
        radius={28}
        clip
        background="#111"
        animate={[{ property: "opacity", from: 0, to: 1, duration: 0.45 }, { property: "offsetY", from: 24, to: 0, duration: 0.5, easing: "house" }]}
      >
        <media file={client} width={860} height={780} fit="cover" />
      </frame>

      <frame
        x={1000}
        y={160}
        width={840}
        height={780}
        layout="none"
        radius={28}
        clip
        background="#111"
        animate={[{ property: "opacity", from: 0, to: 1, at: 0.2, duration: 0.45 }, { property: "offsetY", from: 24, to: 0, at: 0.2, duration: 0.5, easing: "house" }]}
      >
        <media file={phone} width={840} height={780} fit="contain" />
      </frame>

      <text
        x={100}
        y={980}
        width={1720}
        height={40}
        fontFamily="DM Sans"
        fontSize={26}
        color={muted}
        align="center"
        animate={[{ property: "opacity", keyframes: [{ at: 0, value: 0 }, { at: 0.6, value: 1 }] }]}
      >
        Dessert · Boisson · Réduction — vous gardez la main
      </text>
    </frame>,
    { at: 14, dur: 7, name: "product" },
  );

  // ========== SCENE 4 — Contrôle + prix (21–26s) ==========
  p.compose(
    <frame width={W} height={H} layout="none" background="#0A0A0A">
      <rect
        width={W}
        height={H}
        fill={{
          kind: "radial",
          stops: [
            { offset: 0, color: "#141008" },
            { offset: 1, color: "#0A0A0A" },
          ],
        }}
      />
      <text
        x={120}
        y={280}
        width={1680}
        height={70}
        fontFamily="Bebas Neue"
        fontSize={64}
        letterSpacing={4}
        color={white}
        align="center"
        animate={[{ property: "opacity", from: 0, to: 1, duration: 0.4 }, { property: "offsetY", from: 20, to: 0, duration: 0.45, easing: "house" }]}
      >
        VOUS CONTRÔLEZ TOUT
      </text>
      <text
        x={200}
        y={380}
        width={1520}
        height={50}
        fontFamily="DM Sans"
        fontSize={30}
        color={muted}
        align="center"
        animate={[{ property: "opacity", from: 0, to: 1, at: 0.25, duration: 0.4 }]}
      >
        Lots · probabilités · QR unique par restaurant
      </text>

      <frame
        x={660}
        y={500}
        width={600}
        height={160}
        layout="column"
        align="center"
        justify="center"
        gap={8}
        background={yellow}
        radius={28}
        animate={[
          { property: "opacity", from: 0, to: 1, at: 0.4, duration: 0.35 },
          { property: "scale", from: 0.9, to: 1, at: 0.4, duration: 0.4, easing: "house" },
        ]}
      >
        <text width={560} height={70} fontFamily="Bebas Neue" fontSize={64} color="#0A0A0A" align="center">
          20 € / mois
        </text>
        <text width={560} height={36} fontFamily="DM Sans" fontWeight={700} fontSize={22} color="#0A0A0A" align="center">
          Simple. Sans engagement caché.
        </text>
      </frame>
    </frame>,
    { at: 21, dur: 5, name: "pricing" },
  );

  // ========== SCENE 5 — CTA (26–30s) ==========
  p.compose(
    <frame width={W} height={H} layout="none" background="#0A0A0A">
      <rect
        x={700}
        y={200}
        width={520}
        height={520}
        radius={260}
        fill="rgba(255,45,106,0.18)"
        animate={[{ property: "scale", from: 0.85, to: 1.1, duration: 4, easing: "linear" }]}
      />
      <text
        x={120}
        y={340}
        width={1680}
        height={80}
        fontFamily="Bebas Neue"
        fontSize={72}
        letterSpacing={6}
        color={white}
        align="center"
        animate={[{ property: "opacity", from: 0, to: 1, duration: 0.4 }, { property: "offsetY", from: 24, to: 0, duration: 0.45, easing: "house" }]}
      >
        RESTAU WHEEL
      </text>
      <frame
        x={610}
        y={460}
        width={700}
        height={90}
        layout="column"
        align="center"
        justify="center"
        background={pink}
        radius={45}
        animate={[
          { property: "opacity", from: 0, to: 1, at: 0.3, duration: 0.35 },
          { property: "scale", from: 0.92, to: 1, at: 0.3, duration: 0.4, easing: "house" },
        ]}
      >
        <text width={660} height={50} fontFamily="DM Sans" fontWeight={700} fontSize={32} color={white} align="center">
          Créer mon restaurant →
        </text>
      </frame>
      <text
        x={120}
        y={590}
        width={1680}
        height={40}
        fontFamily="DM Sans"
        fontSize={28}
        color={yellow}
        align="center"
        animate={[{ property: "opacity", from: 0, to: 1, at: 0.55, duration: 0.4 }]}
      >
        restauwheel.com
      </text>
    </frame>,
    { at: 26, dur: 4, name: "cta" },
  );

  await p.render("renders/restau-wheel-motion-30s.mp4", {
    draft: false,
    depth: 8,
    bitrate: 10_000_000,
  });
};
