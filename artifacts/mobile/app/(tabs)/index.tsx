import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  bumpCrowd, playGol, playKick, playSaved, playWhistle,
  resumeAudio, startCrowd, stopCrowd,
} from "../../utils/sounds";
import {
  Animated, Dimensions, PanResponder, Platform,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import Svg, {
  Circle, Defs, Ellipse, G, Line, LinearGradient,
  Path, RadialGradient, Rect, Stop, Text as SvgText,
} from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SW, height: SH } = Dimensions.get("window");
const IS_WEB = Platform.OS === "web";

// ─── Layout ───────────────────────────────────────────────────────────────────
const TOP_OFF   = IS_WEB ? 80 : 0;
const GOAL_W    = Math.min(SW * 0.76, 310);
const GOAL_H    = GOAL_W * 0.56;
const GOAL_LEFT = (SW - GOAL_W) / 2;
const GOAL_RIGHT= GOAL_LEFT + GOAL_W;
const GOAL_TOP  = TOP_OFF + SH * 0.09;
const GOAL_BOT  = GOAL_TOP + GOAL_H;
const POST_W    = 10;
const ZONE_W    = GOAL_W / 3;
const KW        = 58;
const KH        = 92;
const K_INIT_X  = SW / 2 - KW / 2;
const K_Y       = GOAL_BOT - KH + 4;
const SPOT_X    = SW / 2;
const SPOT_Y    = TOP_OFF + SH * 0.62;
const BR        = 20;
const BD        = BR * 2;
const TOTAL     = 5;
const THUMB_R   = 10;

// ─── Teams ────────────────────────────────────────────────────────────────────
interface Team {
  id: string; name: string; flag: string;
  home: string; away: string; sec: string;
}
const TEAMS: Team[] = [
  { id:"arg", name:"Argentina", flag:"🇦🇷", home:"#6AADD5", away:"#FFFFFF", sec:"#1A1A2E" },
  { id:"bra", name:"Brasil",    flag:"🇧🇷", home:"#F9DD16", away:"#009C3B", sec:"#002776" },
  { id:"fra", name:"Francia",   flag:"🇫🇷", home:"#002395", away:"#FFFFFF", sec:"#ED2939" },
  { id:"ger", name:"Alemania",  flag:"🇩🇪", home:"#EEEEEE", away:"#1A1A1A", sec:"#DD0000" },
  { id:"esp", name:"España",    flag:"🇪🇸", home:"#C60B1E", away:"#FFFF00", sec:"#FFC400" },
  { id:"uru", name:"Uruguay",   flag:"🇺🇾", home:"#5BBFDD", away:"#FFFFFF", sec:"#002D62" },
];

// ─── Skins ────────────────────────────────────────────────────────────────────
interface Skin { id: string; tone: string; hair: string; name: string }
const SKINS: Skin[] = [
  { id:"s1", tone:"#FCDDB0", hair:"#3D1C02", name:"Clara" },
  { id:"s2", tone:"#C68642", hair:"#1A0A00", name:"Media" },
  { id:"s3", tone:"#5C2F0D", hair:"#0D0500", name:"Oscura" },
];

// ─── Difficulty ───────────────────────────────────────────────────────────────
interface Diff { label: string; color: string; emoji: string
  keeperMiss: number; cpuCornerChance: number; cpuShotVariance: number }
const DIFF: Record<string,Diff> = {
  facil:  { label:"FÁCIL",  color:"#2ECC71", emoji:"😎", keeperMiss:0.42, cpuCornerChance:0.15, cpuShotVariance:0.30 },
  normal: { label:"NORMAL", color:"#F1C40F", emoji:"🤔", keeperMiss:0.12, cpuCornerChance:0.40, cpuShotVariance:0.15 },
  dificil:{ label:"DIFÍCIL",color:"#E74C3C", emoji:"😈", keeperMiss:0.0,  cpuCornerChance:0.75, cpuShotVariance:0.06 },
};

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "menu"|"player_kick"|"kick_anim"|"cpu_preparing"|"cpu_flying"|"gameover";
type KR = "goal"|"saved";
interface GD { round:number; ps:number; cs:number; pk:KR[]; ck:KR[] }
const INIT: GD = { round:1, ps:0, cs:0, pk:[], ck:[] };

// ─── Pure helpers ─────────────────────────────────────────────────────────────
function sliderTarget(dir:number, ht:number) {
  return {
    x: GOAL_LEFT + POST_W + dir * (GOAL_W - POST_W*2),
    y: GOAL_BOT  - POST_W - ht  * (GOAL_H - POST_W*2),
  };
}
function keeperGoalX(dir:number) {
  return Math.max(GOAL_LEFT, Math.min(GOAL_RIGHT - KW,
    GOAL_LEFT + POST_W + dir * (GOAL_W - POST_W*2) - KW/2));
}
function isSaved(tX:number, tY:number, kz:0|1|2, pwr:number) {
  const z = tX < GOAL_LEFT+ZONE_W ? 0 : tX < GOAL_LEFT+ZONE_W*2 ? 1 : 2;
  if (z !== kz) return false;
  const isTopCorner = tY < GOAL_TOP + GOAL_H*0.28;
  const isHighBall  = tY < GOAL_TOP + GOAL_H*0.5;
  if (isTopCorner && pwr > 0.72) return false;
  if (isHighBall  && pwr > 0.88) return Math.random() < 0.5;
  return true;
}
function dirToZone(dir:number): 0|1|2 { return dir < 0.34 ? 0 : dir < 0.67 ? 1 : 2; }
function cpuBallDest(zone:0|1|2, ht:number, variance:number) {
  const base = zone===0 ? 0.10 : zone===1 ? 0.5 : 0.90;
  const dir = Math.max(0.06, Math.min(0.94, base + (Math.random()-0.5)*variance));
  const htFinal = Math.max(0.1, Math.min(0.9, ht + (Math.random()-0.5)*variance));
  return {
    x: GOAL_LEFT + POST_W + dir    * (GOAL_W - POST_W*2) - BR,
    y: GOAL_BOT  - POST_W - htFinal* (GOAL_H - POST_W*2) - BR,
  };
}
function cpuPickZone(ballZone:0|1|2, missChance:number): 0|1|2 {
  if (Math.random() < missChance) {
    const wrong = ([0,1,2] as (0|1|2)[]).filter(z => z !== ballZone);
    return wrong[Math.floor(Math.random()*2)];
  }
  return ballZone;
}

// ─── Crowd row ────────────────────────────────────────────────────────────────
const CC = ["#E74C3C","#3498DB","#2ECC71","#F1C40F","#9B59B6","#E67E22",
            "#1ABC9C","#E91E63","#FF9F43","#5F27CD","#C0392B","#2980B9",
            "#27AE60","#D4AC0D","#8E44AD","#00B5D8","#F97F51","#6C5CE7"];
