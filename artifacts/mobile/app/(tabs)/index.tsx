import * as Haptics from "expo-haptics";
import React, { useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SW, height: SH } = Dimensions.get("window");
const IS_WEB = Platform.OS === "web";

// ─── Layout ──────────────────────────────────────────────────────────────────
const TOP_OFF = IS_WEB ? 80 : 0;
const GOAL_W = Math.min(SW * 0.76, 310);
const GOAL_H = GOAL_W * 0.56;
const GOAL_LEFT = (SW - GOAL_W) / 2;
const GOAL_RIGHT = GOAL_LEFT + GOAL_W;
const GOAL_TOP = TOP_OFF + SH * 0.09;
const GOAL_BOT = GOAL_TOP + GOAL_H;
const POST_W = 10;
const ZONE_W = GOAL_W / 3;

const KW = 50;
const KH = 82;
const K_INIT_X = SW / 2 - KW / 2;
const K_Y = GOAL_BOT - KH;

const SPOT_X = SW / 2;
const SPOT_Y = TOP_OFF + SH * 0.62;
const BR = 20;
const BD = BR * 2;
const TOTAL = 5;
const THUMB_R = 13;

// ─── Types ───────────────────────────────────────────────────────────────────
type Phase =
  | "menu"
  | "player_kick"
  | "kick_anim"
  | "cpu_preparing"
  | "cpu_flying"
  | "gameover";

type KR = "goal" | "saved";

interface GD {
  round: number;
  ps: number;
  cs: number;
  pk: KR[];
  ck: KR[];
}

const INIT: GD = { round: 1, ps: 0, cs: 0, pk: [], ck: [] };

// ─── Kick target from sliders ─────────────────────────────────────────────────
function sliderTarget(direction: number, height: number) {
  const tX = GOAL_LEFT + POST_W + direction * (GOAL_W - POST_W * 2);
  const tY = GOAL_BOT - POST_W - height * (GOAL_H - POST_W * 2);
  return { x: tX, y: tY };
}

function kZoneX(z: 0 | 1 | 2): number {
  return GOAL_LEFT + z * ZONE_W + ZONE_W / 2 - KW / 2;
}

function zone(x: number): 0 | 1 | 2 {
  if (x < GOAL_LEFT + ZONE_W) return 0;
  if (x < GOAL_LEFT + ZONE_W * 2) return 1;
  return 2;
}

function isSaved(tX: number, tY: number, kz: 0 | 1 | 2, power: number): boolean {
  if (zone(tX) !== kz) return false;
  const powerBonus = power * 0.55; // high power reduces save chance
  const baseSave = tY < GOAL_TOP + GOAL_H * 0.42 ? 0.55 : 0.88;
  return Math.random() < baseSave - powerBonus;
}

