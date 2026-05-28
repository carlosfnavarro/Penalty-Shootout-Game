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
  G,
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

// ─── Layout ───────────────────────────────────────────────────────────────────
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
const THUMB_R = 10; // compact

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase =
  | "menu" | "player_kick" | "kick_anim"
  | "cpu_preparing" | "cpu_flying" | "gameover";
type KR = "goal" | "saved";
interface GD { round: number; ps: number; cs: number; pk: KR[]; ck: KR[] }
const INIT: GD = { round: 1, ps: 0, cs: 0, pk: [], ck: [] };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sliderTarget(dir: number, ht: number) {
  return {
    x: GOAL_LEFT + POST_W + dir * (GOAL_W - POST_W * 2),
    y: GOAL_BOT - POST_W - ht * (GOAL_H - POST_W * 2),
  };
}
function keeperGoalX(dir: number) {
  return Math.max(GOAL_LEFT, Math.min(GOAL_RIGHT - KW,
    GOAL_LEFT + POST_W + dir * (GOAL_W - POST_W * 2) - KW / 2));
}
function isSaved(tX: number, tY: number, kz: 0 | 1 | 2, pwr: number) {
  const z = tX < GOAL_LEFT + ZONE_W ? 0 : tX < GOAL_LEFT + ZONE_W * 2 ? 1 : 2;
  if (z !== kz) return false;
  const base = tY < GOAL_TOP + GOAL_H * 0.42 ? 0.52 : 0.85;
  return Math.random() < base - pwr * 0.5;
}
function cpuBallDest(zone: 0 | 1 | 2, ht: number) {
  const dirPct = zone === 0 ? 0.14 : zone === 1 ? 0.5 : 0.86;
  return {
    x: GOAL_LEFT + POST_W + dirPct * (GOAL_W - POST_W * 2) - BR,
    y: GOAL_BOT - POST_W - ht * (GOAL_H - POST_W * 2) - BR,
  };
}

// ─── Crowd ────────────────────────────────────────────────────────────────────
const CC = ["#E74C3C","#3498DB","#2ECC71","#F1C40F","#9B59B6",
            "#E67E22","#1ABC9C","#E91E63","#FF9F43","#5F27CD",
            "#C0392B","#2980B9","#27AE60","#D4AC0D","#8E44AD"];
const SK = ["#d4a373","#c68642","#e8b89a","#8d5524","#fcddb0"];

function CrowdRow({ sx, sy, n, dir }: { sx: number; sy: number; n: number; dir: 1|-1 }) {
  return (
    <G>
      {Array.from({ length: n }).map((_, i) => {
        const cx = sx + dir * i * 13;
        const cy = sy + (i % 3) * 9;
        return (
          <G key={i}>
            <Circle cx={cx} cy={cy - 7} r={5} fill={SK[i % SK.length]} />
            <Rect x={cx - 4} y={cy - 2} width={9} height={11} fill={CC[i % CC.length]} rx={2} />
          </G>
        );
      })}
    </G>
  );
}