const SK = ["#d4a373","#c68642","#e8b89a","#8d5524","#fcddb0","#a0522d"];

function CrowdRow({ sx,sy,n,dir,waving=false }: { sx:number;sy:number;n:number;dir:1|-1;waving?:boolean }) {
  return (
    <G>
      {Array.from({length:n}).map((_,i) => {
        const cx = sx + dir*i*13;
        const cy = sy + (i%3)*8;
        const arm = waving && i%2===0;
        return (
          <G key={i}>
            <Circle cx={cx} cy={cy-8} r={5.5} fill={SK[i%SK.length]} />
            <Rect x={cx-5} y={cy-2} width={10} height={13} fill={CC[i%CC.length]} rx={3} />
            {arm && <Line x1={cx-5} y1={cy+2} x2={cx-12} y2={cy-5} stroke={CC[(i+3)%CC.length]} strokeWidth={2.5} strokeLinecap="round" />}
            {arm && <Line x1={cx+5} y1={cy+2} x2={cx+12} y2={cy-5} stroke={CC[(i+5)%CC.length]} strokeWidth={2.5} strokeLinecap="round" />}
          </G>
        );
      })}
    </G>
  );
}

// ─── Field SVG ────────────────────────────────────────────────────────────────
const Field = React.memo(function Field() {
  const nVS = (GOAL_W - POST_W*2) / 8;
  return (
    <Svg width={SW} height={SH} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0"    stopColor="#010812" />
          <Stop offset="0.5"  stopColor="#0a1c34" />
          <Stop offset="1"    stopColor="#0d2240" />
        </LinearGradient>
        <LinearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0"   stopColor="#1a5c28" />
          <Stop offset="0.6" stopColor="#144e20" />
          <Stop offset="1"   stopColor="#0d3618" />
        </LinearGradient>
        <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
          <Stop offset="0"    stopColor="#fffde7" stopOpacity={0.95} />
          <Stop offset="0.4"  stopColor="#fffde7" stopOpacity={0.45} />
          <Stop offset="1"    stopColor="#fffde7" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="post" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#d0d0d0"/><Stop offset="0.5" stopColor="#ffffff"/>
          <Stop offset="1" stopColor="#b0b0b0"/>
        </LinearGradient>
      </Defs>

      <Rect x={0} y={0} width={SW} height={GOAL_BOT+8} fill="url(#sky)" />
      <Rect x={0} y={GOAL_BOT} width={SW} height={SH-GOAL_BOT} fill="url(#grass)" />

      {/* Grass stripes */}
      {[0,2,4].map(i => (
        <Rect key={i} x={0} y={GOAL_BOT+i*(SH-GOAL_BOT)/6}
          width={SW} height={(SH-GOAL_BOT)/12} fill="#1e6b32" opacity={0.4} />
      ))}

      {/* Stadium lights */}
      <Circle cx={18}    cy={GOAL_TOP-26} r={44} fill="url(#glow)" />
      <Circle cx={18}    cy={GOAL_TOP-26} r={8}  fill="#ffffee" />
      <Circle cx={SW-18} cy={GOAL_TOP-26} r={44} fill="url(#glow)" />
      <Circle cx={SW-18} cy={GOAL_TOP-26} r={8}  fill="#ffffee" />

      {/* Crowd stands – multiple rows for depth */}
      {/* Behind goal */}
      <CrowdRow sx={GOAL_LEFT-12} sy={GOAL_TOP+10} n={5} dir={-1} waving />
      <CrowdRow sx={GOAL_LEFT-10} sy={GOAL_TOP+32} n={4} dir={-1} />
      <CrowdRow sx={GOAL_LEFT-8}  sy={GOAL_TOP+54} n={3} dir={-1} />
      <CrowdRow sx={GOAL_RIGHT+12} sy={GOAL_TOP+10} n={5} dir={1} waving />
      <CrowdRow sx={GOAL_RIGHT+10} sy={GOAL_TOP+32} n={4} dir={1} />
      <CrowdRow sx={GOAL_RIGHT+8}  sy={GOAL_TOP+54} n={3} dir={1} />
      {/* Sideline crowd */}
      <CrowdRow sx={12}    sy={GOAL_BOT+24} n={6} dir={1} waving />
      <CrowdRow sx={12}    sy={GOAL_BOT+52} n={5} dir={1} />
      <CrowdRow sx={12}    sy={GOAL_BOT+80} n={4} dir={1} />
      <CrowdRow sx={SW-12} sy={GOAL_BOT+24} n={6} dir={-1} waving />
      <CrowdRow sx={SW-12} sy={GOAL_BOT+52} n={5} dir={-1} />
      <CrowdRow sx={SW-12} sy={GOAL_BOT+80} n={4} dir={-1} />

      {/* Net */}
      {[0.2,0.4,0.6,0.8].map(f => (
        <Line key={f} x1={GOAL_LEFT+POST_W} y1={GOAL_TOP+POST_W+f*(GOAL_H-POST_W)}
          x2={GOAL_RIGHT-POST_W} y2={GOAL_TOP+POST_W+f*(GOAL_H-POST_W)}
          stroke="rgba(200,200,200,0.2)" strokeWidth={1} />
      ))}
      {Array.from({length:9}).map((_,i) => (
        <Line key={i} x1={GOAL_LEFT+POST_W+i*nVS} y1={GOAL_TOP+POST_W}
          x2={GOAL_LEFT+POST_W+i*nVS} y2={GOAL_BOT}
          stroke="rgba(200,200,200,0.16)" strokeWidth={1} />
      ))}

      {/* Goal posts */}
      <Rect x={GOAL_LEFT} y={GOAL_TOP} width={POST_W} height={GOAL_H} fill="url(#post)" rx={4} />
      <Rect x={GOAL_RIGHT-POST_W} y={GOAL_TOP} width={POST_W} height={GOAL_H} fill="url(#post)" rx={4} />
      <Rect x={GOAL_LEFT} y={GOAL_TOP} width={GOAL_W} height={POST_W} fill="url(#post)" rx={4} />
      <Rect x={GOAL_LEFT} y={GOAL_BOT} width={GOAL_W} height={5} fill="rgba(0,0,0,0.3)" />

      {/* Field markings */}
      <Line x1={GOAL_LEFT-35} y1={GOAL_BOT} x2={GOAL_RIGHT+35} y2={GOAL_BOT}
        stroke="rgba(255,255,255,0.45)" strokeWidth={2} />
      <Line x1={GOAL_LEFT-55} y1={GOAL_BOT} x2={GOAL_LEFT-55} y2={GOAL_BOT+135}
        stroke="rgba(255,255,255,0.28)" strokeWidth={2} />
      <Line x1={GOAL_RIGHT+55} y1={GOAL_BOT} x2={GOAL_RIGHT+55} y2={GOAL_BOT+135}
        stroke="rgba(255,255,255,0.28)" strokeWidth={2} />
      <Line x1={GOAL_LEFT-55} y1={GOAL_BOT+135} x2={GOAL_RIGHT+55} y2={GOAL_BOT+135}
        stroke="rgba(255,255,255,0.28)" strokeWidth={2} />
      <Circle cx={SPOT_X} cy={SPOT_Y} r={4.5} fill="rgba(255,255,255,0.5)" />
      <Path d={`M ${SPOT_X-70} ${SPOT_Y-38} Q ${SPOT_X} ${SPOT_Y-105} ${SPOT_X+70} ${SPOT_Y-38}`}
        stroke="rgba(255,255,255,0.2)" strokeWidth={2} fill="none" />
    </Svg>
  );
});

