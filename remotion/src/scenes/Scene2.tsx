import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { theme } from "../theme";
import { display, body } from "../fonts";

const SidebarItem: React.FC<{ label: string; active?: boolean; delay: number }> = ({ label, active, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 22 } });
  const x = interpolate(s, [0, 1], [-40, 0]);
  return (
    <div
      style={{
        transform: `translateX(${x}px)`,
        opacity: s,
        padding: "14px 18px",
        marginBottom: 8,
        borderRadius: 12,
        background: active ? `${theme.primary}1F` : "transparent",
        border: active ? `1px solid ${theme.primary}66` : "1px solid transparent",
        color: active ? theme.primary : theme.mute,
        fontFamily: body,
        fontSize: 22,
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </div>
  );
};

export const Scene2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleS = spring({ frame, fps, config: { damping: 20 } });
  const cardS = spring({ frame: frame - 8, fps, config: { damping: 24 } });
  return (
    <AbsoluteFill style={{ padding: "80px 140px", flexDirection: "column" }}>
      <div
        style={{
          opacity: titleS,
          transform: `translateY(${interpolate(titleS, [0, 1], [20, 0])}px)`,
          color: theme.mute,
          fontFamily: body,
          fontSize: 26,
          letterSpacing: 3,
          marginBottom: 12,
        }}
      >
        TALLAABO 1
      </div>
      <div
        style={{
          opacity: titleS,
          transform: `translateY(${interpolate(titleS, [0, 1], [30, 0])}px)`,
          color: theme.ink,
          fontFamily: display,
          fontWeight: 700,
          fontSize: 96,
          lineHeight: 1,
          marginBottom: 50,
        }}
      >
        Fur <span style={{ color: theme.primary }}>Admin</span> → USSD Flows
      </div>

      <div
        style={{
          transform: `scale(${interpolate(cardS, [0, 1], [0.96, 1])})`,
          opacity: cardS,
          background: `${theme.bgSoft}CC`,
          border: `1px solid ${theme.mute}33`,
          borderRadius: 20,
          padding: 28,
          width: 520,
          boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ color: theme.mute, fontFamily: body, fontSize: 18, marginBottom: 16, letterSpacing: 2 }}>
          SIDEBAR
        </div>
        <SidebarItem label="📊 Dashboard" delay={20} />
        <SidebarItem label="📦 Orders" delay={26} />
        <SidebarItem label="⚡ USSD Flows" active delay={34} />
        <SidebarItem label="🧠 USSD Learning" delay={42} />
        <SidebarItem label="👥 Users" delay={50} />
      </div>

      {frame >= 70 && <ClickRipple startFrame={70} />}
    </AbsoluteFill>
  );
};

const ClickRipple: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame() - startFrame;
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 12 } });
  const scale = interpolate(s, [0, 1], [0.3, 2.2]);
  const opacity = interpolate(s, [0, 1], [0.7, 0]);
  return (
    <div
      style={{
        position: "absolute",
        left: 350,
        top: 470,
        width: 40,
        height: 40,
        borderRadius: 999,
        border: `2px solid ${theme.primary}`,
        transform: `scale(${scale})`,
        opacity,
      }}
    />
  );
};