// ─── Field SVG ────────────────────────────────────────────────────────────────
const Field = React.memo(function Field() {
  const nVS = (GOAL_W - POST_W * 2) / 8;
  return (
    <Svg width={SW} height={SH} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#020c1a" /><Stop offset="0.55" stopColor="#0a1c34" />
          <Stop offset="1" stopColor="#0d2240" />
        </LinearGradient>
        <LinearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1a5c28" /><Stop offset="0.6" stopColor="#144e20" />
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
      {[0,2,4].map(i => (
        <Rect key={i} x={0} y={GOAL_BOT + i*(SH-GOAL_BOT)/6}
          width={SW} height={(SH-GOAL_BOT)/12} fill="#1e6b32" opacity={0.4} />
      ))}
      <Circle cx={22} cy={GOAL_TOP-20} r={40} fill="url(#glow)" />
      <Circle cx={22} cy={GOAL_TOP-20} r={7} fill="#ffffee" />
      <Circle cx={SW-22} cy={GOAL_TOP-20} r={40} fill="url(#glow)" />
      <Circle cx={SW-22} cy={GOAL_TOP-20} r={7} fill="#ffffee" />
      {/* Crowd behind goal */}
      <CrowdRow sx={GOAL_LEFT-10} sy={GOAL_TOP+22} n={4} dir={-1} />
      <CrowdRow sx={GOAL_LEFT-8} sy={GOAL_TOP+44} n={3} dir={-1} />
      <CrowdRow sx={GOAL_RIGHT+10} sy={GOAL_TOP+22} n={4} dir={1} />
      <CrowdRow sx={GOAL_RIGHT+8} sy={GOAL_TOP+44} n={3} dir={1} />
      {/* Crowd on sidelines */}
      <CrowdRow sx={14} sy={GOAL_BOT+32} n={5} dir={1} />
      <CrowdRow sx={14} sy={GOAL_BOT+62} n={4} dir={1} />
      <CrowdRow sx={14} sy={GOAL_BOT+92} n={3} dir={1} />
      <CrowdRow sx={SW-14} sy={GOAL_BOT+32} n={5} dir={-1} />
      <CrowdRow sx={SW-14} sy={GOAL_BOT+62} n={4} dir={-1} />
      <CrowdRow sx={SW-14} sy={GOAL_BOT+92} n={3} dir={-1} />
      {/* Net */}
      {[0.22,0.44,0.66,0.88].map(f => (
        <Line key={f} x1={GOAL_LEFT+POST_W} y1={GOAL_TOP+POST_W+f*(GOAL_H-POST_W)}
          x2={GOAL_RIGHT-POST_W} y2={GOAL_TOP+POST_W+f*(GOAL_H-POST_W)}
          stroke="rgba(200,200,200,0.22)" strokeWidth={1} />
      ))}
      {Array.from({length:9}).map((_,i) => (
        <Line key={i} x1={GOAL_LEFT+POST_W+i*nVS} y1={GOAL_TOP+POST_W}
          x2={GOAL_LEFT+POST_W+i*nVS} y2={GOAL_BOT}
          stroke="rgba(200,200,200,0.18)" strokeWidth={1} />
      ))}
      {/* Posts */}
      <Rect x={GOAL_LEFT} y={GOAL_TOP} width={POST_W} height={GOAL_H} fill="#f0f0f0" rx={4} />
      <Rect x={GOAL_RIGHT-POST_W} y={GOAL_TOP} width={POST_W} height={GOAL_H} fill="#f0f0f0" rx={4} />
      <Rect x={GOAL_LEFT} y={GOAL_TOP} width={GOAL_W} height={POST_W} fill="#f0f0f0" rx={4} />
      <Rect x={GOAL_LEFT} y={GOAL_BOT} width={GOAL_W} height={5} fill="rgba(0,0,0,0.35)" />
      {/* Field markings */}
      <Line x1={GOAL_LEFT-35} y1={GOAL_BOT} x2={GOAL_RIGHT+35} y2={GOAL_BOT}
        stroke="rgba(255,255,255,0.45)" strokeWidth={2} />
      <Line x1={GOAL_LEFT-55} y1={GOAL_BOT} x2={GOAL_LEFT-55} y2={GOAL_BOT+135}
        stroke="rgba(255,255,255,0.28)" strokeWidth={2} />
      <Line x1={GOAL_RIGHT+55} y1={GOAL_BOT} x2={GOAL_RIGHT+55} y2={GOAL_BOT+135}
        stroke="rgba(255,255,255,0.28)" strokeWidth={2} />
      <Line x1={GOAL_LEFT-55} y1={GOAL_BOT+135} x2={GOAL_RIGHT+55} y2={GOAL_BOT+135}
        stroke="rgba(255,255,255,0.28)" strokeWidth={2} />
      <Circle cx={SPOT_X} cy={SPOT_Y} r={4.5} fill="rgba(255,255,255,0.55)" />
      <Path d={`M ${SPOT_X-70} ${SPOT_Y-38} Q ${SPOT_X} ${SPOT_Y-105} ${SPOT_X+70} ${SPOT_Y-38}`}
        stroke="rgba(255,255,255,0.22)" strokeWidth={2} fill="none" />
    </Svg>
  );
});