// ─── Goalkeeper SVG (realistic) ───────────────────────────────────────────────
function GoalkeeperSVG({
  jersey, secondary, skin, hair, diveDir=0, num="1",
}: {
  jersey:string; secondary:string; skin:string; hair:string;
  diveDir?:-1|0|1; num?:string;
}) {
  const cx = 29; // center of viewBox
  const tilt = diveDir * 14;

  // Arm coordinates based on diveDir
  const laX2 = diveDir===-1 ? cx-28 : diveDir===1 ? cx-16 : cx-18;
  const laY2 = diveDir===-1 ? 24      : diveDir===1 ? 42     : 40;
  const raX2 = diveDir===1  ? cx+28  : diveDir===-1 ? cx+16  : cx+18;
  const raY2 = diveDir===1  ? 24      : diveDir===-1 ? 42     : 40;
  const gloveL = { cx: laX2+(diveDir===-1?-6:0), cy: laY2+(diveDir===-1?0:4) };
  const gloveR = { cx: raX2+(diveDir===1?6:0),   cy: raY2+(diveDir===1?0:4) };

  return (
    <Svg width={KW} height={KH} viewBox="0 0 58 92">
      <G transform={`translate(${cx},46) rotate(${tilt}) translate(${-cx},-46)`}>
        {/* Shadow */}
        <Ellipse cx={cx} cy={90} rx={16} ry={4} fill="rgba(0,0,0,0.25)" />

        {/* Boots */}
        <Rect x={cx-18} y={74} width={15} height={10} fill="#1a1a1a" rx={4} />
        <Rect x={cx+3}  y={74} width={15} height={10} fill="#1a1a1a" rx={4} />
        <Rect x={cx-20} y={80} width={17} height={5}  fill="#111"    rx={2} />
        <Rect x={cx+3}  y={80} width={17} height={5}  fill="#111"    rx={2} />

        {/* Socks */}
        <Rect x={cx-16} y={64} width={12} height={14} fill={secondary} rx={2} />
        <Rect x={cx+4}  y={64} width={12} height={14} fill={secondary} rx={2} />
        <Rect x={cx-16} y={64} width={12} height={3}  fill={jersey} rx={1} />
        <Rect x={cx+4}  y={64} width={12} height={3}  fill={jersey} rx={1} />

        {/* Shorts */}
        <Rect x={cx-17} y={52} width={14} height={16} fill={secondary} rx={3} />
        <Rect x={cx+3}  y={52} width={14} height={16} fill={secondary} rx={3} />
        <Line x1={cx-1} y1={52} x2={cx-1} y2={68} stroke="rgba(255,255,255,0.15)" strokeWidth={2} />

        {/* Left arm */}
        <Line x1={cx-10} y1={30} x2={laX2} y2={laY2}
          stroke={jersey} strokeWidth={9} strokeLinecap="round" />
        {/* Right arm */}
        <Line x1={cx+10} y1={30} x2={raX2} y2={raY2}
          stroke={jersey} strokeWidth={9} strokeLinecap="round" />

        {/* Jersey body */}
        <Rect x={cx-18} y={22} width={36} height={34} fill={jersey} rx={6} />
        {/* Jersey stripe */}
        <Rect x={cx-5}  y={22} width={10} height={34} fill={secondary} opacity={0.35} rx={2} />
        {/* Jersey number */}
        <SvgText x={cx} y={43} textAnchor="middle" fontSize={12} fontWeight="bold"
          fill={secondary === "#FFFFFF" || secondary === "#EEEEEE" ? "#000" : "#fff"}>
          {num}
        </SvgText>

        {/* Gloves (yellow = keeper gloves) */}
        <Circle cx={gloveL.cx} cy={gloveL.cy} r={6.5} fill="#F39C12" />
        <Circle cx={gloveL.cx} cy={gloveL.cy} r={4}   fill="#E67E22" />
        <Circle cx={gloveR.cx} cy={gloveR.cy} r={6.5} fill="#F39C12" />
        <Circle cx={gloveR.cx} cy={gloveR.cy} r={4}   fill="#E67E22" />

        {/* Neck */}
        <Rect x={cx-5} y={12} width={10} height={12} fill={skin} />

        {/* Head */}
        <Circle cx={cx} cy={11} r={12} fill={skin} />
        {/* Hair */}
        <Path d={`M ${cx-12} 8 Q ${cx-8} ${0} ${cx} ${-1} Q ${cx+8} ${0} ${cx+12} 8`}
          fill={hair} />
        <Rect x={cx-12} y={-2} width={24} height={6} fill={hair} rx={3} />
        {/* Eyes */}
        <Circle cx={cx-5} cy={9}  r={2.5} fill="#fff" />
        <Circle cx={cx+5} cy={9}  r={2.5} fill="#fff" />
        <Circle cx={cx-4.5} cy={9.5} r={1.4} fill="#333" />
        <Circle cx={cx+5.5} cy={9.5} r={1.4} fill="#333" />
        {/* Eyebrows */}
        <Rect x={cx-7} y={5.5} width={5} height={1.5} fill={hair} rx={1} />
        <Rect x={cx+2} y={5.5} width={5} height={1.5} fill={hair} rx={1} />
        {/* Mouth */}
        <Path d={`M ${cx-3} 15 Q ${cx} 17 ${cx+3} 15`}
          stroke="#a05030" strokeWidth={1.2} fill="none" strokeLinecap="round" />
        {/* Ear */}
        <Ellipse cx={cx-12} cy={11} rx={2.5} ry={3.5} fill={skin} />
        <Ellipse cx={cx+12} cy={11} rx={2.5} ry={3.5} fill={skin} />
      </G>
    </Svg>
  );
}