// ─── Slider component ─────────────────────────────────────────────────────────
function SliderBar({
  value,
  onValueChange,
  label,
  color,
  center = false,
  disabled = false,
}: {
  value: number;
  onValueChange: (v: number) => void;
  label: string;
  color: string;
  center?: boolean;
  disabled?: boolean;
}) {
  const trackRef = useRef<View>(null);
  const trackPageX = useRef(0);
  const trackWidth = useRef(SW - 64);

  const measure = () => {
    trackRef.current?.measure((_x, _y, w, _h, px) => {
      trackPageX.current = px;
      trackWidth.current = Math.max(1, w);
    });
  };

  const clamp = (px: number) =>
    Math.max(0, Math.min(1, (px - trackPageX.current) / trackWidth.current));

  const panR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderGrant: (e) => {
        measure();
        onValueChange(clamp(e.nativeEvent.pageX));
      },
      onPanResponderMove: (e) => {
        onValueChange(clamp(e.nativeEvent.pageX));
      },
    })
  ).current;

  const pct = value * 100;
  const fillLeft = center ? (value < 0.5 ? `${pct}%` : "50%") : "0%";
  const fillW = center
    ? `${Math.abs(value - 0.5) * 100}%`
    : `${pct}%`;

  let displayVal: string;
  if (center) {
    if (value > 0.52) displayVal = `▶ ${Math.round((value - 0.5) * 200)}`;
    else if (value < 0.48) displayVal = `◀ ${Math.round((0.5 - value) * 200)}`;
    else displayVal = "CENTRO";
  } else {
    displayVal = `${Math.round(pct)}%`;
  }

  return (
    <View style={sl.wrap}>
      <View style={sl.header}>
        <Text style={[sl.label, disabled && sl.dimText]}>{label}</Text>
        <Text style={[sl.val, { color: disabled ? "#3a5570" : color }]}>
          {displayVal}
        </Text>
      </View>
      <View
        ref={trackRef}
        style={[sl.track, disabled && sl.trackDim]}
        onLayout={measure}
        hitSlop={{ top: 18, bottom: 18 }}
        {...(!disabled ? panR.panHandlers : {})}
      >
        {center && <View style={sl.centerMark} />}
        {/* Fill */}
        <View
          style={[
            sl.fill,
            {
              left: fillLeft as `${number}%`,
              width: fillW as `${number}%`,
              backgroundColor: disabled ? "#2a4060" : color,
            },
          ]}
        />
        {/* Thumb */}
        <View
          style={[
            sl.thumb,
            {
              left: `${pct}%` as `${number}%`,
              transform: [{ translateX: -THUMB_R }],
              backgroundColor: disabled ? "#2a4060" : color,
              borderColor: disabled ? "#1e3050" : "#fff",
            },
          ]}
        />
      </View>
    </View>
  );
}

// ─── Static field SVG ─────────────────────────────────────────────────────────
const Field = React.memo(function Field() {
  const nH = [0.22, 0.44, 0.66, 0.88];
  const nVC = 8;
  const nVS = (GOAL_W - POST_W * 2) / nVC;
  return (
    <Svg width={SW} height={SH} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#020c1a" />
          <Stop offset="0.55" stopColor="#0a1c34" />
          <Stop offset="1" stopColor="#0d2240" />
        </LinearGradient>
        <LinearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1a5c28" />
          <Stop offset="0.6" stopColor="#144e20" />
          <Stop offset="1" stopColor="#0d3618" />
        </LinearGradient>
        <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#fffde7" stopOpacity={0.92} />
          <Stop offset="0.35" stopColor="#fffde7" stopOpacity={0.45} />
          <Stop offset="1" stopColor="#fffde7" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={SW} height={GOAL_BOT + 8} fill="url(#sky)" />
      <Rect x={0} y={GOAL_BOT} width={SW} height={SH - GOAL_BOT} fill="url(#grass)" />
      {[0, 2, 4].map((i) => (
        <Rect
          key={i}
          x={0} y={GOAL_BOT + (i * (SH - GOAL_BOT)) / 6}
          width={SW} height={(SH - GOAL_BOT) / 12}
          fill="#1e6b32" opacity={0.4}
        />
      ))}
      <Circle cx={22} cy={GOAL_TOP - 20} r={40} fill="url(#glow)" />
      <Circle cx={22} cy={GOAL_TOP - 20} r={7} fill="#ffffee" />
      <Circle cx={SW - 22} cy={GOAL_TOP - 20} r={40} fill="url(#glow)" />
      <Circle cx={SW - 22} cy={GOAL_TOP - 20} r={7} fill="#ffffee" />
      {nH.map((f) => (
        <Line key={`nh${f}`}
          x1={GOAL_LEFT + POST_W} y1={GOAL_TOP + POST_W + f * (GOAL_H - POST_W)}
          x2={GOAL_RIGHT - POST_W} y2={GOAL_TOP + POST_W + f * (GOAL_H - POST_W)}
          stroke="rgba(200,200,200,0.22)" strokeWidth={1}
        />
      ))}
      {Array.from({ length: nVC + 1 }).map((_, i) => (
        <Line key={`nv${i}`}
          x1={GOAL_LEFT + POST_W + i * nVS} y1={GOAL_TOP + POST_W}
          x2={GOAL_LEFT + POST_W + i * nVS} y2={GOAL_BOT}
          stroke="rgba(200,200,200,0.18)" strokeWidth={1}
        />
      ))}
      <Rect x={GOAL_LEFT} y={GOAL_TOP} width={POST_W} height={GOAL_H} fill="#f0f0f0" rx={4} />
      <Rect x={GOAL_RIGHT - POST_W} y={GOAL_TOP} width={POST_W} height={GOAL_H} fill="#f0f0f0" rx={4} />
      <Rect x={GOAL_LEFT} y={GOAL_TOP} width={GOAL_W} height={POST_W} fill="#f0f0f0" rx={4} />
      <Rect x={GOAL_LEFT} y={GOAL_BOT} width={GOAL_W} height={5} fill="rgba(0,0,0,0.35)" />
      <Line x1={GOAL_LEFT - 35} y1={GOAL_BOT} x2={GOAL_RIGHT + 35} y2={GOAL_BOT}
        stroke="rgba(255,255,255,0.45)" strokeWidth={2} />
      <Line x1={GOAL_LEFT - 55} y1={GOAL_BOT} x2={GOAL_LEFT - 55} y2={GOAL_BOT + 135}
        stroke="rgba(255,255,255,0.28)" strokeWidth={2} />
      <Line x1={GOAL_RIGHT + 55} y1={GOAL_BOT} x2={GOAL_RIGHT + 55} y2={GOAL_BOT + 135}
        stroke="rgba(255,255,255,0.28)" strokeWidth={2} />
      <Line x1={GOAL_LEFT - 55} y1={GOAL_BOT + 135} x2={GOAL_RIGHT + 55} y2={GOAL_BOT + 135}
        stroke="rgba(255,255,255,0.28)" strokeWidth={2} />
      <Circle cx={SPOT_X} cy={SPOT_Y} r={4.5} fill="rgba(255,255,255,0.55)" />
      <Path
        d={`M ${SPOT_X - 70} ${SPOT_Y - 38} Q ${SPOT_X} ${SPOT_Y - 105} ${SPOT_X + 70} ${SPOT_Y - 38}`}
        stroke="rgba(255,255,255,0.22)" strokeWidth={2} fill="none"
      />
    </Svg>
  );
});

