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

// ─── Layout constants ────────────────────────────────────────────────────────
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
const SPOT_Y = TOP_OFF + SH * 0.64;
const BR = 20;
const BD = BR * 2;

const TOTAL = 5;

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

// ─── Helpers ─────────────────────────────────────────────────────────────────
function ballTarget(dx: number, dy: number): { x: number; y: number; in: boolean } {
  const ratio = Math.min(Math.abs(dx) / Math.max(1, Math.abs(dy)), 1.25);
  const tX = SPOT_X + Math.sign(dx) * ratio * (GOAL_W / 2) * 0.92;
  const pwr = Math.min(1, Math.abs(dy) / 180);
  const tY = GOAL_BOT - GOAL_H * (0.08 + pwr * 0.82);
  const inside =
    tX > GOAL_LEFT + POST_W &&
    tX < GOAL_RIGHT - POST_W &&
    tY > GOAL_TOP + POST_W &&
    tY < GOAL_BOT;
  return { x: tX, y: tY, in: inside };
}

function kZoneX(z: 0 | 1 | 2): number {
  return GOAL_LEFT + z * ZONE_W + ZONE_W / 2 - KW / 2;
}

function zone(x: number): 0 | 1 | 2 {
  if (x < GOAL_LEFT + ZONE_W) return 0;
  if (x < GOAL_LEFT + ZONE_W * 2) return 1;
  return 2;
}

function saved(bx: number, by: number, inGoal: boolean, kz: 0 | 1 | 2): boolean {
  if (!inGoal) return false;
  if (zone(bx) !== kz) return false;
  return by < GOAL_TOP + GOAL_H * 0.42 ? Math.random() < 0.58 : true;
}

// ─── Static field ────────────────────────────────────────────────────────────
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
      {/* Sky */}
      <Rect x={0} y={0} width={SW} height={GOAL_BOT + 8} fill="url(#sky)" />
      {/* Grass */}
      <Rect x={0} y={GOAL_BOT} width={SW} height={SH - GOAL_BOT} fill="url(#grass)" />
      {/* Grass stripes */}
      {[0, 2, 4].map((i) => (
        <Rect
          key={i}
          x={0}
          y={GOAL_BOT + (i * (SH - GOAL_BOT)) / 6}
          width={SW}
          height={(SH - GOAL_BOT) / 12}
          fill="#1e6b32"
          opacity={0.4}
        />
      ))}
      {/* Stadium lights */}
      <Circle cx={22} cy={GOAL_TOP - 20} r={40} fill="url(#glow)" />
      <Circle cx={22} cy={GOAL_TOP - 20} r={7} fill="#ffffee" />
      <Circle cx={SW - 22} cy={GOAL_TOP - 20} r={40} fill="url(#glow)" />
      <Circle cx={SW - 22} cy={GOAL_TOP - 20} r={7} fill="#ffffee" />
      {/* Net horizontals */}
      {nH.map((f) => (
        <Line
          key={`nh${f}`}
          x1={GOAL_LEFT + POST_W}
          y1={GOAL_TOP + POST_W + f * (GOAL_H - POST_W)}
          x2={GOAL_RIGHT - POST_W}
          y2={GOAL_TOP + POST_W + f * (GOAL_H - POST_W)}
          stroke="rgba(200,200,200,0.22)"
          strokeWidth={1}
        />
      ))}
      {/* Net verticals */}
      {Array.from({ length: nVC + 1 }).map((_, i) => (
        <Line
          key={`nv${i}`}
          x1={GOAL_LEFT + POST_W + i * nVS}
          y1={GOAL_TOP + POST_W}
          x2={GOAL_LEFT + POST_W + i * nVS}
          y2={GOAL_BOT}
          stroke="rgba(200,200,200,0.18)"
          strokeWidth={1}
        />
      ))}
      {/* Posts */}
      <Rect x={GOAL_LEFT} y={GOAL_TOP} width={POST_W} height={GOAL_H} fill="#f0f0f0" rx={4} />
      <Rect x={GOAL_RIGHT - POST_W} y={GOAL_TOP} width={POST_W} height={GOAL_H} fill="#f0f0f0" rx={4} />
      <Rect x={GOAL_LEFT} y={GOAL_TOP} width={GOAL_W} height={POST_W} fill="#f0f0f0" rx={4} />
      {/* Shadow under goal */}
      <Rect x={GOAL_LEFT} y={GOAL_BOT} width={GOAL_W} height={5} fill="rgba(0,0,0,0.35)" />
      {/* Goal line */}
      <Line
        x1={GOAL_LEFT - 35} y1={GOAL_BOT} x2={GOAL_RIGHT + 35} y2={GOAL_BOT}
        stroke="rgba(255,255,255,0.45)" strokeWidth={2}
      />
      {/* Penalty box */}
      <Line x1={GOAL_LEFT - 55} y1={GOAL_BOT} x2={GOAL_LEFT - 55} y2={GOAL_BOT + 135} stroke="rgba(255,255,255,0.28)" strokeWidth={2} />
      <Line x1={GOAL_RIGHT + 55} y1={GOAL_BOT} x2={GOAL_RIGHT + 55} y2={GOAL_BOT + 135} stroke="rgba(255,255,255,0.28)" strokeWidth={2} />
      <Line x1={GOAL_LEFT - 55} y1={GOAL_BOT + 135} x2={GOAL_RIGHT + 55} y2={GOAL_BOT + 135} stroke="rgba(255,255,255,0.28)" strokeWidth={2} />
      {/* Penalty spot */}
      <Circle cx={SPOT_X} cy={SPOT_Y} r={4.5} fill="rgba(255,255,255,0.55)" />
      {/* Penalty arc */}
      <Path
        d={`M ${SPOT_X - 70} ${SPOT_Y - 38} Q ${SPOT_X} ${SPOT_Y - 105} ${SPOT_X + 70} ${SPOT_Y - 38}`}
        stroke="rgba(255,255,255,0.22)"
        strokeWidth={2}
        fill="none"
      />
    </Svg>
  );
});