// ─── Player figure at spot ────────────────────────────────────────────────────
function PlayerFigureSVG({ jersey, secondary, skin, hair }: {
  jersey:string; secondary:string; skin:string; hair:string;
}) {
  return (
    <Svg width={28} height={46}>
      {/* Boots */}
      <Rect x={3}  y={38} width={9} height={6}  fill="#111" rx={2} />
      <Rect x={16} y={38} width={9} height={6}  fill="#111" rx={2} />
      {/* Socks */}
      <Rect x={4}  y={28} width={8} height={13} fill={secondary} rx={2} />
      <Rect x={16} y={28} width={8} height={13} fill={secondary} rx={2} />
      {/* Shorts */}
      <Rect x={3}  y={22} width={9} height={10} fill={secondary} rx={2} />
      <Rect x={16} y={22} width={9} height={10} fill={secondary} rx={2} />
      {/* Jersey */}
      <Rect x={4}  y={11} width={20} height={14} fill={jersey} rx={4} />
      {/* Arms */}
      <Line x1={4}  y1={14} x2={-2} y2={24} stroke={jersey} strokeWidth={6} strokeLinecap="round" />
      <Line x1={24} y1={14} x2={30} y2={24} stroke={jersey} strokeWidth={6} strokeLinecap="round" />
      {/* Neck */}
      <Rect x={11} y={7}  width={6}  height={6}  fill={skin} />
      {/* Head */}
      <Circle cx={14} cy={6} r={7} fill={skin} />
      {/* Hair */}
      <Path d="M 7 5 Q 7 -1 14 -1 Q 21 -1 21 5" fill={hair} />
      {/* Eyes */}
      <Circle cx={11} cy={5} r={1.2} fill="#333" />
      <Circle cx={17} cy={5} r={1.2} fill="#333" />
    </Svg>
  );
}

// ─── Ball SVG ─────────────────────────────────────────────────────────────────
function Ball() {
  return (
    <Svg width={BD} height={BD}>
      <Defs>
        <RadialGradient id="bgrad" cx="35%" cy="35%" r="65%">
          <Stop offset="0"   stopColor="#ffffff" />
          <Stop offset="0.7" stopColor="#e8e8e8" />
          <Stop offset="1"   stopColor="#c0c0c0" />
        </RadialGradient>
      </Defs>
      <Circle cx={BR} cy={BR} r={BR-1} fill="url(#bgrad)" stroke="#bbb" strokeWidth={1} />
      <Path d={`M${BR},${BR-9} L${BR+8},${BR-3} L${BR+8},${BR+4} L${BR},${BR+9} L${BR-8},${BR+4} L${BR-8},${BR-3} Z`} fill="#111" />
      <Path d={`M${BR-10},${BR-11} L${BR-4},${BR-16} L${BR+2},${BR-14} L${BR+2},${BR-8} L${BR-4},${BR-5} L${BR-10},${BR-7} Z`} fill="#111" />
      <Path d={`M${BR+10},${BR-11} L${BR+4},${BR-16} L${BR-2},${BR-14} L${BR-2},${BR-8} L${BR+4},${BR-5} L${BR+10},${BR-7} Z`} fill="#111" />
    </Svg>
  );
}

// ─── Banner Ad ────────────────────────────────────────────────────────────────
function BannerAd() {
  return (
    <View style={ad.wrap}>
      <Text style={ad.label}>PUBLICIDAD</Text>
      <View style={ad.inner}>
        <Text style={ad.adTxt}>📢 ¡Jugá sin publicidad con Premium!</Text>
        <TouchableOpacity style={ad.cta}><Text style={ad.ctaTxt}>VER</Text></TouchableOpacity>
      </View>
    </View>
  );
}
const ad = StyleSheet.create({
  wrap:  { backgroundColor:"#071426", borderTopWidth:1, borderTopColor:"rgba(255,255,255,0.08)", paddingHorizontal:14, paddingVertical:8 },
  label: { color:"#2a4060", fontSize:8, fontWeight:"700", letterSpacing:1.5, marginBottom:4 },
  inner: { flexDirection:"row", alignItems:"center", justifyContent:"space-between" },
  adTxt: { color:"#7a9bb5", fontSize:12, flex:1 },
  cta:   { backgroundColor:"#1a3a6e", paddingHorizontal:14, paddingVertical:6, borderRadius:8 },
  ctaTxt:{ color:"#6ab4ff", fontSize:11, fontWeight:"800" },
});

// ─── Compact Slider ───────────────────────────────────────────────────────────
function SliderBar({ value, onValueChange, label, color, center=false, disabled=false }: {
  value:number; onValueChange:(v:number)=>void;
  label:string; color:string; center?:boolean; disabled?:boolean;
}) {
  const trackRef = useRef<View>(null);
  const tPageX = useRef(0);
  const tWidth = useRef(SW - 48);
  const measure = () => trackRef.current?.measure((_x,_y,w,_h,px) => { tPageX.current=px; tWidth.current=Math.max(1,w); });
  const clamp = (px:number) => Math.max(0, Math.min(1, (px - tPageX.current) / tWidth.current));
  const panR = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder:  () => !disabled,
    onPanResponderGrant: (e) => { measure(); onValueChange(clamp(e.nativeEvent.pageX)); },
    onPanResponderMove:  (e) => { onValueChange(clamp(e.nativeEvent.pageX)); },
  })).current;

  const pct = value * 100;
  const fillL = center ? (value<0.5 ? `${pct}%` : "50%") : "0%";
  const fillW = center ? `${Math.abs(value-0.5)*100}%` : `${pct}%`;
  let disp: string;
  if (center) {
    if (value>0.52) disp=`▶ ${Math.round((value-0.5)*200)}`;
    else if (value<0.48) disp=`◀ ${Math.round((0.5-value)*200)}`;
    else disp="CENTRO";
  } else disp=`${Math.round(pct)}%`;

  return (
    <View style={sl.wrap}>
      <View style={sl.row}>
        <Text style={[sl.lbl, disabled&&sl.dim]}>{label}</Text>
        <Text style={[sl.val, {color: disabled?"#2a4060":color}]}>{disp}</Text>
      </View>
      <View ref={trackRef} style={[sl.track, disabled&&sl.trackDim]}
        onLayout={measure} hitSlop={{top:16,bottom:16}}
        {...(!disabled ? panR.panHandlers : {})}>
        {center && <View style={sl.cMark} />}
        <View style={[sl.fill, {left:fillL as `${number}%`, width:fillW as `${number}%`, backgroundColor:disabled?"#2a4060":color}]} />
        <View style={[sl.thumb, {left:`${pct}%` as `${number}%`, transform:[{translateX:-THUMB_R}], backgroundColor:disabled?"#2a4060":color, borderColor:disabled?"#1e3050":"#fff"}]} />
      </View>
    </View>
  );
}

