import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence } from "remotion";
import { theme } from "../theme";
import { display, body } from "../fonts";

const Field: React.FC<{ label: string; value: string; delay: number }> = ({ label, value, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 22 } });
  return (
    <div style={{ opacity: s, transform: `translateY(${interpolate(s, [0, 1], [16, 0])}px)`, marginBottom: 18 }}>
      <div style={{ color: theme.mute, fontFamily: body, fontSize: 16, letterSpacing: 2, marginBottom: 6 }}>{label}</div>
      <div
        style={{
          background: theme.bg,
          border: `1px solid ${theme.mute}33`,
          borderRadius: 10,
          padding: "14px 18px",
          color: theme.ink,
          fontFamily: body,
          fontSize: 24,
        }}
      >
        {value}
      </div>
    </div>
  );
};

const Chip: React.FC<{ text: string; delay: number }> = ({ text, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 14 } });
  return (
    <div
      style={{
        transform: `scale(${s})`,
        opacity: s,
        padding: "8px 14px",
        borderRadius: 999,
        background: `${theme.success}22`,
        border: `1px solid ${theme.success}66`,
        color: theme.success,
        fontFamily: body,
        fontSize: 18,
        fontWeight: 600,
      }}
    >
      {text}
    </div>
  );
};

export const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleS = spring({ frame, fps, config: { damping: 20 } });
  const cardS = spring({ frame: frame - 8, fps, config: { damping: 24 } });
  const wandS = spring({ frame: frame - 70, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill style={{ padding: "80px 140px", flexDirection: "column" }}>
      <div style={{ opacity: titleS, color: theme.mute, fontFamily: body, fontSize: 26, letterSpacing: 3, marginBottom: 12 }}>
        TALLAABO 2
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
          marginBottom: 40,
        }}
      >
        Wizard <span style={{ color: theme.accent }}>🪄</span> — Buuxi Info
      </div>

      <div style={{ display: "flex", gap: 40 }}>
        <div
          style={{
            flex: 1,
            opacity: cardS,
            transform: `translateY(${interpolate(cardS, [0, 1], [20, 0])}px)`,
            background: `${theme.bgSoft}E0`,
            border: `1px solid ${theme.mute}33`,
            borderRadius: 20,
            padding: 32,
            boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
          }}
        >
          <Field label="PROVIDER NAME" value="Somtel" delay={12} />
          <Field label="USSD CODE" value="*300#" delay={20} />
          <Field label="DIALOG TEXT" value="Please enter amount to send" delay={30} />
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 20 }}>
          <div
            style={{
              opacity: wandS,
              transform: `scale(${interpolate(wandS, [0, 1], [0.9, 1])})`,
              padding: "20px 28px",
              background: `${theme.accent}18`,
              border: `1px solid ${theme.accent}66`,
              borderRadius: 16,
              color: theme.accent,
              fontFamily: display,
              fontSize: 32,
              fontWeight: 700,
            }}
          >
            🪄 Auto-Detect Keywords
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Chip text="amount" delay={90} />
            <Chip text="lacag" delay={96} />
            <Chip text="qiimo" delay={102} />
            <Chip text="enter" delay={108} />
            <Chip text="mount" delay={114} />
            <Chip text="wadarta" delay={120} />
            <Chip text="value" delay={126} />
            <Chip text="sum" delay={132} />
          </div>
          <Sequence from={140}>
            <div style={{ color: theme.success, fontFamily: body, fontSize: 22, fontWeight: 600 }}>
              ✓ ~85% match si otomaatig ah
            </div>
          </Sequence>
        </div>
      </div>
    </AbsoluteFill>
  );
};