// ─── Keeper ───────────────────────────────────────────────────────────────────
function Keeper({ color }: { color: string }) {
  return (
    <Svg width={KW} height={KH}>
      <Circle cx={KW / 2} cy={16} r={14} fill="#E67E22" />
      <Rect x={6} y={28} width={KW - 12} height={KH - 36} fill={color} rx={6} />
      <Rect x={0} y={34} width={13} height={7} fill={color} rx={4} />
      <Rect x={KW - 13} y={34} width={13} height={7} fill={color} rx={4} />
    </Svg>
  );
}

// ─── Ball ─────────────────────────────────────────────────────────────────────
function Ball() {
  return (
    <Svg width={BD} height={BD}>
      <Circle cx={BR} cy={BR} r={BR - 1} fill="#f5f5f5" stroke="#d0d0d0" strokeWidth={1.5} />
      <Path d={`M${BR},${BR - 9} L${BR + 8},${BR - 3} L${BR + 8},${BR + 4} L${BR},${BR + 9} L${BR - 8},${BR + 4} L${BR - 8},${BR - 3} Z`} fill="#111" />
      <Path d={`M${BR - 10},${BR - 11} L${BR - 4},${BR - 16} L${BR + 2},${BR - 14} L${BR + 2},${BR - 8} L${BR - 4},${BR - 5} L${BR - 10},${BR - 7} Z`} fill="#111" />
      <Path d={`M${BR + 10},${BR - 11} L${BR + 4},${BR - 16} L${BR - 2},${BR - 14} L${BR - 2},${BR - 8} L${BR + 4},${BR - 5} L${BR + 10},${BR - 7} Z`} fill="#111" />
    </Svg>
  );
}