// ─── Main Game ────────────────────────────────────────────────────────────────
export default function PenaltyGame() {
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (IS_WEB ? 67 : 0);
  const botPad = insets.bottom || (IS_WEB ? 34 : 0);

  // Game setup selections
  const [diffKey, setDiffKey]   = useState<string>("normal");
  const [myTeamIdx, setMyTeamIdx]   = useState(0);
  const [cpuTeamIdx, setCpuTeamIdx] = useState(1);
  const [skinIdx, setSkinIdx]   = useState(0);

  const [phase, setPhaseState]  = useState<Phase>("menu");
  const phaseRef = useRef<Phase>("menu");
  function setPhase(p:Phase) { phaseRef.current=p; setPhaseState(p); }

  const [gd, setGd] = useState<GD>(INIT);
  const gdRef = useRef<GD>(INIT);
  function upGd(d:GD) { gdRef.current=d; setGd(d); }

  const [msg, setMsg]       = useState("");
  const [showMsg, setShowMsg] = useState(false);
  const [goodMsg, setGoodMsg] = useState(false);

  // Keeper dive direction for animation
  const [keeperDiveDir, setKeeperDiveDir] = useState<-1|0|1>(0);

  const [power,    setPower]    = useState(0.5);
  const [height,   setHeight]   = useState(0.5);
  const [direction,setDirection]= useState(0.5);

  const cpuZone = useRef<0|1|2>(1);
  const cpuHt   = useRef(0.5);

  const bAX  = useRef(new Animated.Value(SPOT_X-BR)).current;
  const bAY  = useRef(new Animated.Value(SPOT_Y-BR)).current;
  const bAS  = useRef(new Animated.Value(1)).current;
  const bAR  = useRef(new Animated.Value(0)).current;
  const kAX  = useRef(new Animated.Value(K_INIT_X)).current;
  const msgOp= useRef(new Animated.Value(0)).current;

  function resetBall() {
    bAX.setValue(SPOT_X-BR); bAY.setValue(SPOT_Y-BR);
    bAS.setValue(1); bAR.setValue(0);
  }
  function flashMsg(m:string, good:boolean) {
    setMsg(m); setGoodMsg(good); setShowMsg(true);
    Animated.sequence([
      Animated.timing(msgOp, {toValue:1, duration:180, useNativeDriver:true}),
      Animated.delay(1000),
      Animated.timing(msgOp, {toValue:0, duration:200, useNativeDriver:true}),
    ]).start(() => setShowMsg(false));
  }

  const diff = DIFF[diffKey];
  const myTeam  = TEAMS[myTeamIdx];
  const cpuTeam = TEAMS[cpuTeamIdx];
  const skin    = SKINS[skinIdx];

  // ── Player kick ────────────────────────────────────────────────
  function doKick() {
    if (phaseRef.current !== "player_kick") return;
    setPhase("kick_anim");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    playKick();

    const {x:tX, y:tY} = sliderTarget(direction, height);
    const ballZone      = dirToZone(direction);
    const kz            = cpuPickZone(ballZone, diff.keeperMiss);
    const kX            = GOAL_LEFT + kz*ZONE_W + ZONE_W/2 - KW/2;
    const saved         = isSaved(tX, tY, kz, power);
    const isGoal        = !saved;

    setKeeperDiveDir(kz===0 ? -1 : kz===2 ? 1 : 0);
    Animated.spring(kAX, {toValue:kX, useNativeDriver:true, speed:13, bounciness:2}).start();

    const destX = isGoal ? tX-BR : kX+KW/2-BR;
    const destY = isGoal ? tY-BR : GOAL_BOT-BR-14;
    Animated.parallel([
      Animated.timing(bAX, {toValue:destX, duration:540, useNativeDriver:true}),
      Animated.timing(bAY, {toValue:destY, duration:540, useNativeDriver:true}),
      Animated.timing(bAS, {toValue:0.36,  duration:540, useNativeDriver:true}),
      Animated.timing(bAR, {toValue:4,     duration:540, useNativeDriver:true}),
    ]).start(() => {
      if (isGoal) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        playGol();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        playSaved();
      }
      flashMsg(isGoal ? "⚽  GOL!" : "🧤  ATAJADO!", isGoal);
      const cur = gdRef.current;
      const nd: GD = {...cur, ps:cur.ps+(isGoal?1:0), pk:[...cur.pk, isGoal?"goal":"saved"]};
      upGd(nd);

      setTimeout(() => {
        cpuZone.current = diff.cpuCornerChance > Math.random()
          ? (Math.random()<0.5 ? 0 : 2)  // CPU aims for corners on hard
          : Math.floor(Math.random()*3) as 0|1|2;
        cpuHt.current = Math.random()*0.7 + 0.1;
        resetBall(); kAX.setValue(K_INIT_X);
        setKeeperDiveDir(0);
        setPower(0.5); setHeight(0.5); setDirection(0.5);
        msgOp.setValue(0);
        playWhistle();
        setPhase("cpu_preparing");
      }, 1700);
    });
  }

  // ── Player saves ───────────────────────────────────────────────
  function doSave() {
    if (phaseRef.current !== "cpu_preparing") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const cDir = direction;
    const cHt  = height;
    const playerZone  = dirToZone(cDir);
    const cpuTargetZ  = cpuZone.current;
    const kTarget     = keeperGoalX(cDir);
    const {x:ballX, y:ballY} = cpuBallDest(cpuTargetZ, cpuHt.current, diff.cpuShotVariance);

    kAX.setValue(kTarget);
    setKeeperDiveDir(cDir < 0.4 ? -1 : cDir > 0.6 ? 1 : 0);
    setPhase("cpu_flying");

    Animated.sequence([
      Animated.spring(kAX, {toValue:kTarget+(cDir>0.5?16:-16), useNativeDriver:true, speed:55, bounciness:14}),
      Animated.spring(kAX, {toValue:kTarget,                   useNativeDriver:true, speed:38, bounciness:4}),
    ]).start();

    playKick();

    Animated.parallel([
      Animated.timing(bAX, {toValue:ballX, duration:540, useNativeDriver:true}),
      Animated.timing(bAY, {toValue:ballY, duration:540, useNativeDriver:true}),
      Animated.timing(bAS, {toValue:0.36,  duration:540, useNativeDriver:true}),
      Animated.timing(bAR, {toValue:-4,    duration:540, useNativeDriver:true}),
    ]).start(() => {
      const zoneMatch   = playerZone === cpuTargetZ;
      const cpuHigh     = cpuHt.current > 0.72;
      const htDelta     = Math.abs(cHt - cpuHt.current);
      const saved       = zoneMatch && !(cpuHigh && htDelta > 0.50);

      if (saved) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        playSaved();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        playGol();
      }
      flashMsg(saved ? "✋  ¡ATAJASTE!" : "💀  CPU GOL", saved);

      const cur = gdRef.current;
      const nd: GD = {
        round:cur.round+1, ps:cur.ps,
        cs:cur.cs+(saved?0:1),
        pk:cur.pk, ck:[...cur.ck, saved?"saved":"goal"],
      };
      upGd(nd);

      setTimeout(() => {
        if (nd.round > TOTAL) { setPhase("gameover"); stopCrowd(); return; }
        resetBall(); kAX.setValue(K_INIT_X);
        setKeeperDiveDir(0);
        setPower(0.5); setHeight(0.5); setDirection(0.5);
        msgOp.setValue(0);
        playWhistle();
        setPhase("player_kick");
      }, 1700);
    });
  }

  function startGame() {
    resumeAudio();
    resetBall(); kAX.setValue(K_INIT_X); msgOp.setValue(0);
    setKeeperDiveDir(0);
    setPower(0.5); setHeight(0.5); setDirection(0.5);
    const d = {...INIT}; gdRef.current=d; setGd(d);
    startCrowd();
    playWhistle();
    setPhase("player_kick");
  }

  useEffect(() => () => { stopCrowd(); }, []);

  const bRot = bAR.interpolate({inputRange:[0,4], outputRange:["0deg","1440deg"]});
  const isKicking   = phase==="kick_anim";
  const isSaving    = phase==="cpu_flying";
  const isCpuPrep   = phase==="cpu_preparing";
  const {x:aimX, y:aimY} = sliderTarget(direction, height);
  const kGoalX = keeperGoalX(direction);

  // ─── Menu ─────────────────────────────────────────────────────
  if (phase === "menu") return (
    <View style={s.root}>
      <Field />
      <ScrollView
        contentContainerStyle={[s.menuContent, {paddingTop:topPad+12, paddingBottom:botPad+12}]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.emoji}>⚽</Text>
        <Text style={s.title}>PENALES</Text>
        <Text style={s.sub}>5 turnos — pateá y atajá</Text>

        {/* Difficulty */}
        <View style={s.section}>
          <Text style={s.secLabel}>DIFICULTAD</Text>
          <View style={s.row3}>
            {Object.entries(DIFF).map(([k,d]) => (
              <TouchableOpacity key={k}
                style={[s.pill, diffKey===k && {backgroundColor:d.color, borderColor:d.color}]}
                onPress={() => setDiffKey(k)}>
                <Text style={s.pillEmoji}>{d.emoji}</Text>
                <Text style={[s.pillTxt, diffKey===k && {color:"#000"}]}>{d.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* My Team */}
        <View style={s.section}>
          <Text style={s.secLabel}>TU EQUIPO</Text>
          <View style={s.teamRow}>
            {TEAMS.map((t,i) => (
              <TouchableOpacity key={t.id}
                style={[s.teamBtn, myTeamIdx===i && {borderColor:t.home, borderWidth:3}]}
                onPress={() => { setMyTeamIdx(i); if (i===cpuTeamIdx) setCpuTeamIdx((i+1)%TEAMS.length); }}>
                <Text style={s.teamFlag}>{t.flag}</Text>
                <Text style={s.teamName}>{t.name.slice(0,3).toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* CPU Team */}
        <View style={s.section}>
          <Text style={s.secLabel}>RIVAL (CPU) {diff.emoji}</Text>
          <View style={s.teamRow}>
            {TEAMS.map((t,i) => (
              <TouchableOpacity key={t.id}
                style={[s.teamBtn, cpuTeamIdx===i && {borderColor:t.home, borderWidth:3},
                  myTeamIdx===i && s.teamBtnDis]}
                disabled={myTeamIdx===i}
                onPress={() => setCpuTeamIdx(i)}>
                <Text style={[s.teamFlag, myTeamIdx===i && {opacity:0.25}]}>{t.flag}</Text>
                <Text style={[s.teamName, myTeamIdx===i && {opacity:0.25}]}>{t.name.slice(0,3).toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Skin */}
        <View style={s.section}>
          <Text style={s.secLabel}>JUGADOR</Text>
          <View style={s.skinRow}>
            {SKINS.map((sk,i) => (
              <TouchableOpacity key={sk.id}
                style={[s.skinBtn, skinIdx===i && {borderColor:"#fff", borderWidth:3}]}
                onPress={() => setSkinIdx(i)}>
                <View style={[s.skinCircle, {backgroundColor:sk.tone}]}>
                  {skinIdx===i && <Text style={s.skinCheck}>✓</Text>}
                </View>
                <Text style={s.skinName}>{sk.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Match preview */}
        <View style={s.matchPreview}>
          <View style={s.mpTeam}>
            <Text style={s.mpFlag}>{myTeam.flag}</Text>
            <Text style={s.mpName}>{myTeam.name}</Text>
          </View>
          <View style={s.mpVs}><Text style={s.mpVsTxt}>VS</Text></View>
          <View style={s.mpTeam}>
            <Text style={s.mpFlag}>{cpuTeam.flag}</Text>
            <Text style={s.mpName}>{cpuTeam.name}</Text>
          </View>
        </View>

        <TouchableOpacity style={[s.bigBtn, {backgroundColor:diff.color}]}
          onPress={startGame} activeOpacity={0.82}>
          <Text style={s.bigBtnTxt}>⚽  JUGAR</Text>
        </TouchableOpacity>
      </ScrollView>
      <BannerAd />
    </View>
  );

  // ─── Game Over ────────────────────────────────────────────────
  if (phase === "gameover") {
    const won=gd.ps>gd.cs, tie=gd.ps===gd.cs;
    return (
      <View style={s.root}>
        <Field />
        <View style={[s.center, {paddingTop:topPad}]}>
          <Text style={s.emoji}>{won?"🏆":tie?"🤝":"😤"}</Text>
          <Text style={[s.title, {color:won?"#2ECC71":tie?"#F1C40F":"#E74C3C"}]}>
            {won?"¡GANASTE!":tie?"EMPATE":"PERDISTE"}
          </Text>
          <View style={s.scoreRow}>
            <View style={s.scoreSide}>
              <Text style={s.mpFlag}>{myTeam.flag}</Text>
              <Text style={s.goNum}>{gd.ps}</Text>
            </View>
            <Text style={s.dash}>-</Text>
            <View style={s.scoreSide}>
              <Text style={s.mpFlag}>{cpuTeam.flag}</Text>
              <Text style={s.goNum}>{gd.cs}</Text>
            </View>
          </View>
          <View style={s.hist}>
            {gd.pk.map((r,i) => <Text key={i} style={s.hIcon}>{r==="goal"?"⚽":"❌"}</Text>)}
            <Text style={s.hSep}> — </Text>
            {gd.ck.map((r,i) => <Text key={i} style={s.hIcon}>{r==="goal"?"⚽":"❌"}</Text>)}
          </View>
          <TouchableOpacity style={s.bigBtn} onPress={() => setPhase("menu")} activeOpacity={0.82}>
            <Text style={s.bigBtnTxt}>⬅  MENÚ</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.bigBtn,{backgroundColor:"#2ECC71",marginTop:8}]} onPress={startGame} activeOpacity={0.82}>
            <Text style={s.bigBtnTxt}>🔄  REVANCHA</Text>
          </TouchableOpacity>
        </View>
        <BannerAd />
      </View>
    );
  }

  // ─── Game screen ──────────────────────────────────────────────
  const isCpuKickPhase = isCpuPrep || isSaving;
  return (
    <View style={s.root}>
      <Field />

      {/* Aim dot */}
      {phase==="player_kick" && (
        <View style={[s.aimDot, {left:aimX-10, top:aimY-10, backgroundColor:"rgba(241,196,15,0.9)"}]} />
      )}
      {isCpuPrep && (
        <View style={[s.aimDot, {left:aimX-10, top:aimY-10, backgroundColor:"rgba(52,152,219,0.9)"}]} />
      )}

      {/* CPU keeper (opponent jersey) during player kick */}
      {(phase==="player_kick" || isKicking) && (
        <Animated.View style={[s.keeperAbs, {transform:[{translateX:kAX}]}]}>
          <GoalkeeperSVG
            jersey={cpuTeam.home} secondary={cpuTeam.sec}
            skin={SKINS[1].tone} hair={SKINS[1].hair}
            diveDir={keeperDiveDir} num="1"
          />
        </Animated.View>
      )}

      {/* Player's keeper (my jersey) during cpu_preparing — live position */}
      {isCpuPrep && (
        <View style={{position:"absolute", left:kGoalX, top:K_Y, zIndex:20}}>
          <GoalkeeperSVG
            jersey={myTeam.home} secondary={myTeam.sec}
            skin={skin.tone} hair={skin.hair}
            diveDir={0} num="1"
          />
        </View>
      )}
      {/* Player's keeper animated during cpu_flying */}
      {isSaving && (
        <Animated.View style={[s.keeperAbs, {transform:[{translateX:kAX}]}]}>
          <GoalkeeperSVG
            jersey={myTeam.home} secondary={myTeam.sec}
            skin={skin.tone} hair={skin.hair}
            diveDir={keeperDiveDir} num="1"
          />
        </Animated.View>
      )}

      {/* Player figure at spot */}
      {(phase==="player_kick" || isCpuPrep) && (
        <View style={{position:"absolute", left:SPOT_X-14, top:SPOT_Y-46, zIndex:18}}>
          <PlayerFigureSVG
            jersey={myTeam.home} secondary={myTeam.sec}
            skin={skin.tone} hair={skin.hair}
          />
        </View>
      )}

      {/* Ball */}
      {(phase==="player_kick"||isKicking||isCpuKickPhase) && (
        <Animated.View style={[s.ballAbs, {transform:[{translateX:bAX},{translateY:bAY},{scale:bAS},{rotate:bRot}]}]}>
          <Ball />
        </Animated.View>
      )}

      {/* Score bar */}
      <View style={[s.scoreBar, {top:topPad+6}]}>
        <View style={s.sbSide}>
          <View style={s.sbTeamRow}>
            <Text style={s.sbFlag}>{myTeam.flag}</Text>
            <Text style={s.sbLbl}>{myTeam.name.toUpperCase()}</Text>
          </View>
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
          <Text style={{color:diff.color, fontSize:9, fontWeight:"800"}}>{diff.label}</Text>
        </View>
        <View style={[s.sbSide,{alignItems:"flex-end"}]}>
          <View style={s.sbTeamRow}>
            <Text style={s.sbFlag}>{cpuTeam.flag}</Text>
            <Text style={s.sbLbl}>{cpuTeam.name.toUpperCase()}</Text>
          </View>
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
        <View style={[s.turnWrap, {top:topPad+110}]}>
          {phase==="player_kick" && <Text style={s.turnTxt}>TU TURNO — ajustá y pateá</Text>}
          {isKicking    && <Text style={s.turnTxt}>¡Allá va!</Text>}
          {isCpuPrep    && <Text style={[s.turnTxt,{color:"#3498DB"}]}>PATEA CPU — ¿Dónde atajás?</Text>}
          {isSaving     && <Text style={[s.turnTxt,{color:"#3498DB"}]}>Vamos arquero...</Text>}
        </View>
      )}

      {/* Slider panel */}
      {(phase==="player_kick"||isKicking||isCpuPrep) && (
        <View style={[s.panel, {bottom:botPad+4}]}>
          <SliderBar value={power} onValueChange={setPower}
            label={isCpuKickPhase?"💪 FUERZA":"⚡ POTENCIA"}
            color="#E74C3C" disabled={isKicking||isSaving} />
          <SliderBar value={height} onValueChange={setHeight}
            label={isCpuKickPhase?"↕ ALCANCE":"↕ ALTURA"}
            color="#3498DB" disabled={isKicking||isSaving} />
          <SliderBar value={direction} onValueChange={setDirection}
            label={isCpuKickPhase?"↔ POSICIÓN":"↔ DIRECCIÓN"}
            color="#F1C40F" center disabled={isKicking||isSaving} />
          <TouchableOpacity
            style={[s.actionBtn, (isKicking||isSaving)&&s.actionBtnDis,
              isCpuKickPhase&&{backgroundColor:myTeam.home}]}
            onPress={isCpuKickPhase ? doSave : doKick}
            disabled={isKicking||isSaving} activeOpacity={0.8}>
            <Text style={[s.actionBtnTxt, {color: isCpuKickPhase&&myTeam.home==="#EEEEEE"?"#000":"#000"}]}>
              {isKicking||isSaving ? "..." : isCpuKickPhase ? "🧤  ATAJAR" : "⚽  PATEAR"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Message overlay */}
      {showMsg && (
        <Animated.View style={[s.msgWrap, {opacity:msgOp}]}>
          <Text style={[s.msgTxt, {color:goodMsg?"#2ECC71":"#E74C3C"}]}>{msg}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// ─── Slider styles ─────────────────────────────────────────────────────────────
const sl = StyleSheet.create({
  wrap: {gap:4},
  row:  {flexDirection:"row", justifyContent:"space-between", alignItems:"center"},
  lbl:  {color:"#7a9bb5", fontSize:10, fontWeight:"700", letterSpacing:1.4},
  dim:  {color:"#2a4060"},
  val:  {fontSize:11, fontWeight:"800", letterSpacing:0.4, minWidth:58, textAlign:"right"},
  track:{height:6, backgroundColor:"#1e3d6e", borderRadius:3, overflow:"visible"},
  trackDim:{backgroundColor:"#142840"},
  fill: {position:"absolute", height:6, borderRadius:3, top:0},
  thumb:{position:"absolute", width:THUMB_R*2, height:THUMB_R*2, borderRadius:THUMB_R, top:-(THUMB_R-3), borderWidth:2},
  cMark:{position:"absolute", left:"50%", top:-2, width:2, height:10, backgroundColor:"rgba(255,255,255,0.3)", borderRadius:1, transform:[{translateX:-1}]},
});

// ─── Main styles ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:   {flex:1, backgroundColor:"#020c1a"},
  center: {flex:1, alignItems:"center", justifyContent:"center", gap:12, paddingHorizontal:32},
  menuContent: {alignItems:"center", gap:18, paddingHorizontal:20},
  emoji:  {fontSize:72},
  title:  {fontSize:48, fontWeight:"900", color:"#fff", letterSpacing:5},
  sub:    {fontSize:13, color:"#7a9bb5", textAlign:"center"},
  section:{width:"100%", gap:10},
  secLabel:{color:"#7a9bb5", fontSize:10, fontWeight:"800", letterSpacing:2.5, textAlign:"center"},
  row3:   {flexDirection:"row", gap:10, justifyContent:"center"},
  pill:   {flex:1, alignItems:"center", paddingVertical:10, borderRadius:14, borderWidth:1.5, borderColor:"#1e3d6e", backgroundColor:"#071428", gap:3},
  pillEmoji:{fontSize:20},
  pillTxt:{color:"#7a9bb5", fontSize:10, fontWeight:"800", letterSpacing:1},
  teamRow:{flexDirection:"row", gap:8, justifyContent:"center", flexWrap:"wrap"},
  teamBtn:{alignItems:"center", paddingVertical:8, paddingHorizontal:10, borderRadius:14, borderWidth:1.5, borderColor:"#1e3d6e", backgroundColor:"#071428", minWidth:50},
  teamBtnDis:{opacity:0.3},
  teamFlag:{fontSize:26},
  teamName:{color:"#7a9bb5", fontSize:9, fontWeight:"800", letterSpacing:1, marginTop:2},
  skinRow:{flexDirection:"row", gap:18, justifyContent:"center"},
  skinBtn:{alignItems:"center", gap:6},
  skinCircle:{width:44, height:44, borderRadius:22, alignItems:"center", justifyContent:"center", borderWidth:2, borderColor:"rgba(255,255,255,0.15)"},
  skinCheck:{color:"#fff", fontSize:18, fontWeight:"900"},
  skinName:{color:"#7a9bb5", fontSize:10, fontWeight:"700"},
  matchPreview:{flexDirection:"row", alignItems:"center", gap:20, backgroundColor:"rgba(255,255,255,0.04)", paddingHorizontal:28, paddingVertical:14, borderRadius:18, borderWidth:1, borderColor:"rgba(255,255,255,0.08)"},
  mpTeam:{alignItems:"center", gap:4},
  mpFlag:{fontSize:34},
  mpName:{color:"#fff", fontSize:11, fontWeight:"700"},
  mpVs:  {alignItems:"center"},
  mpVsTxt:{color:"#7a9bb5", fontSize:14, fontWeight:"900", letterSpacing:2},
  bigBtn:{marginTop:4, backgroundColor:"#F1C40F", paddingHorizontal:48, paddingVertical:16, borderRadius:50, alignSelf:"center"},
  bigBtnTxt:{color:"#000", fontSize:18, fontWeight:"900", letterSpacing:2},
  scoreRow:{flexDirection:"row", alignItems:"center", gap:20},
  scoreSide:{alignItems:"center", gap:2},
  goNum:  {color:"#fff", fontSize:64, fontWeight:"900"},
  dash:   {color:"#7a9bb5", fontSize:40, fontWeight:"300"},
  hist:   {flexDirection:"row", alignItems:"center", gap:4},
  hIcon:  {fontSize:18},
  hSep:   {color:"#7a9bb5", fontSize:11, fontWeight:"700"},
  scoreBar:{position:"absolute", left:0, right:0, flexDirection:"row", justifyContent:"space-between", paddingHorizontal:18, zIndex:50},
  sbSide: {alignItems:"flex-start", minWidth:90},
  sbTeamRow:{flexDirection:"row", alignItems:"center", gap:4},
  sbFlag: {fontSize:14},
  sbLbl:  {color:"#7a9bb5", fontSize:9, fontWeight:"700", letterSpacing:1.5},
  sbNum:  {color:"#fff", fontSize:40, fontWeight:"900", lineHeight:46},
  dots:   {flexDirection:"row", gap:5, marginTop:2},
  dot:    {width:9, height:9, borderRadius:5},
  dG:     {backgroundColor:"#2ECC71"},
  dR:     {backgroundColor:"#E74C3C"},
  dGr:    {backgroundColor:"#1e3d6e"},
  roundBadge:{alignItems:"center", justifyContent:"flex-start", paddingTop:10},
  roundTxt:  {color:"#F1C40F", fontSize:15, fontWeight:"900"},
  turnWrap:  {position:"absolute", left:0, right:0, alignItems:"center", zIndex:50},
  turnTxt:   {color:"#fff", fontSize:12, fontWeight:"800", letterSpacing:1.4},
  aimDot:    {position:"absolute", width:20, height:20, borderRadius:10, borderWidth:2.5, borderColor:"#fff", zIndex:40},
  keeperAbs: {position:"absolute", left:0, top:K_Y, zIndex:20},
  ballAbs:   {position:"absolute", left:0, top:0, width:BD, height:BD, zIndex:30},
  panel:     {position:"absolute", left:16, right:16, backgroundColor:"rgba(6,18,36,0.94)", borderRadius:18, borderWidth:1, borderColor:"rgba(255,255,255,0.07)", padding:14, gap:11, zIndex:60},
  actionBtn: {marginTop:2, backgroundColor:"#2ECC71", paddingVertical:13, borderRadius:12, alignItems:"center"},
  actionBtnDis:{backgroundColor:"#1a4d30"},
  actionBtnTxt:{color:"#000", fontSize:16, fontWeight:"900", letterSpacing:2},
  msgWrap:   {position:"absolute", top:"42%", left:0, right:0, alignItems:"center", zIndex:100},
  msgTxt:    {fontSize:40, fontWeight:"900", letterSpacing:2},
});
