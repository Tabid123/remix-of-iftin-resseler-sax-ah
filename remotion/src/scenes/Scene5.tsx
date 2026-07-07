import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { theme } from "../theme";
import { display, body } from "../fonts";

const Row: React.FC<{ dialog: string; delay: number; resolved?: boolean }> = ({ dialog, delay, resolved }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 22 } });
  const flip = spring({ frame: frame - delay - 30, fps, config: { damping: 18 } });
  const bg = resolved
    ? `${theme.success}${Math.round(flip * 30).toString(16).padStart(2, "0")}`
    : theme.bg;
  return (
    <div
      style={{
        opacity: s,
        transform: `translateX(${interpolate(s, [0, 1], [30, 0])}px)`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "16px 20px",
        marginBottom: 10,
        borderRadius: 12,
        background: bg,
        border: `1px solid ${resolved ? `${theme.success}66` : `${theme.mute}33`}`,
        color: theme.ink,
        fontFamily: body,
        fontSize: 22,
      }}
    >
      <span>{dialog}</span>
      <span style={{ color: resolved ? theme.success : theme.accent, fontWeight: 600, fontSize: 18 }}>
        {resolved ? "✓ LEARNED" : "TEACH →"}
      </span>
    </div>
  );
};

export const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleS = spring({ frame, fps, config: { damping: 20 } });
  const outroS = spring({ frame: frame - 110, fps, config: { damping: 20 } });
  return (
    <AbsoluteFill style={{ padding: "80px 140px", flexDirection: "column" }}>
      <div style={{ opacity: titleS, color: theme.mute, fontFamily: body, fontSize: 26, letterSpacing: 3, marginBottom: 12 }}>
        🧠 SELF-HEALING
      </div>
      <div
        style={{
          opacity: titleS,
          transform: `translateY(${interpolate(titleS, [0, 1], [30, 0])}px)`,
          color: theme.ink,
          fontFamily: display,
          fontWeight: 700,
          fontSize: 84,
          lineHeight: 1,
          marginBottom: 40,
        }}
      >
        USSD Learning tab
      </div>

      <div
        style={{
          background: `${theme.bgSoft}E0`,
          border: `1px solid ${theme.mute}33`,
          borderRadius: 20,
          padding: 28,
          boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ color: theme.mute, fontFamily: body, fontSize: 18, letterSpacing: 2, marginBottom: 16 }}>
          UNMATCHED DIALOGS
        </div>
        <Row dialog="Fadlan geli lambarka" delay={14} resolved />
        <Row dialog="Xaqiiji lacagta" delay={26} resolved />
        <Row dialog="Geli PIN-kaaga" delay={38} />
      </div>

      {frame >= 110 && (
        <div
          style={{
            marginTop: 30,
            opacity: outroS,
            transform: `translateY(${interpolate(outroS, [0, 1], [20, 0])}px)`,
            color: theme.primary,
            fontFamily: display,
            fontSize: 46,
            fontWeight: 700,
          }}
        >
          Hal riix → Wax bar → 100% otomaatig
        </div>
      )}
    </AbsoluteFill>
  );
};