// ─── Keeper SVG ───────────────────────────────────────────────────────────────
function Keeper({ color }: { color: string }) {
  return (
    <Svg width={KW} height={KH}>
      <Circle cx={KW/2} cy={16} r={14} fill="#E67E22" />
      <Rect x={6} y={28} width={KW-12} height={KH-36} fill={color} rx={6} />
      <Rect x={0} y={34} width={13} height={7} fill={color} rx={4} />
      <Rect x={KW-13} y={34} width={13} height={7} fill={color} rx={4} />
    </Svg>
  );
}

// ─── Ball SVG ─────────────────────────────────────────────────────────────────
function Ball() {
  return (
    <Svg width={BD} height={BD}>
      <Circle cx={BR} cy={BR} r={BR-1} fill="#f5f5f5" stroke="#d0d0d0" strokeWidth={1.5} />
      <Path d={`M${BR},${BR-9} L${BR+8},${BR-3} L${BR+8},${BR+4} L${BR},${BR+9} L${BR-8},${BR+4} L${BR-8},${BR-3} Z`} fill="#111" />
      <Path d={`M${BR-10},${BR-11} L${BR-4},${BR-16} L${BR+2},${BR-14} L${BR+2},${BR-8} L${BR-4},${BR-5} L${BR-10},${BR-7} Z`} fill="#111" />
      <Path d={`M${BR+10},${BR-11} L${BR+4},${BR-16} L${BR-2},${BR-14} L${BR-2},${BR-8} L${BR+4},${BR-5} L${BR+10},${BR-7} Z`} fill="#111" />
    </Svg>
  );
}

// ─── Compact Slider ───────────────────────────────────────────────────────────
function SliderBar({ value, onValueChange, label, color, center=false, disabled=false }: {
  value: number; onValueChange: (v: number) => void;
  label: string; color: string; center?: boolean; disabled?: boolean;
}) {
  const trackRef = useRef<View>(null);
  const tPageX = useRef(0);
  const tWidth = useRef(SW - 48);
  const measure = () => trackRef.current?.measure((_x, _y, w, _h, px) => { tPageX.current = px; tWidth.current = Math.max(1,w); });
  const clamp = (px: number) => Math.max(0, Math.min(1, (px - tPageX.current) / tWidth.current));
  const panR = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: (e) => { measure(); onValueChange(clamp(e.nativeEvent.pageX)); },
    onPanResponderMove: (e) => { onValueChange(clamp(e.nativeEvent.pageX)); },
  })).current;

  const pct = value * 100;
  const fillL = center ? (value<0.5 ? `${pct}%` : "50%") : "0%";
  const fillW = center ? `${Math.abs(value-0.5)*100}%` : `${pct}%`;
  let disp: string;
  if (center) {
    if (value>0.52) disp = `▶ ${Math.round((value-0.5)*200)}`;
    else if (value<0.48) disp = `◀ ${Math.round((0.5-value)*200)}`;
    else disp = "CENTRO";
  } else disp = `${Math.round(pct)}%`;

  return (
    <View style={sl.wrap}>
      <View style={sl.row}>
        <Text style={[sl.lbl, disabled && sl.dim]}>{label}</Text>
        <Text style={[sl.val, { color: disabled ? "#2a4060" : color }]}>{disp}</Text>
      </View>
      <View ref={trackRef} style={[sl.track, disabled && sl.trackDim]}
        onLayout={measure} hitSlop={{ top:16, bottom:16 }}
        {...(!disabled ? panR.panHandlers : {})}>
        {center && <View style={sl.cMark} />}
        <View style={[sl.fill, { left: fillL as `${number}%`, width: fillW as `${number}%`, backgroundColor: disabled ? "#2a4060" : color }]} />
        <View style={[sl.thumb, { left: `${pct}%` as `${number}%`, transform:[{translateX:-THUMB_R}], backgroundColor: disabled ? "#2a4060" : color, borderColor: disabled ? "#1e3050" : "#fff" }]} />
      </View>
    </View>
  );
}