// ─── Keeper shape ─────────────────────────────────────────────────────────────
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

// ─── Ball shape ───────────────────────────────────────────────────────────────
function Ball() {
  return (
    <Svg width={BD} height={BD}>
      <Circle cx={BR} cy={BR} r={BR - 1} fill="#f5f5f5" stroke="#d0d0d0" strokeWidth={1.5} />
      <Path
        d={`M${BR},${BR - 9} L${BR + 8},${BR - 3} L${BR + 8},${BR + 4} L${BR},${BR + 9} L${BR - 8},${BR + 4} L${BR - 8},${BR - 3} Z`}
        fill="#111"
      />
      <Path
        d={`M${BR - 10},${BR - 11} L${BR - 4},${BR - 16} L${BR + 2},${BR - 14} L${BR + 2},${BR - 8} L${BR - 4},${BR - 5} L${BR - 10},${BR - 7} Z`}
        fill="#111"
      />
      <Path
        d={`M${BR + 10},${BR - 11} L${BR + 4},${BR - 16} L${BR - 2},${BR - 14} L${BR - 2},${BR - 8} L${BR + 4},${BR - 5} L${BR + 10},${BR - 7} Z`}
        fill="#111"
      />
    </Svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
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
  const [dragVec, setDragVec] = useState<{ dx: number; dy: number } | null>(null);
  const [dive, setDive] = useState<"left" | "right" | null>(null);
  const diveRef = useRef<"left" | "right" | null>(null);

  // Animated values — all using transforms (native driver compatible)
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

  // ── Pan responder for kicking ──────────────────────────────────
  const panR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => {
        return (
          phaseRef.current === "player_kick" &&
          e.nativeEvent.pageY > SPOT_Y - 80
        );
      },
      onPanResponderMove: (_, g) => {
        if (g.dy < 0 || Math.abs(g.dx) > 15)
          setDragVec({ dx: g.dx, dy: g.dy });
      },
      onPanResponderRelease: (_, g) => {
        setDragVec(null);
        if (g.dy < -38) doKick(g.dx, g.dy);
      },
      onPanResponderTerminate: () => setDragVec(null),
    })
  ).current;

  // ── Player kicks ───────────────────────────────────────────────
  function doKick(dx: number, dy: number) {
    if (phaseRef.current !== "player_kick") return;
    setPhase("kick_anim");
    setDragVec(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const { x: tX, y: tY, in: inGoal } = ballTarget(dx, dy);
    const kz = (Math.floor(Math.random() * 3)) as 0 | 1 | 2;
    const kX = kZoneX(kz);
    const isGoal = !(!inGoal || saved(tX, tY, inGoal, kz));
    const res: KR = isGoal ? "goal" : "saved";

    // Keeper dive
    Animated.spring(kAX, {
      toValue: kX,
      useNativeDriver: true,
      speed: 20,
      bounciness: 2,
    }).start();

    // Ball flies
    const destX = isGoal ? tX - BR : kX + KW / 2 - BR;
    const destY = isGoal ? tY - BR : GOAL_BOT - BR - 12;

    Animated.parallel([
      Animated.timing(bAX, { toValue: destX, duration: 460, useNativeDriver: true }),
      Animated.timing(bAY, { toValue: destY, duration: 460, useNativeDriver: true }),
      Animated.timing(bAS, { toValue: 0.36, duration: 460, useNativeDriver: true }),
      Animated.timing(bAR, { toValue: 4, duration: 460, useNativeDriver: true }),
    ]).start(() => {
      if (isGoal) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        flashMsg("⚽  GOL!", true);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        flashMsg(inGoal ? "🧤  ATAJADO!" : "❌  AFUERA!", false);
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
      Animated.timing(cbAX, { toValue: cpuDestX, duration: 1450, useNativeDriver: true }),
      Animated.timing(cbAY, { toValue: SPOT_Y - BR - 30, duration: 1450, useNativeDriver: true }),
      Animated.timing(cbAS, { toValue: 1.18, duration: 1450, useNativeDriver: true }),
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
        round: cur.round + 1,
        ps: cur.ps,
        cs: cur.cs + (cpuGoal ? 1 : 0),
        pk: cur.pk,
        ck: [...cur.ck, res],
      };
      upGd(nd);

      setTimeout(() => {
        if (nd.round > TOTAL) {
          setPhase("gameover");
        } else {
          reset();
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

  // Aim indicator
  let aimX = SPOT_X;
  let aimY = SPOT_Y;
  let aimIn = false;
  if (dragVec && dragVec.dy < 0) {
    const t = ballTarget(dragVec.dx, dragVec.dy);
    aimX = t.x;
    aimY = Math.max(GOAL_TOP + POST_W + 2, Math.min(GOAL_BOT - 2, t.y));
    aimIn = t.in;
  }

  // ─── Menu ────────────────────────────────────────────────────────
  if (phase === "menu") {
    return (
      <View style={s.root}>
        <Field />
        <View style={[s.centerFill, { paddingTop: topPad }]}>
          <Text style={s.bigEmoji}>⚽</Text>
          <Text style={s.mainTitle}>PENALES</Text>
          <Text style={s.mainSub}>5 turnos · Patea y atajá</Text>
          <TouchableOpacity style={s.bigBtn} onPress={startGame} activeOpacity={0.82}>
            <Text style={s.bigBtnTxt}>JUGAR</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Game Over ───────────────────────────────────────────────────
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
              <Text key={i} style={s.histIcon}>
                {r === "goal" ? "⚽" : "❌"}
              </Text>
            ))}
            <Text style={s.histSep}> VS </Text>
            {gd.ck.map((r, i) => (
              <Text key={i} style={s.histIcon}>
                {r === "goal" ? "⚽" : "❌"}
              </Text>
            ))}
          </View>
          <TouchableOpacity style={s.bigBtn} onPress={startGame} activeOpacity={0.82}>
            <Text style={s.bigBtnTxt}>REVANCHA</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Main game ───────────────────────────────────────────────────
  return (
    <View
      style={s.root}
      {...(isPlayerPhase ? panR.panHandlers : {})}
    >
      <Field />

      {/* Aim guide */}
      {dragVec && dragVec.dy < 0 && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={SW} height={SH}>
            <Line
              x1={SPOT_X} y1={SPOT_Y} x2={aimX} y2={aimY}
              stroke={aimIn ? "rgba(241,196,15,0.75)" : "rgba(231,76,60,0.65)"}
              strokeWidth={3}
              strokeDasharray="9,6"
            />
            <Circle
              cx={aimX} cy={aimY} r={9}
              fill={aimIn ? "rgba(241,196,15,0.85)" : "rgba(231,76,60,0.8)"}
            />
          </Svg>
        </View>
      )}

      {/* Keeper (player kick phases) */}
      {isPlayerPhase && (
        <Animated.View
          style={[s.keeperAbs, { transform: [{ translateX: kAX }] }]}
        >
          <Keeper color="#27AE60" />
        </Animated.View>
      )}

      {/* Player as keeper (cpu kick phases) */}
      {isCpuPhase && (
        <Animated.View
          style={[s.playerKeeperAbs, { transform: [{ translateX: pkAX }] }]}
        >
          <Keeper color="#2980B9" />
        </Animated.View>
      )}

      {/* Ball (player kick phases) */}
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

      {/* CPU ball */}
      {isCpuPhase && (
        <Animated.View
          style={[
            s.ballAbs,
            {
              transform: [
                { translateX: cbAX },
                { translateY: cbAY },
                { scale: cbAS },
              ],
            },
          ]}
        >
          <Ball />
        </Animated.View>
      )}

      {/* Score header */}
      <View style={[s.scoreBar, { top: topPad + 6 }]}>
        <View style={s.scoreSide}>
          <Text style={s.scLabel}>VOS</Text>
          <Text style={s.scNum}>{gd.ps}</Text>
          <View style={s.dots}>
            {Array.from({ length: TOTAL }).map((_, i) => {
              const r = gd.pk[i];
              return (
                <View
                  key={i}
                  style={[
                    s.dot,
                    r === "goal" ? s.dotGreen : r === "saved" ? s.dotRed : s.dotGray,
                  ]}
                />
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
                <View
                  key={i}
                  style={[
                    s.dot,
                    r === "goal" ? s.dotGreen : r === "saved" ? s.dotRed : s.dotGray,
                  ]}
                />
              );
            })}
          </View>
        </View>
      </View>

      {/* Turn label */}
      {!showMsg && (
        <View style={[s.turnLabel, { top: topPad + 98 }]}>
          {phase === "player_kick" && (
            <Text style={s.turnTxt}>TU TURNO</Text>
          )}
          {phase === "kick_anim" && <Text style={s.turnTxt}>¡Allá va!</Text>}
          {phase === "cpu_preparing" && (
            <Text style={[s.turnTxt, { color: "#E74C3C" }]}>CPU PATEA</Text>
          )}
          {phase === "cpu_flying" && !dive && (
            <Text style={[s.turnTxt, { color: "#E74C3C" }]}>⚡ ¡ATAJÁ AHORA!</Text>
          )}
          {phase === "cpu_flying" && dive && (
            <Text style={[s.turnTxt, { color: "#3498DB" }]}>
              {dive === "left" ? "◀ Tirándose izquierda" : "Tirándose derecha ▶"}
            </Text>
          )}
        </View>
      )}

      {/* Dive buttons */}
      {phase === "cpu_flying" && (
        <View style={[s.diveRow, { bottom: botPad + 28 }]}>
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

      {/* Kick hint */}
      {phase === "player_kick" && (
        <View style={[s.hintRow, { bottom: botPad + 28 }]}>
          <Text style={s.hintTxt}>Deslizá hacia arriba para patear</Text>
        </View>
      )}

      {/* Message */}
      {showMsg && (
        <Animated.View style={[s.msgOverlay, { opacity: msgOp }]}>
          <Text style={[s.msgTxt, { color: goodMsg ? "#2ECC71" : "#E74C3C" }]}>
            {msg}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#020c1a",
  },
  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 32,
  },

  // Menu / game over
  bigEmoji: { fontSize: 78, marginBottom: 4 },
  mainTitle: {
    fontSize: 50,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 5,
  },
  mainSub: { fontSize: 15, color: "#7a9bb5", textAlign: "center" },
  bigBtn: {
    marginTop: 20,
    backgroundColor: "#2ECC71",
    paddingHorizontal: 58,
    paddingVertical: 18,
    borderRadius: 50,
  },
  bigBtnTxt: {
    color: "#000",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 3,
  },
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

  // Keeper
  keeperAbs: {
    position: "absolute",
    left: 0,
    top: K_Y,
    zIndex: 20,
  },
  playerKeeperAbs: {
    position: "absolute",
    left: 0,
    top: SPOT_Y - KH + 20,
    zIndex: 20,
  },

  // Ball
  ballAbs: {
    position: "absolute",
    left: 0,
    top: 0,
    width: BD,
    height: BD,
    zIndex: 30,
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
  diveBtnOn: {
    backgroundColor: "rgba(41,128,185,0.7)",
  },
  diveTxt: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  // Kick hint
  hintRow: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 50,
  },
  hintTxt: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.5,
  },

  // Message
  msgOverlay: {
    position: "absolute",
    top: "44%",
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
