import * as Haptics from "expo-haptics";
import React, { useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SW } = Dimensions.get("window");
const GOAL_W = Math.min(SW * 0.88, 340);
const GOAL_H = GOAL_W * 0.58;
const POST_SIZE = 10;
const KEEPER_W = GOAL_W * 0.34;
const KEEPER_H = 36;
const BALL_R = 20;
const SPOT_GAP = 56;
const TOTAL_ROUNDS = 5;

type Zone = 0 | 1 | 2 | 3 | 4 | 5;
type KickResult = "goal" | "saved";

interface GameData {
  round: number;
  playerScore: number;
  cpuScore: number;
  playerKicks: KickResult[];
  cpuKicks: KickResult[];
}

type Phase = "home" | "player_turn" | "animating" | "game_over";

const INITIAL_DATA: GameData = {
  round: 1,
  playerScore: 0,
  cpuScore: 0,
  playerKicks: [],
  cpuKicks: [],
};

function keeperXForZone(zone: Zone): number {
  const col = zone % 3;
  return (col - 1) * (GOAL_W * 0.3);
}

function ballTargetForZone(zone: Zone): { x: number; y: number } {
  const col = zone % 3;
  const row = Math.floor(zone / 3);
  const x = (col - 1) * (GOAL_W * 0.29);
  const y = -(SPOT_GAP + GOAL_H * (row === 0 ? 0.82 : 0.32));
  return { x, y };
}

const ZONE_LABELS = ["↖", "↑", "↗", "↙", "↓", "↘"];
const ZONE_COLS = [0, 1, 2, 0, 1, 2];