// ─── Main game ────────────────────────────────────────────────────────────────
export default function PenaltyGame() {
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (IS_WEB ? 67 : 0);
  const botPad = insets.bottom || (IS_WEB ? 34 : 0);

  const [phase, setPhaseState] = useState<Phase>("menu");
  const phaseRef = useRef<Phase>("menu");
  function setPhase(p: Phase) {
    phaseRef.current = p;
    setPhaseState(p);
  }

  const [gd, setGd] = useState<GD>(INIT);
  const gdRef = useRef<GD>(INIT);
  function upGd(d: GD) {
    gdRef.current = d;
    setGd(d);
  }

  const [msg, setMsg] = useState("");
  const [showMsg, setShowMsg] = useState(false);
  const [goodMsg, setGoodMsg] = useState(false);
  const [dive, setDive] = useState<"left" | "right" | null>(null);
  const diveRef = useRef<"left" | "right" | null>(null);

  // Slider state
  const [power, setPower] = useState(0.5);
  const [height, setHeight] = useState(0.5);
  const [direction, setDirection] = useState(0.5);

  // Animated values
  const bAX = useRef(new Animated.Value(SPOT_X - BR)).current;
  const bAY = useRef(new Animated.Value(SPOT_Y - BR)).current;
  const bAS = useRef(new Animated.Value(1)).current;
  const bAR = useRef(new Animated.Value(0)).current;
  const kAX = useRef(new Animated.Value(K_INIT_X)).current;
  const cbAX = useRef(new Animated.Value(SPOT_X - BR)).current;
  const cbAY = useRef(new Animated.Value(GOAL_BOT - BR)).current;
  const cbAS = useRef(new Animated.Value(0.22)).current;
  const pkAX = useRef(new Animated.Value(K_INIT_X)).current;
  const msgOp = useRef(new Animated.Value(0)).current;

  function reset() {
    bAX.setValue(SPOT_X - BR);
    bAY.setValue(SPOT_Y - BR);
    bAS.setValue(1);
    bAR.setValue(0);
    kAX.setValue(K_INIT_X);
    cbAX.setValue(SPOT_X - BR);
    cbAY.setValue(GOAL_BOT - BR);
    cbAS.setValue(0.22);
    pkAX.setValue(K_INIT_X);
    msgOp.setValue(0);
  }

  function flashMsg(m: string, good: boolean) {
    setMsg(m);
    setGoodMsg(good);
    setShowMsg(true);
    Animated.sequence([
      Animated.timing(msgOp, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(1100),
      Animated.timing(msgOp, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setShowMsg(false));
  }

  // ── Kick ──────────────────────────────────────────────────────
  function doKick() {
    if (phaseRef.current !== "player_kick") return;
    setPhase("kick_anim");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const { x: tX, y: tY } = sliderTarget(direction, height);
    const kz = (Math.floor(Math.random() * 3)) as 0 | 1 | 2;
    const kX = kZoneX(kz);
    const saved = isSaved(tX, tY, kz, power);
    const isGoal = !saved;
    const res: KR = isGoal ? "goal" : "saved";
    const dur = Math.round(700 - power * 300); // fast shot = shorter anim

    Animated.spring(kAX, {
      toValue: kX,
      useNativeDriver: true,
      speed: 14 + power * 10,
      bounciness: 2,
    }).start();

    const destX = isGoal ? tX - BR : kX + KW / 2 - BR;
    const destY = isGoal ? tY - BR : GOAL_BOT - BR - 12;

    Animated.parallel([
      Animated.timing(bAX, { toValue: destX, duration: dur, useNativeDriver: true }),
      Animated.timing(bAY, { toValue: destY, duration: dur, useNativeDriver: true }),
      Animated.timing(bAS, { toValue: 0.36, duration: dur, useNativeDriver: true }),
      Animated.timing(bAR, { toValue: 4, duration: dur, useNativeDriver: true }),
    ]).start(() => {
      if (isGoal) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        flashMsg("⚽  GOL!", true);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        flashMsg("🧤  ATAJADO!", false);
      }
      const cur = gdRef.current;
      const nd: GD = { ...cur, ps: cur.ps + (isGoal ? 1 : 0), pk: [...cur.pk, res] };
      upGd(nd);

      setTimeout(() => {
        kAX.setValue(K_INIT_X);
        bAX.setValue(SPOT_X - BR);
        bAY.setValue(SPOT_Y - BR);
        bAS.setValue(1);
        bAR.setValue(0);
        cbAX.setValue(SPOT_X - BR);
        cbAY.setValue(GOAL_BOT - BR);
        cbAS.setValue(0.22);
        pkAX.setValue(K_INIT_X);
        diveRef.current = null;
        setDive(null);
        setPhase("cpu_preparing");
        setTimeout(() => doCpuKick(nd), 1100);
      }, 1750);
    });
  }

  // ── CPU kick ──────────────────────────────────────────────────
  function doCpuKick(cur: GD) {
    setPhase("cpu_flying");
    diveRef.current = null;
    const cpuZone = (Math.floor(Math.random() * 3)) as 0 | 1 | 2;
    const cpuDestX = GOAL_LEFT + cpuZone * ZONE_W + ZONE_W / 2 - BR;

    Animated.parallel([
      Animated.timing(cbAX, { toValue: cpuDestX, duration: 1400, useNativeDriver: true }),
      Animated.timing(cbAY, { toValue: SPOT_Y - BR - 20, duration: 1400, useNativeDriver: true }),
      Animated.timing(cbAS, { toValue: 1.18, duration: 1400, useNativeDriver: true }),
    ]).start(() => {
      const d = diveRef.current;
      const zoneName = cpuZone === 0 ? "left" : cpuZone === 2 ? "right" : "center";
      const playerSaved = d !== null && d === zoneName && Math.random() < 0.72;
      const cpuGoal = !playerSaved;
      const res: KR = cpuGoal ? "goal" : "saved";

      if (cpuGoal) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        flashMsg("💀  CPU GOL", false);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        flashMsg("✋  ¡ATAJASTE!", true);
      }

      const nd: GD = {
        round: cur.round + 1, ps: cur.ps,
        cs: cur.cs + (cpuGoal ? 1 : 0),
        pk: cur.pk, ck: [...cur.ck, res],
      };
      upGd(nd);

      setTimeout(() => {
        if (nd.round > TOTAL) {
          setPhase("gameover");
        } else {
          reset();
          setPower(0.5);
          setHeight(0.5);
          setDirection(0.5);
          setDive(null);
          setPhase("player_kick");
        }
      }, 1750);
    });
  }

  function playerDive(side: "left" | "right") {
    if (phaseRef.current !== "cpu_flying" || diveRef.current) return;
    diveRef.current = side;
    setDive(side);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Animated.spring(pkAX, {
      toValue: side === "left" ? K_INIT_X - GOAL_W * 0.3 : K_INIT_X + GOAL_W * 0.3,
      useNativeDriver: true,
      speed: 28,
      bounciness: 1,
    }).start();
  }

  function startGame() {
    reset();
    setPower(0.5);
    setHeight(0.5);
    setDirection(0.5);
    const d = { ...INIT };
    gdRef.current = d;
    setGd(d);
    setDive(null);
    setPhase("player_kick");
  }

  const bRotDeg = bAR.interpolate({
    inputRange: [0, 4],
    outputRange: ["0deg", "1440deg"],
  });

  const isPlayerPhase = phase === "player_kick" || phase === "kick_anim";
  const isCpuPhase = phase === "cpu_preparing" || phase === "cpu_flying";
  const isKicking = phase === "kick_anim";

  // Live aim indicator position (from sliders)
  const { x: aimX, y: aimY } = sliderTarget(direction, height);

  // ─── Menu ─────────────────────────────────────────────────────
  if (phase === "menu") {
    return (
      <View style={s.root}>
        <Field />
        <View style={[s.centerFill, { paddingTop: topPad }]}>
          <Text style={s.bigEmoji}>⚽</Text>
          <Text style={s.mainTitle}>PENALES</Text>
          <Text style={s.mainSub}>5 turnos · Ajustá los controles y pateá</Text>
          <TouchableOpacity style={s.bigBtn} onPress={startGame} activeOpacity={0.82}>
            <Text style={s.bigBtnTxt}>JUGAR</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Game Over ────────────────────────────────────────────────
  if (phase === "gameover") {
    const won = gd.ps > gd.cs;
    const tie = gd.ps === gd.cs;
    return (
      <View style={s.root}>
        <Field />
        <View style={[s.centerFill, { paddingTop: topPad }]}>
          <Text style={s.bigEmoji}>{won ? "🏆" : tie ? "🤝" : "😤"}</Text>
          <Text style={[s.mainTitle, { color: won ? "#2ECC71" : tie ? "#F1C40F" : "#E74C3C" }]}>
            {won ? "¡GANASTE!" : tie ? "EMPATE" : "PERDISTE"}
          </Text>
          <View style={s.goScoreRow}>
            <View style={s.goSide}>
              <Text style={s.goLabel}>VOS</Text>
              <Text style={s.goNum}>{gd.ps}</Text>
            </View>
            <Text style={s.goDash}>-</Text>
            <View style={s.goSide}>
              <Text style={s.goLabel}>CPU</Text>
              <Text style={s.goNum}>{gd.cs}</Text>
            </View>
          </View>
          <View style={s.kickHist}>
            {gd.pk.map((r, i) => (
              <Text key={i} style={s.histIcon}>{r === "goal" ? "⚽" : "❌"}</Text>
            ))}
            <Text style={s.histSep}> VS </Text>
            {gd.ck.map((r, i) => (
              <Text key={i} style={s.histIcon}>{r === "goal" ? "⚽" : "❌"}</Text>
            ))}
          </View>
          <TouchableOpacity style={s.bigBtn} onPress={startGame} activeOpacity={0.82}>
            <Text style={s.bigBtnTxt}>REVANCHA</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Main game screen ─────────────────────────────────────────
  return (
    <View style={s.root}>
      <Field />

      {/* Live aim dot in goal */}
      {phase === "player_kick" && (
        <View
          style={[
            s.aimDot,
            { left: aimX - 10, top: aimY - 10 },
          ]}
        />
      )}

      {/* Keeper */}
      {isPlayerPhase && (
        <Animated.View style={[s.keeperAbs, { transform: [{ translateX: kAX }] }]}>
          <Keeper color="#27AE60" />
        </Animated.View>
      )}

      {/* Player as keeper */}
      {isCpuPhase && (
        <Animated.View style={[s.playerKeeperAbs, { transform: [{ translateX: pkAX }] }]}>
          <Keeper color="#2980B9" />
        </Animated.View>
      )}

      {/* Ball */}
      {isPlayerPhase && (
        <Animated.View
          style={[
            s.ballAbs,
            {
              transform: [
                { translateX: bAX },
                { translateY: bAY },
                { scale: bAS },
                { rotate: bRotDeg },
              ],
            },
          ]}
        >
          <Ball />
        </Animated.View>
      )}

      {/* CPU Ball */}
      {isCpuPhase && (
        <Animated.View
          style={[
            s.ballAbs,
            { transform: [{ translateX: cbAX }, { translateY: cbAY }, { scale: cbAS }] },
          ]}
        >
          <Ball />
        </Animated.View>
      )}

      {/* Score bar */}
      <View style={[s.scoreBar, { top: topPad + 6 }]}>
        <View style={s.scoreSide}>
          <Text style={s.scLabel}>VOS</Text>
          <Text style={s.scNum}>{gd.ps}</Text>
          <View style={s.dots}>
            {Array.from({ length: TOTAL }).map((_, i) => {
              const r = gd.pk[i];
              return (
                <View key={i} style={[s.dot,
                  r === "goal" ? s.dotGreen : r === "saved" ? s.dotRed : s.dotGray]} />
              );
            })}
          </View>
        </View>
        <View style={s.roundBadge}>
          <Text style={s.roundTxt}>{Math.min(gd.round, TOTAL)}/{TOTAL}</Text>
        </View>
        <View style={[s.scoreSide, { alignItems: "flex-end" }]}>
          <Text style={s.scLabel}>CPU</Text>
          <Text style={s.scNum}>{gd.cs}</Text>
          <View style={s.dots}>
            {Array.from({ length: TOTAL }).map((_, i) => {
              const r = gd.ck[i];
              return (
                <View key={i} style={[s.dot,
                  r === "goal" ? s.dotGreen : r === "saved" ? s.dotRed : s.dotGray]} />
              );
            })}
          </View>
        </View>
      </View>

      {/* Turn label */}
      {!showMsg && (
        <View style={[s.turnLabel, { top: topPad + 96 }]}>
          {phase === "player_kick" && <Text style={s.turnTxt}>TU TURNO — ajustá y pateá</Text>}
          {phase === "kick_anim" && <Text style={s.turnTxt}>¡Allá va!</Text>}
          {phase === "cpu_preparing" && <Text style={[s.turnTxt, { color: "#E74C3C" }]}>CPU PATEA</Text>}
          {phase === "cpu_flying" && !dive && <Text style={[s.turnTxt, { color: "#E74C3C" }]}>⚡ ¡ATAJÁ!</Text>}
          {phase === "cpu_flying" && dive && (
            <Text style={[s.turnTxt, { color: "#3498DB" }]}>
              {dive === "left" ? "◀ Tirándose izquierda" : "Tirándose derecha ▶"}
            </Text>
          )}
        </View>
      )}

      {/* ─── Sliders panel (player kick) ─── */}
      {(phase === "player_kick" || phase === "kick_anim") && (
        <View style={[s.sliderPanel, { bottom: botPad + 4 }]}>
          <SliderBar
            value={power}
            onValueChange={setPower}
            label="⚡ POTENCIA"
            color="#E74C3C"
            disabled={isKicking}
          />
          <SliderBar
            value={height}
            onValueChange={setHeight}
            label="↕ ALTURA"
            color="#3498DB"
            disabled={isKicking}
          />
          <SliderBar
            value={direction}
            onValueChange={setDirection}
            label="↔ DIRECCIÓN"
            color="#F1C40F"
            center
            disabled={isKicking}
          />
          <TouchableOpacity
            style={[s.kickBtn, isKicking && s.kickBtnDisabled]}
            onPress={doKick}
            activeOpacity={0.8}
            disabled={isKicking}
          >
            <Text style={s.kickBtnTxt}>
              {isKicking ? "..." : "⚽  PATEAR"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ─── Dive buttons (CPU kick) ─── */}
      {phase === "cpu_flying" && (
        <View style={[s.diveRow, { bottom: botPad + 24 }]}>
          <TouchableOpacity
            style={[s.diveBtn, dive === "left" && s.diveBtnOn]}
            onPress={() => playerDive("left")}
            activeOpacity={0.78}
          >
            <Text style={s.diveTxt}>◀  ATAJAR</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.diveBtn, dive === "right" && s.diveBtnOn]}
            onPress={() => playerDive("right")}
            activeOpacity={0.78}
          >
            <Text style={s.diveTxt}>ATAJAR  ▶</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* CPU turn hint */}
      {phase === "cpu_preparing" && (
        <View style={[s.diveRow, { bottom: botPad + 24 }]}>
          <View style={[s.diveBtn, { flex: 1, backgroundColor: "rgba(231,76,60,0.15)", borderColor: "#E74C3C" }]}>
            <Text style={[s.diveTxt, { color: "#E74C3C" }]}>Prepará tus guantes...</Text>
          </View>
        </View>
      )}

      {/* Message overlay */}
      {showMsg && (
        <Animated.View style={[s.msgOverlay, { opacity: msgOp }]}>
          <Text style={[s.msgTxt, { color: goodMsg ? "#2ECC71" : "#E74C3C" }]}>{msg}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// ─── Slider styles ────────────────────────────────────────────────────────────
const sl = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    color: "#7a9bb5",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  dimText: {
    color: "#2a4060",
  },
  val: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    minWidth: 60,
    textAlign: "right",
  },
  track: {
    height: 8,
    backgroundColor: "#1e3d6e",
    borderRadius: 4,
    overflow: "visible",
  },
  trackDim: {
    backgroundColor: "#142840",
  },
  fill: {
    position: "absolute",
    height: 8,
    borderRadius: 4,
    top: 0,
  },
  thumb: {
    position: "absolute",
    width: THUMB_R * 2,
    height: THUMB_R * 2,
    borderRadius: THUMB_R,
    top: -(THUMB_R - 4),
    borderWidth: 2.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 5,
  },
  centerMark: {
    position: "absolute",
    left: "50%",
    top: -2,
    width: 2,
    height: 12,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 1,
    transform: [{ translateX: -1 }],
  },
});

// ─── Game styles ──────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020c1a" },
  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 32,
  },
  bigEmoji: { fontSize: 78, marginBottom: 4 },
  mainTitle: { fontSize: 50, fontWeight: "900", color: "#fff", letterSpacing: 5 },
  mainSub: { fontSize: 14, color: "#7a9bb5", textAlign: "center" },
  bigBtn: {
    marginTop: 20,
    backgroundColor: "#2ECC71",
    paddingHorizontal: 58,
    paddingVertical: 18,
    borderRadius: 50,
  },
  bigBtnTxt: { color: "#000", fontSize: 20, fontWeight: "900", letterSpacing: 3 },
  goScoreRow: { flexDirection: "row", alignItems: "center", gap: 24 },
  goSide: { alignItems: "center", gap: 2 },
  goLabel: { color: "#7a9bb5", fontSize: 12, fontWeight: "700", letterSpacing: 2 },
  goNum: { color: "#fff", fontSize: 68, fontWeight: "900" },
  goDash: { color: "#7a9bb5", fontSize: 44, fontWeight: "300" },
  kickHist: { flexDirection: "row", alignItems: "center", gap: 4 },
  histIcon: { fontSize: 20 },
  histSep: { color: "#7a9bb5", fontSize: 11, fontWeight: "700", letterSpacing: 1 },

  // Score bar
  scoreBar: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    zIndex: 50,
  },
  scoreSide: { alignItems: "flex-start", minWidth: 90 },
  scLabel: { color: "#7a9bb5", fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  scNum: { color: "#fff", fontSize: 42, fontWeight: "900", lineHeight: 48 },
  dots: { flexDirection: "row", gap: 5, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotGreen: { backgroundColor: "#2ECC71" },
  dotRed: { backgroundColor: "#E74C3C" },
  dotGray: { backgroundColor: "#1e3d6e" },
  roundBadge: { alignItems: "center", justifyContent: "flex-start", paddingTop: 14 },
  roundTxt: { color: "#F1C40F", fontSize: 16, fontWeight: "900" },

  // Turn label
  turnLabel: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 50,
  },
  turnTxt: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.5,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // Aim indicator
  aimDot: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(241,196,15,0.85)",
    borderWidth: 2.5,
    borderColor: "#fff",
    zIndex: 40,
    shadowColor: "#F1C40F",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 8,
  },

  // Keeper / ball
  keeperAbs: { position: "absolute", left: 0, top: K_Y, zIndex: 20 },
  playerKeeperAbs: { position: "absolute", left: 0, top: SPOT_Y - KH + 20, zIndex: 20 },
  ballAbs: { position: "absolute", left: 0, top: 0, width: BD, height: BD, zIndex: 30 },

  // Slider panel
  sliderPanel: {
    position: "absolute",
    left: 20,
    right: 20,
    backgroundColor: "rgba(6,18,36,0.92)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 18,
    gap: 14,
    zIndex: 60,
  },
  kickBtn: {
    marginTop: 4,
    backgroundColor: "#2ECC71",
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
  },
  kickBtnDisabled: {
    backgroundColor: "#1a4d30",
  },
  kickBtnTxt: {
    color: "#000",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 2,
  },

  // Dive buttons
  diveRow: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    gap: 12,
    zIndex: 60,
  },
  diveBtn: {
    flex: 1,
    backgroundColor: "rgba(41,128,185,0.28)",
    borderWidth: 2,
    borderColor: "#2980B9",
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
  },
  diveBtnOn: { backgroundColor: "rgba(41,128,185,0.7)" },
  diveTxt: { color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 1.5 },

  // Message
  msgOverlay: {
    position: "absolute",
    top: "42%",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 100,
  },
  msgTxt: {
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: 2,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
});
