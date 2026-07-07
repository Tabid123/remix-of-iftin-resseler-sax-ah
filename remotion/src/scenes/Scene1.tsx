import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { theme } from "../theme";
import { display, body } from "../fonts";

export const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 20, stiffness: 140 } });
  const y = interpolate(s, [0, 1], [40, 0]);
  const badgeS = spring({ frame: frame - 4, fps, config: { damping: 15 } });
  const subY = interpolate(spring({ frame: frame - 12, fps, config: { damping: 22 } }), [0, 1], [30, 0]);
  return (
    <AbsoluteFill style={{ padding: "0 140px", justifyContent: "center", alignItems: "flex-start" }}>
      <div
        style={{
          transform: `scale(${badgeS})`,
          padding: "10px 20px",
          border: `1px solid ${theme.primary}66`,
          borderRadius: 999,
          color: theme.primary,
          fontFamily: body,
          fontSize: 24,
          letterSpacing: 2,
          marginBottom: 32,
          background: `${theme.primary}0F`,
        }}
      >
        TUTORIAL · IFTIN ADMIN
      </div>
      <div
        style={{
          transform: `translateY(${y}px)`,
          opacity: s,
          color: theme.ink,
          fontFamily: display,
          fontWeight: 700,
          fontSize: 148,
          lineHeight: 1.02,
          letterSpacing: -3,
        }}
      >
        Ku dar Shirkad
        <br />
        <span style={{ color: theme.primary }}>Cusub</span> — 3 tallaabo
      </div>
      <div
        style={{
          transform: `translateY(${subY}px)`,
          marginTop: 28,
          color: theme.mute,
          fontFamily: body,
          fontSize: 34,
        }}
      >
        Wizard + Self-Healing Learning
      </div>
    </AbsoluteFill>
  );
};