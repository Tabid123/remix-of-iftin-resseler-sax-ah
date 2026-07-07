import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { theme } from "../theme";
import { display, body } from "../fonts";

const Step: React.FC<{ n: string; label: string; delay: number; color: string }> = ({ n, label, delay, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18 } });
  return (
    <div style={{ opacity: s, transform: `translateX(${interpolate(s, [0, 1], [-30, 0])}px)`, display: "flex", alignItems: "center", gap: 24, marginBottom: 30 }}>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          background: `${color}22`,
          border: `1px solid ${color}66`,
          color,
          fontFamily: display,
          fontWeight: 700,
          fontSize: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {n}
      </div>
      <div style={{ color: theme.ink, fontFamily: display, fontSize: 42, fontWeight: 500 }}>{label}</div>
    </div>
  );
};

export const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleS = spring({ frame, fps, config: { damping: 20 } });
  const testS = spring({ frame: frame - 90, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ padding: "80px 140px", flexDirection: "column" }}>
      <div style={{ opacity: titleS, color: theme.mute, fontFamily: body, fontSize: 26, letterSpacing: 3, marginBottom: 12 }}>
        TALLAABO 3
      </div>
      <div
        style={{
          opacity: titleS,
          transform: `translateY(${interpolate(titleS, [0, 1], [30, 0])}px)`,
          color: theme.ink,
          fontFamily: display,
          fontWeight: 700,
          fontSize: 88,
          lineHeight: 1,
          marginBottom: 50,
        }}
      >
        Kaydi & <span style={{ color: theme.success }}>Test Live</span>
      </div>

      <Step n="A" label="Ku dar Steps kale (Receiver, PIN...)" delay={12} color={theme.primary} />
      <Step n="B" label="Riix Save Provider — atomic save" delay={30} color={theme.primary} />
      <Step n="C" label="Samee order yar test ah ($0.10)" delay={48} color={theme.accent} />

      <div
        style={{
          marginTop: 10,
          opacity: testS,
          transform: `scale(${interpolate(testS, [0, 1], [0.9, 1])})`,
          padding: "18px 26px",
          background: `${theme.success}18`,
          border: `1px solid ${theme.success}66`,
          borderRadius: 14,
          color: theme.success,
          fontFamily: display,
          fontSize: 34,
          fontWeight: 700,
          display: "inline-block",
          alignSelf: "flex-start",
        }}
      >
        ✓ USSD dhamaystirmay — 100% shaqeynaya
      </div>
    </AbsoluteFill>
  );
};