// ─── Main game ────────────────────────────────────────────────────────────────
export default function PenaltyGame() {
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (IS_WEB ? 67 : 0);
  const botPad = insets.bottom || (IS_WEB ? 34 : 0);

  const [phase, setPhaseState] = useState<Phase>("menu");
  const phaseRef = useRef<Phase>("menu");
  function setPhase(p: Phase) { phaseRef.current = p; setPhaseState(p); }

  const [gd, setGd] = useState<GD>(INIT);
  const gdRef = useRef<GD>(INIT);
  function upGd(d: GD) { gdRef.current = d; setGd(d); }

  const [msg, setMsg] = useState("");
  const [showMsg, setShowMsg] = useState(false);
  const [goodMsg, setGoodMsg] = useState(false);

  // Slider state (shared between kick and save phases)
  const [power, setPower] = useState(0.5);
  const [height, setHeight] = useState(0.5);
  const [direction, setDirection] = useState(0.5);

  // CPU secret pick
  const cpuZone = useRef<0|1|2>(1);
  const cpuHt = useRef(0.5);

  // Animated values
  const bAX = useRef(new Animated.Value(SPOT_X - BR)).current;
  const bAY = useRef(new Animated.Value(SPOT_Y - BR)).current;
  const bAS = useRef(new Animated.Value(1)).current;
  const bAR = useRef(new Animated.Value(0)).current;
  const kAX = useRef(new Animated.Value(K_INIT_X)).current; // keeper in goal
  const msgOp = useRef(new Animated.Value(0)).current;

  function resetBall() {
    bAX.setValue(SPOT_X - BR); bAY.setValue(SPOT_Y - BR);
    bAS.setValue(1); bAR.setValue(0);
  }

  function flashMsg(m: string, good: boolean) {
    setMsg(m); setGoodMsg(good); setShowMsg(true);
    Animated.sequence([
      Animated.timing(msgOp, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(1050),
      Animated.timing(msgOp, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setShowMsg(false));
  }

  // ── Player kick ──────────────────────────────────────────────
  function doKick() {
    if (phaseRef.current !== "player_kick") return;
    setPhase("kick_anim");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const { x: tX, y: tY } = sliderTarget(direction, height);
    const kz = (Math.floor(Math.random() * 3)) as 0|1|2;
    const kX = GOAL_LEFT + kz * ZONE_W + ZONE_W / 2 - KW / 2;
    const saved = isSaved(tX, tY, kz, power);
    const isGoal = !saved;

    // Keeper dives to zone
    Animated.spring(kAX, { toValue: kX, useNativeDriver: true, speed: 18, bounciness: 2 }).start();

    // Ball flies
    const destX = isGoal ? tX - BR : kX + KW/2 - BR;
    const destY = isGoal ? tY - BR : GOAL_BOT - BR - 12;
    Animated.parallel([
      Animated.timing(bAX, { toValue: destX, duration: 580, useNativeDriver: true }),
      Animated.timing(bAY, { toValue: destY, duration: 580, useNativeDriver: true }),
      Animated.timing(bAS, { toValue: 0.38, duration: 580, useNativeDriver: true }),
      Animated.timing(bAR, { toValue: 4, duration: 580, useNativeDriver: true }),
    ]).start(() => {
      isGoal
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      flashMsg(isGoal ? "⚽  GOL!" : "🧤  ATAJADO!", isGoal);

      const cur = gdRef.current;
      const nd: GD = { ...cur, ps: cur.ps+(isGoal?1:0), pk: [...cur.pk, isGoal?"goal":"saved"] };
      upGd(nd);

      setTimeout(() => {
        // Prepare CPU kick: CPU secretly picks zone
        cpuZone.current = Math.floor(Math.random()*3) as 0|1|2;
        cpuHt.current = Math.random();
        // Reset everything for next view
        resetBall();
        kAX.setValue(K_INIT_X);
        setPower(0.5); setHeight(0.5); setDirection(0.5);
        msgOp.setValue(0);
        setPhase("cpu_preparing");
      }, 1700);
    });
  }

  // ── Player saves (commits dive position) ─────────────────────
  function doSave() {
    if (phaseRef.current !== "cpu_preparing") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const cDir = direction;
    const cHt = height;
    const cPwr = power;

    // Keeper target from direction slider
    const kTarget = keeperGoalX(cDir);
    // CPU ball destination
    const { x: ballX, y: ballY } = cpuBallDest(cpuZone.current, cpuHt.current);

    // Set keeper animated value to current slider position, then spring-confirm
    kAX.setValue(kTarget);
    setPhase("cpu_flying");

    // Keeper springs slightly (dive confirm)
    Animated.sequence([
      Animated.spring(kAX, { toValue: kTarget + (cDir>0.5?10:-10), useNativeDriver: true, speed:60, bounciness:12 }),
      Animated.spring(kAX, { toValue: kTarget, useNativeDriver: true, speed:40, bounciness:4 }),
    ]).start();

    // Ball flies from spot to goal
    Animated.parallel([
      Animated.timing(bAX, { toValue: ballX, duration: 580, useNativeDriver: true }),
      Animated.timing(bAY, { toValue: ballY, duration: 580, useNativeDriver: true }),
      Animated.timing(bAS, { toValue: 0.38, duration: 580, useNativeDriver: true }),
      Animated.timing(bAR, { toValue: -4, duration: 580, useNativeDriver: true }),
    ]).start(() => {
      // Save calculation: compare keeper center to ball center
      const keeperCX = kTarget + KW/2;
      const keeperCY = GOAL_BOT - POST_W - cHt * (GOAL_H - POST_W*2);
      const ballCX = ballX + BR;
      const ballCY = ballY + BR;
      const reach = 38 + cPwr * 65; // pixels of reach (bigger with power)
      const saved = Math.abs(keeperCX - ballCX) < reach && Math.abs(keeperCY - ballCY) < reach;

      saved
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      flashMsg(saved ? "✋  ¡ATAJASTE!" : "💀  CPU GOL", saved);

      const cur = gdRef.current;
      const nd: GD = {
        round: cur.round+1, ps: cur.ps,
        cs: cur.cs+(saved?0:1),
        pk: cur.pk, ck: [...cur.ck, saved?"saved":"goal"],
      };
      upGd(nd);

      setTimeout(() => {
        if (nd.round > TOTAL) { setPhase("gameover"); return; }
        resetBall(); kAX.setValue(K_INIT_X);
        setPower(0.5); setHeight(0.5); setDirection(0.5);
        msgOp.setValue(0);
        setPhase("player_kick");
      }, 1700);
    });
  }

  function startGame() {
    resetBall(); kAX.setValue(K_INIT_X); msgOp.setValue(0);
    setPower(0.5); setHeight(0.5); setDirection(0.5);
    const d = { ...INIT }; gdRef.current = d; setGd(d);
    setPhase("player_kick");
  }

  const bRot = bAR.interpolate({ inputRange:[0,4], outputRange:["0deg","1440deg"] });
  const isKicking = phase === "kick_anim";
  const isSaving = phase === "cpu_flying";
  const isCpuPrep = phase === "cpu_preparing";

  // Live aim positions
  const { x: aimX, y: aimY } = sliderTarget(direction, height);
  // Keeper position during save phase (real-time from direction slider)
  const kGoalX = keeperGoalX(direction);

  // ─── Menu ────────────────────────────────────────────────────
  if (phase === "menu") return (
    <View style={s.root}>
      <Field />
      <View style={[s.center, { paddingTop: topPad }]}>
        <Text style={s.emoji}>⚽</Text>
        <Text style={s.title}>PENALES</Text>
        <Text style={s.sub}>5 turnos · Pateá y atajá</Text>
        <TouchableOpacity style={s.bigBtn} onPress={startGame} activeOpacity={0.82}>
          <Text style={s.bigBtnTxt}>JUGAR</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ─── Game Over ───────────────────────────────────────────────
  if (phase === "gameover") {
    const won = gd.ps > gd.cs, tie = gd.ps === gd.cs;
    return (
      <View style={s.root}>
        <Field />
        <View style={[s.center, { paddingTop: topPad }]}>
          <Text style={s.emoji}>{won?"🏆":tie?"🤝":"😤"}</Text>
          <Text style={[s.title, { color: won?"#2ECC71":tie?"#F1C40F":"#E74C3C" }]}>
            {won?"¡GANASTE!":tie?"EMPATE":"PERDISTE"}
          </Text>
          <View style={s.scoreRow}>
            <View style={s.scoreSide}><Text style={s.goLbl}>VOS</Text><Text style={s.goNum}>{gd.ps}</Text></View>
            <Text style={s.dash}>-</Text>
            <View style={s.scoreSide}><Text style={s.goLbl}>CPU</Text><Text style={s.goNum}>{gd.cs}</Text></View>
          </View>
          <View style={s.hist}>
            {gd.pk.map((r,i) => <Text key={i} style={s.hIcon}>{r==="goal"?"⚽":"❌"}</Text>)}
            <Text style={s.hSep}> VS </Text>
            {gd.ck.map((r,i) => <Text key={i} style={s.hIcon}>{r==="goal"?"⚽":"❌"}</Text>)}
          </View>
          <TouchableOpacity style={s.bigBtn} onPress={startGame} activeOpacity={0.82}>
            <Text style={s.bigBtnTxt}>REVANCHA</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Game screen ─────────────────────────────────────────────
  const isCpuKickPhase = isCpuPrep || isSaving;
  return (
    <View style={s.root}>
      <Field />

      {/* ── AIM DOT (yellow when kicking, blue when saving) ── */}
      {phase === "player_kick" && (
        <View style={[s.aimDot, { left: aimX-10, top: aimY-10, backgroundColor:"rgba(241,196,15,0.85)" }]} />
      )}
      {isCpuPrep && (
        <View style={[s.aimDot, { left: aimX-10, top: aimY-10, backgroundColor:"rgba(52,152,219,0.85)" }]} />
      )}

      {/* ── KEEPER ── */}
      {/* CPU keeper (green) during player kick */}
      {(phase === "player_kick" || isKicking) && (
        <Animated.View style={[s.keeperAbs, { transform:[{translateX: kAX}] }]}>
          <Keeper color="#27AE60" />
        </Animated.View>
      )}
      {/* Player keeper (blue) during cpu_preparing: positioned live by direction slider */}
      {isCpuPrep && (
        <View style={{ position:"absolute", left: kGoalX, top: K_Y, zIndex: 20 }}>
          <Keeper color="#2980B9" />
        </View>
      )}
      {/* Player keeper animated during cpu_flying */}
      {isSaving && (
        <Animated.View style={[s.keeperAbs, { transform:[{translateX: kAX}] }]}>
          <Keeper color="#2980B9" />
        </Animated.View>
      )}

      {/* ── BALL ── */}
      {(phase === "player_kick" || isKicking || isCpuKickPhase) && (
        <Animated.View style={[s.ballAbs, {
          transform:[{translateX:bAX},{translateY:bAY},{scale:bAS},{rotate:bRot}],
        }]}>
          <Ball />
        </Animated.View>
      )}

      {/* Score bar */}
      <View style={[s.scoreBar, { top: topPad+6 }]}>
        <View style={s.sbSide}>
          <Text style={s.sbLbl}>VOS</Text>
          <Text style={s.sbNum}>{gd.ps}</Text>
          <View style={s.dots}>
            {Array.from({length:TOTAL}).map((_,i) => {
              const r=gd.pk[i];
              return <View key={i} style={[s.dot, r==="goal"?s.dG:r==="saved"?s.dR:s.dGr]} />;
            })}
          </View>
        </View>
        <View style={s.roundBadge}>
          <Text style={s.roundTxt}>{Math.min(gd.round,TOTAL)}/{TOTAL}</Text>
        </View>
        <View style={[s.sbSide,{alignItems:"flex-end"}]}>
          <Text style={s.sbLbl}>CPU</Text>
          <Text style={s.sbNum}>{gd.cs}</Text>
          <View style={s.dots}>
            {Array.from({length:TOTAL}).map((_,i) => {
              const r=gd.ck[i];
              return <View key={i} style={[s.dot, r==="goal"?s.dG:r==="saved"?s.dR:s.dGr]} />;
            })}
          </View>
        </View>
      </View>

      {/* Turn label */}
      {!showMsg && (
        <View style={[s.turnWrap, { top: topPad+96 }]}>
          {phase==="player_kick" && <Text style={s.turnTxt}>TU TURNO — ajustá y pateá</Text>}
          {isKicking && <Text style={s.turnTxt}>¡Allá va!</Text>}
          {isCpuPrep && <Text style={[s.turnTxt,{color:"#3498DB"}]}>PATEA CPU — ¿Dónde atajás?</Text>}
          {isSaving && <Text style={[s.turnTxt,{color:"#3498DB"}]}>Vamos, arquero...</Text>}
        </View>
      )}

      {/* ── Sliders panel ── */}
      {(phase === "player_kick" || isKicking || isCpuPrep) && (
        <View style={[s.panel, { bottom: botPad+4 }]}>
          <SliderBar
            value={power} onValueChange={setPower}
            label={isCpuKickPhase ? "💪 FUERZA" : "⚡ POTENCIA"}
            color="#E74C3C" disabled={isKicking||isSaving}
          />
          <SliderBar
            value={height} onValueChange={setHeight}
            label={isCpuKickPhase ? "↕ ALCANCE" : "↕ ALTURA"}
            color="#3498DB" disabled={isKicking||isSaving}
          />
          <SliderBar
            value={direction} onValueChange={setDirection}
            label={isCpuKickPhase ? "↔ POSICIÓN" : "↔ DIRECCIÓN"}
            color="#F1C40F" center disabled={isKicking||isSaving}
          />
          <TouchableOpacity
            style={[s.actionBtn, (isKicking||isSaving) && s.actionBtnDis,
              isCpuKickPhase && s.actionBtnBlue]}
            onPress={isCpuKickPhase ? doSave : doKick}
            disabled={isKicking||isSaving}
            activeOpacity={0.8}
          >
            <Text style={s.actionBtnTxt}>
              {isKicking||isSaving ? "..." : isCpuKickPhase ? "🧤  ATAJAR" : "⚽  PATEAR"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Message overlay */}
      {showMsg && (
        <Animated.View style={[s.msgWrap, { opacity: msgOp }]}>
          <Text style={[s.msgTxt, { color: goodMsg?"#2ECC71":"#E74C3C" }]}>{msg}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// ─── Slider styles ────────────────────────────────────────────────────────────
const sl = StyleSheet.create({
  wrap: { gap: 4 },
  row: { flexDirection:"row", justifyContent:"space-between", alignItems:"center" },
  lbl: { color:"#7a9bb5", fontSize:10, fontWeight:"700", letterSpacing:1.4 },
  dim: { color:"#2a4060" },
  val: { fontSize:11, fontWeight:"800", letterSpacing:0.4, minWidth:58, textAlign:"right" },
  track: { height:6, backgroundColor:"#1e3d6e", borderRadius:3, overflow:"visible" },
  trackDim: { backgroundColor:"#142840" },
  fill: { position:"absolute", height:6, borderRadius:3, top:0 },
  thumb: {
    position:"absolute", width:THUMB_R*2, height:THUMB_R*2,
    borderRadius:THUMB_R, top:-(THUMB_R-3), borderWidth:2,
  },
  cMark: {
    position:"absolute", left:"50%", top:-2, width:2, height:10,
    backgroundColor:"rgba(255,255,255,0.3)", borderRadius:1,
    transform:[{translateX:-1}],
  },
});

// ─── Game styles ──────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex:1, backgroundColor:"#020c1a" },
  center: { flex:1, alignItems:"center", justifyContent:"center", gap:14, paddingHorizontal:32 },
  emoji: { fontSize:78 },
  title: { fontSize:50, fontWeight:"900", color:"#fff", letterSpacing:5 },
  sub: { fontSize:13, color:"#7a9bb5", textAlign:"center" },
  bigBtn: { marginTop:18, backgroundColor:"#2ECC71", paddingHorizontal:56, paddingVertical:17, borderRadius:50 },
  bigBtnTxt: { color:"#000", fontSize:20, fontWeight:"900", letterSpacing:3 },
  scoreRow: { flexDirection:"row", alignItems:"center", gap:24 },
  scoreSide: { alignItems:"center", gap:2 },
  goLbl: { color:"#7a9bb5", fontSize:12, fontWeight:"700", letterSpacing:2 },
  goNum: { color:"#fff", fontSize:68, fontWeight:"900" },
  dash: { color:"#7a9bb5", fontSize:44, fontWeight:"300" },
  hist: { flexDirection:"row", alignItems:"center", gap:4 },
  hIcon: { fontSize:20 },
  hSep: { color:"#7a9bb5", fontSize:11, fontWeight:"700", letterSpacing:1 },
  scoreBar: { position:"absolute", left:0, right:0, flexDirection:"row", justifyContent:"space-between", paddingHorizontal:22, zIndex:50 },
  sbSide: { alignItems:"flex-start", minWidth:90 },
  sbLbl: { color:"#7a9bb5", fontSize:10, fontWeight:"700", letterSpacing:2 },
  sbNum: { color:"#fff", fontSize:42, fontWeight:"900", lineHeight:48 },
  dots: { flexDirection:"row", gap:5, marginTop:2 },
  dot: { width:10, height:10, borderRadius:5 },
  dG: { backgroundColor:"#2ECC71" },
  dR: { backgroundColor:"#E74C3C" },
  dGr: { backgroundColor:"#1e3d6e" },
  roundBadge: { alignItems:"center", justifyContent:"flex-start", paddingTop:14 },
  roundTxt: { color:"#F1C40F", fontSize:16, fontWeight:"900" },
  turnWrap: { position:"absolute", left:0, right:0, alignItems:"center", zIndex:50 },
  turnTxt: {
    color:"#fff", fontSize:12, fontWeight:"800", letterSpacing:1.4,
    textShadowColor:"rgba(0,0,0,0.9)", textShadowOffset:{width:0,height:1}, textShadowRadius:4,
  },
  aimDot: {
    position:"absolute", width:20, height:20, borderRadius:10,
    borderWidth:2.5, borderColor:"#fff", zIndex:40,
  },
  keeperAbs: { position:"absolute", left:0, top:K_Y, zIndex:20 },
  ballAbs: { position:"absolute", left:0, top:0, width:BD, height:BD, zIndex:30 },
  panel: {
    position:"absolute", left:16, right:16,
    backgroundColor:"rgba(6,18,36,0.93)",
    borderRadius:18, borderWidth:1, borderColor:"rgba(255,255,255,0.07)",
    padding:14, gap:11, zIndex:60,
  },
  actionBtn: { marginTop:2, backgroundColor:"#2ECC71", paddingVertical:13, borderRadius:12, alignItems:"center" },
  actionBtnDis: { backgroundColor:"#1a4d30" },
  actionBtnBlue: { backgroundColor:"#2980B9" },
  actionBtnTxt: { color:"#000", fontSize:16, fontWeight:"900", letterSpacing:2 },
  msgWrap: { position:"absolute", top:"42%", left:0, right:0, alignItems:"center", zIndex:100 },
  msgTxt: {
    fontSize:40, fontWeight:"900", letterSpacing:2,
    textShadowColor:"rgba(0,0,0,0.9)", textShadowOffset:{width:0,height:2}, textShadowRadius:10,
  },
});