export default function PenaltyGame() {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("home");
  const [gameData, setGameData] = useState<GameData>(INITIAL_DATA);
  const [shooterZone, setShooterZone] = useState<Zone | null>(null);
  const [keeperZone, setKeeperZone] = useState<Zone | null>(null);
  const [isCpuKick, setIsCpuKick] = useState(false);
  const [message, setMessage] = useState("");
  const [showMessage, setShowMessage] = useState(false);
  const [isGoalResult, setIsGoalResult] = useState(false);

  const ballX = useRef(new Animated.Value(0)).current;
  const ballY = useRef(new Animated.Value(0)).current;
  const ballScale = useRef(new Animated.Value(1)).current;
  const keeperAnim = useRef(new Animated.Value(0)).current;
  const msgOpacity = useRef(new Animated.Value(0)).current;
  const goalFlash = useRef(new Animated.Value(0)).current;
  const ballRotate = useRef(new Animated.Value(0)).current;

  function resetAnim() {
    ballX.setValue(0);
    ballY.setValue(0);
    ballScale.setValue(1);
    ballRotate.setValue(0);
    keeperAnim.setValue(0);
    msgOpacity.setValue(0);
    goalFlash.setValue(0);
  }

  function showMsg(msg: string, isGoal: boolean) {
    setMessage(msg);
    setIsGoalResult(isGoal);
    setShowMessage(true);
    Animated.sequence([
      Animated.timing(msgOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(msgOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setShowMessage(false));
  }

  function flashGoal(isGoal: boolean) {
    Animated.sequence([
      Animated.timing(goalFlash, { toValue: 1, duration: 150, useNativeDriver: false }),
      Animated.timing(goalFlash, { toValue: 0, duration: 300, useNativeDriver: false }),
    ]).start();
  }

  function animateKick(
    sZone: Zone,
    kZone: Zone,
    onDone: () => void
  ) {
    setShooterZone(sZone);
    setKeeperZone(kZone);
    const kx = keeperXForZone(kZone);
    const { x: bx, y: by } = ballTargetForZone(sZone);

    Animated.parallel([
      Animated.spring(keeperAnim, {
        toValue: kx,
        useNativeDriver: true,
        speed: 22,
        bounciness: 1,
      }),
      Animated.timing(ballX, { toValue: bx, duration: 460, useNativeDriver: true }),
      Animated.timing(ballY, { toValue: by, duration: 460, useNativeDriver: true }),
      Animated.timing(ballScale, { toValue: 0.36, duration: 460, useNativeDriver: true }),
      Animated.timing(ballRotate, { toValue: 3, duration: 460, useNativeDriver: true }),
    ]).start(onDone);
  }

  function startGame() {
    resetAnim();
    setShooterZone(null);
    setKeeperZone(null);
    setIsCpuKick(false);
    setGameData({ ...INITIAL_DATA });
    setPhase("player_turn");
  }

  function handlePlayerKick(zone: Zone) {
    if (phase !== "player_turn") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setPhase("animating");

    const kZone = (Math.floor(Math.random() * 6)) as Zone;
    const playerGoal = zone !== kZone;

    setIsCpuKick(false);
    animateKick(zone, kZone, () => {
      flashGoal(playerGoal);
      if (playerGoal) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showMsg("⚽  GOL!", true);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        showMsg("🧤  ATAJADO!", false);
      }

      const updatedData = {
        ...gameData,
        playerScore: gameData.playerScore + (playerGoal ? 1 : 0),
        playerKicks: [...gameData.playerKicks, playerGoal ? ("goal" as KickResult) : ("saved" as KickResult)],
      };

      setTimeout(() => {
        resetAnim();
        setShooterZone(null);
        setKeeperZone(null);
        setIsCpuKick(true);

        const cpuSZone = (Math.floor(Math.random() * 6)) as Zone;
        const cpuKZone = (Math.floor(Math.random() * 6)) as Zone;
        const cpuGoal = cpuSZone !== cpuKZone;

        setTimeout(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          animateKick(cpuSZone, cpuKZone, () => {
            flashGoal(cpuGoal);
            if (cpuGoal) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              showMsg("💀  CPU GOL", false);
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showMsg("✋  ¡LO ATAJASTE!", true);
            }

            const finalData: GameData = {
              round: updatedData.round + 1,
              playerScore: updatedData.playerScore,
              cpuScore: gameData.cpuScore + (cpuGoal ? 1 : 0),
              playerKicks: updatedData.playerKicks,
              cpuKicks: [...gameData.cpuKicks, cpuGoal ? ("goal" as KickResult) : ("saved" as KickResult)],
            };

            setTimeout(() => {
              resetAnim();
              setShooterZone(null);
              setKeeperZone(null);
              setIsCpuKick(false);
              setGameData(finalData);

              if (finalData.round > TOTAL_ROUNDS) {
                setPhase("game_over");
              } else {
                setPhase("player_turn");
              }
            }, 1600);
          });
        }, 900);
      }, 1800);
    });
  }

  const topPad = insets.top || (Platform.OS === "web" ? 67 : 0);
  const botPad = insets.bottom || (Platform.OS === "web" ? 34 : 0);

  const goalBgColor = goalFlash.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(20,40,20,0.0)", "rgba(46,204,113,0.35)"],
  });

  const spinDeg = ballRotate.interpolate({
    inputRange: [0, 3],
    outputRange: ["0deg", "1080deg"],
  });

  if (phase === "home") {
    return (
      <View style={[styles.root, { paddingTop: topPad, paddingBottom: botPad }]}>
        <View style={styles.homeContainer}>
          <Text style={styles.homeBig}>⚽</Text>
          <Text style={styles.homeTitle}>PENALES</Text>
          <Text style={styles.homeSub}>5 turnos · Elige la zona y anotá</Text>
          <TouchableOpacity style={styles.playBtn} onPress={startGame} activeOpacity={0.8}>
            <Text style={styles.playBtnText}>JUGAR</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (phase === "game_over") {
    const won = gameData.playerScore > gameData.cpuScore;
    const tie = gameData.playerScore === gameData.cpuScore;
    return (
      <View style={[styles.root, { paddingTop: topPad, paddingBottom: botPad }]}>
        <View style={styles.homeContainer}>
          <Text style={styles.homeBig}>{won ? "🏆" : tie ? "🤝" : "😤"}</Text>
          <Text style={[styles.homeTitle, { color: won ? "#2ECC71" : tie ? "#F1C40F" : "#E74C3C" }]}>
            {won ? "¡GANASTE!" : tie ? "EMPATE" : "PERDISTE"}
          </Text>
          <View style={styles.finalScore}>
            <View style={styles.finalSide}>
              <Text style={styles.finalLabel}>VOS</Text>
              <Text style={styles.finalNum}>{gameData.playerScore}</Text>
            </View>
            <Text style={styles.finalDash}>-</Text>
            <View style={styles.finalSide}>
              <Text style={styles.finalLabel}>CPU</Text>
              <Text style={styles.finalNum}>{gameData.cpuScore}</Text>
            </View>
          </View>
          <View style={styles.kicksRow}>
            {gameData.playerKicks.map((r, i) => (
              <Text key={i} style={styles.kickIcon}>{r === "goal" ? "⚽" : "❌"}</Text>
            ))}
            <Text style={styles.kickSep}>  VS  </Text>
            {gameData.cpuKicks.map((r, i) => (
              <Text key={i} style={styles.kickIcon}>{r === "goal" ? "⚽" : "❌"}</Text>
            ))}
          </View>
          <TouchableOpacity style={styles.playBtn} onPress={startGame} activeOpacity={0.8}>
            <Text style={styles.playBtnText}>REVANCHA</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: topPad, paddingBottom: botPad }]}>
      {/* Score Header */}
      <View style={styles.header}>
        <View style={styles.scoreSide}>
          <Text style={styles.scoreLabel}>VOS</Text>
          <Text style={styles.scoreNum}>{gameData.playerScore}</Text>
          <View style={styles.kicksLine}>
            {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => {
              const r = gameData.playerKicks[i];
              return (
                <View key={i} style={[styles.kickDot, r === "goal" ? styles.dotGoal : r === "saved" ? styles.dotSaved : styles.dotEmpty]} />
              );
            })}
          </View>
        </View>

        <View style={styles.roundBadge}>
          <Text style={styles.roundNum}>{Math.min(gameData.round, TOTAL_ROUNDS)}</Text>
          <Text style={styles.roundOf}>/{TOTAL_ROUNDS}</Text>
        </View>

        <View style={[styles.scoreSide, { alignItems: "flex-end" }]}>
          <Text style={styles.scoreLabel}>CPU</Text>
          <Text style={styles.scoreNum}>{gameData.cpuScore}</Text>
          <View style={styles.kicksLine}>
            {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => {
              const r = gameData.cpuKicks[i];
              return (
                <View key={i} style={[styles.kickDot, r === "goal" ? styles.dotGoal : r === "saved" ? styles.dotSaved : styles.dotEmpty]} />
              );
            })}
          </View>
        </View>
      </View>

      {/* Turn Label */}
      <View style={styles.turnRow}>
        <View style={[styles.turnBadge, isCpuKick && styles.turnBadgeCpu]}>
          <Text style={styles.turnText}>{isCpuKick ? "TIRO CPU" : "TU TURNO"}</Text>
        </View>
      </View>

      {/* Goal & Ball */}
      <View style={styles.fieldContainer}>
        {/* Goal */}
        <View style={styles.goal}>
          {/* Left post */}
          <View style={[styles.post, styles.postLeft]} />
          {/* Right post */}
          <View style={[styles.post, styles.postRight]} />
          {/* Crossbar */}
          <View style={styles.crossbar} />

          {/* Goal interior */}
          <Animated.View style={[styles.goalInterior, { backgroundColor: goalBgColor }]}>
            {/* Horizontal grid line */}
            <View style={styles.gridH} />
            {/* Vertical grid lines */}
            <View style={[styles.gridV, { left: "33.33%" }]} />
            <View style={[styles.gridV, { left: "66.66%" }]} />

            {/* Zone tap buttons (only active during player_turn) */}
            {!isCpuKick && phase === "player_turn" && (
              <View style={styles.zonesOverlay}>
                {([0, 1, 2, 3, 4, 5] as Zone[]).map((z) => (
                  <TouchableOpacity
                    key={z}
                    style={[
                      styles.zoneBtn,
                      shooterZone === z && styles.zoneBtnSelected,
                    ]}
                    onPress={() => handlePlayerKick(z)}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.zoneBtnText}>{ZONE_LABELS[z]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Shooter zone highlight during animation */}
            {phase === "animating" && shooterZone !== null && (
              <View style={[styles.zoneHighlight, {
                left: `${(ZONE_COLS[shooterZone] / 3) * 100}%`,
                top: shooterZone < 3 ? 0 : "50%",
                backgroundColor: keeperZone === shooterZone ? "rgba(231,76,60,0.25)" : "rgba(46,204,113,0.3)",
              }]} />
            )}

            {/* Keeper */}
            <Animated.View style={[styles.keeper, { transform: [{ translateX: keeperAnim }] }]}>
              <View style={styles.keeperBody} />
              <View style={styles.keeperHead} />
            </Animated.View>
          </Animated.View>
        </View>

        {/* Net shadow under goal */}
        <View style={styles.netBar} />

        {/* Penalty spot + ball */}
        <View style={styles.spotArea}>
          <View style={styles.penaltySpot} />
          <Animated.View
            style={[
              styles.ball,
              {
                transform: [
                  { translateX: ballX },
                  { translateY: ballY },
                  { scale: ballScale },
                  { rotate: spinDeg },
                ],
              },
            ]}
          >
            <View style={styles.ballInner} />
          </Animated.View>
        </View>

        {/* Grass stripe */}
        <View style={styles.grass} />
      </View>

      {/* Message overlay */}
      {showMessage && (
        <Animated.View style={[styles.msgContainer, { opacity: msgOpacity }]}>
          <Text style={[styles.msgText, { color: isGoalResult ? "#2ECC71" : "#E74C3C" }]}>
            {message}
          </Text>
        </Animated.View>
      )}

      {/* Instructions */}
      {phase === "player_turn" && (
        <View style={styles.instructionRow}>
          <Text style={styles.instructionText}>Tocá una zona para patear</Text>
        </View>
      )}
      {phase === "animating" && !showMessage && (
        <View style={styles.instructionRow}>
          <Text style={styles.instructionText}>{isCpuKick ? "CPU está pateando..." : "¡Allá va!"}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0b1c35",
  },

  // Home
  homeContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 32,
  },
  homeBig: {
    fontSize: 80,
    marginBottom: 8,
  },
  homeTitle: {
    fontSize: 48,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: 4,
  },
  homeSub: {
    fontSize: 15,
    color: "#7a9bb5",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  playBtn: {
    marginTop: 24,
    backgroundColor: "#2ECC71",
    paddingHorizontal: 56,
    paddingVertical: 18,
    borderRadius: 50,
  },
  playBtnText: {
    color: "#000",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 3,
  },

  // Game Over
  finalScore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    marginVertical: 16,
  },
  finalSide: {
    alignItems: "center",
    gap: 4,
  },
  finalLabel: {
    color: "#7a9bb5",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 2,
  },
  finalNum: {
    color: "#ffffff",
    fontSize: 64,
    fontWeight: "900",
  },
  finalDash: {
    color: "#7a9bb5",
    fontSize: 40,
    fontWeight: "300",
  },
  kicksRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  kickIcon: {
    fontSize: 18,
  },
  kickSep: {
    color: "#7a9bb5",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 4,
  },
  scoreSide: {
    alignItems: "flex-start",
    minWidth: 80,
  },
  scoreLabel: {
    color: "#7a9bb5",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
  },
  scoreNum: {
    color: "#ffffff",
    fontSize: 44,
    fontWeight: "900",
    lineHeight: 50,
  },
  kicksLine: {
    flexDirection: "row",
    gap: 5,
    marginTop: 4,
  },
  kickDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotGoal: {
    backgroundColor: "#2ECC71",
  },
  dotSaved: {
    backgroundColor: "#E74C3C",
  },
  dotEmpty: {
    backgroundColor: "#1e3d6e",
  },
  roundBadge: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginTop: 10,
  },
  roundNum: {
    color: "#F1C40F",
    fontSize: 28,
    fontWeight: "900",
  },
  roundOf: {
    color: "#7a9bb5",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },

  // Turn
  turnRow: {
    alignItems: "center",
    marginBottom: 8,
  },
  turnBadge: {
    backgroundColor: "#2ECC71",
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 20,
  },
  turnBadgeCpu: {
    backgroundColor: "#E74C3C",
  },
  turnText: {
    color: "#000000",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
  },

  // Field
  fieldContainer: {
    alignItems: "center",
    flex: 1,
  },

  // Goal
  goal: {
    width: GOAL_W,
    height: GOAL_H,
    position: "relative",
  },
  post: {
    position: "absolute",
    width: POST_SIZE,
    height: GOAL_H,
    backgroundColor: "#ffffff",
    borderRadius: 3,
    top: 0,
    zIndex: 10,
  },
  postLeft: {
    left: 0,
  },
  postRight: {
    right: 0,
  },
  crossbar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: POST_SIZE,
    backgroundColor: "#ffffff",
    borderRadius: 3,
    zIndex: 10,
  },
  goalInterior: {
    position: "absolute",
    top: POST_SIZE,
    left: POST_SIZE,
    right: POST_SIZE,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    overflow: "hidden",
  },
  gridH: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  gridV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
  },

  // Zones
  zonesOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    flexWrap: "wrap",
    zIndex: 5,
  },
  zoneBtn: {
    width: "33.33%",
    height: "50%",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  zoneBtnSelected: {
    backgroundColor: "rgba(46,204,113,0.3)",
  },
  zoneBtnText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 22,
    fontWeight: "700",
  },
  zoneHighlight: {
    position: "absolute",
    width: "33.33%",
    height: "50%",
    zIndex: 3,
  },

  // Keeper
  keeper: {
    position: "absolute",
    bottom: 0,
    alignSelf: "center",
    width: KEEPER_W,
    height: KEEPER_H,
    alignItems: "center",
    zIndex: 8,
  },
  keeperHead: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#E67E22",
    marginBottom: 2,
  },
  keeperBody: {
    position: "absolute",
    bottom: 0,
    width: KEEPER_W,
    height: KEEPER_H - 14,
    backgroundColor: "#E74C3C",
    borderRadius: 6,
  },

  // Net bar
  netBar: {
    width: GOAL_W,
    height: 6,
    backgroundColor: "#1a3a2a",
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },

  // Spot & ball
  spotArea: {
    alignItems: "center",
    justifyContent: "center",
    height: SPOT_GAP + BALL_R * 2 + 8,
    width: GOAL_W,
    zIndex: 20,
  },
  penaltySpot: {
    position: "absolute",
    bottom: BALL_R + 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  ball: {
    position: "absolute",
    bottom: 8,
    width: BALL_R * 2,
    height: BALL_R * 2,
    borderRadius: BALL_R,
    backgroundColor: "#F5F5F5",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 10,
    zIndex: 20,
  },
  ballInner: {
    width: BALL_R * 0.7,
    height: BALL_R * 0.7,
    borderRadius: BALL_R * 0.35,
    backgroundColor: "#222",
    opacity: 0.3,
  },

  // Grass
  grass: {
    width: "100%",
    flex: 1,
    backgroundColor: "#1a4a28",
    borderTopWidth: 2,
    borderTopColor: "#22883a",
    opacity: 0.8,
  },

  // Message
  msgContainer: {
    position: "absolute",
    top: "45%",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 100,
  },
  msgText: {
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: 2,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },

  // Instructions
  instructionRow: {
    alignItems: "center",
    paddingBottom: 12,
  },
  instructionText: {
    color: "#7a9bb5",
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
});
