export interface AvatarConfig {
  skin?: string;
  hairStyle?: string;
  hairColor?: string;
  eyeType?: string;
  eyeColor?: string;
  mouth?: string;
  accessory?: string;
  ears?: string;
  nose?: string;
}

export interface Player {
  id: string;
  accountPlayerId?: string;
  name: string;
  grade: string;
  pin: string;
  aureos: number;
  experience: number;
  inventory: Record<string, number>;
  achievements: string[];
  avgPct?: number;
  themeColor?: string;
  avatar?: AvatarConfig;
  lastActive?: string;
}

export interface GameSession {
  id: string;
  playerId?: string;
  accountPlayerId?: string;
  name: string;
  grade: string;
  gameMode: 'solo' | 'duel' | 'online' | 'idle';
  mpGameMode?: string;
  roomName?: string;
  roomId?: string;
  isExam?: boolean;
  examTestId?: string;
  score: number;
  qIndex: number;
  totalQ: number;
  currentQuestion?: string;
  correct: number;
  wrong: number;
  streak: number;
  lives?: number;
  livesTotal?: number;
  gameType?: string;
  difficulty?: string;
  timeLimit?: number;
  timeLeft?: number;
  questionElapsedMs?: number;
  startTime?: number;
  examStartedAt?: number;
  paused: boolean;
  status: 'playing' | 'paused' | 'finished';
  lastResult?: 'correct' | 'wrong' | null;
  lastResultTs?: number;
  disconnected?: boolean;
  avatar?: AvatarConfig;
  themeColor?: string;
  tblSelMode?: string;
  tables?: number[];
  currentTable?: number;
  inventory?: Record<string, number>;
}

export interface MultiplayerRoom {
  roomId: string;
  roomName: string;
  hostName: string;
  roomStatus: 'lobby' | 'playing' | 'finished';
  roomPlayerCount: number;
  roomMaxPlayers: number;
  mpGameMode: string;
  players: GameSession[];
}

export interface RewardTier {
  minPercent: number;
  maxPercent: number;
  earned: number;
  lost: number;
}

export interface TestRewardsConfig {
  aureos: number;
  experience: number;
  streak: { enabled: boolean; bonus?: number };
  achievements: { perfect?: { enabled: boolean; bonus?: number } };
  aureosTiers?: RewardTier[];
  aureosTiersVersion?: 1 | 2;
}

export interface OperationConfig {
  mode?: 'quick' | 'exact';
  qty?: number;
  perTableQty?: number;
  tables?: number[];
  quickTables?: number[];
  range?: { from: number; to: number };
  digits?: number;
  carryMode?: 'direct' | 'carry' | 'both';
  manner?: 'ordered' | 'random';
  matrix?: string[];
  matrixCustomized?: boolean;
  ranges?: Array<{ table: number; from: number; to: number }>;
  detailMode?: boolean;
}

export interface MathTest {
  testId: string;
  folio: string;
  title: string;
  description: string;
  status: 'draft' | 'scheduled' | 'active' | 'paused' | 'closed' | 'finished' | 'cancelled';
  createdAt: string;
  updatedAt?: string;
  lastModifiedAt?: string;
  startsAt?: string | null;
  closesAt?: string | null;
  grade?: string;
  questionCount?: number;
  attemptCount?: number;
  allowedAttempts?: number;
  timeLimit?: number;
  timePerQuestion?: number;
  answerMode?: 'options' | 'write' | 'voice';
  multiplier?: number;
  rewards?: TestRewardsConfig;
  opsConfig?: Record<string, OperationConfig>;
  operations?: string[];
  groups?: string[];
  assignmentCount?: number;
  assignedStudentIds?: string[];
  revision: number;
  archivedAt?: string | null;
}

export interface TestAttempt {
  attemptId: string;
  testId: string;
  accountPlayerId: string;
  name: string;
  grade: string;
  startedAt: string;
  finishedAt?: string;
  updatedAt: string;
  index: number;
  totalQuestions: number;
  correct: number;
  incorrect: number;
  status: 'started' | 'in_progress' | 'paused' | 'finished' | 'incomplete';
  connectionState: 'connected' | 'disconnected' | 'reconnected';
  hasValidResult: boolean;
  officialAttempt?: boolean;
  rankingPublication?: boolean;
  rewardSettlement?: {
    status: string;
    completedAt?: string;
    applied?: Record<string, boolean>;
  } | null;
}

export interface AureosTransaction {
  id: string;
  ts: number;
  name: string;
  grade?: string;
  reason: string;
  delta: number;
  balance: number;
}

export interface ClientConnection {
  id: string;
  playerId?: string;
  name: string;
  grade?: string;
  type: 'maestro' | 'player';
  ip: string;
  connectedMs: number;
  msgIn: number;
  msgOut: number;
  latency?: number;
}

export interface ConsoleLogEntry {
  id: string;
  ts: number;
  evType: 'connect' | 'disconnect' | 'kick' | 'command' | 'exam' | 'reward';
  msg: string;
}
