import {
  createRemoteCommandClientFromEnv,
  getRemoteCommandMode,
} from "../adapters/remote/createRemoteCommandClient";
import { getInstanceStatus } from "./gceVm";

type PlayerCount = {
  online: number;
  max: number;
};

export type MinecraftStatusSnapshot = {
  vmStatus: "RUNNING" | "TERMINATED" | "BOOTING" | "UNKNOWN";
  minecraftStatus: "active" | "unavailable" | "booting";
  remoteCommandMode: "local" | "ssh";
  playerCount: PlayerCount | null;
  playerCheckExitCode: number | null;
  playerCheckTimedOut: boolean;
  stdout: string;
  stderr: string;
};

const MAX_OUTPUT_LENGTH = 500;

const truncate = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_OUTPUT_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_OUTPUT_LENGTH)}...`;
};

export const parsePlayerCount = (stdout: string): PlayerCount | null => {
  const match = stdout.match(
    /There are\s+(\d+)\s+of\s+a\s+max\s+of\s+(\d+)\s+players online:/i
  );

  if (!match) return null;

  return {
    online: Number.parseInt(match[1], 10),
    max: Number.parseInt(match[2], 10),
  };
};

const mapVmStatus = (value: string): "RUNNING" | "TERMINATED" | "BOOTING" | "UNKNOWN" => {
  if (value === "RUNNING") return "RUNNING";
  if (value === "TERMINATED") return "TERMINATED";
  if (value === "PROVISIONING" || value === "STAGING") return "BOOTING";
  return "UNKNOWN";
};

const isSshNotReadyError = (error: unknown): boolean => {
  const nodeError = error as NodeJS.ErrnoException;
  const message = error instanceof Error ? error.message : String(error);

  return (
    nodeError.code === "ECONNREFUSED" ||
    nodeError.code === "ETIMEDOUT" ||
    /handshake.*timeout/i.test(message) ||
    /connection.*timeout/i.test(message) ||
    /ready.*timeout/i.test(message)
  );
};

const bootingSnapshot = (
  vmStatus: MinecraftStatusSnapshot["vmStatus"],
  remoteCommandMode: MinecraftStatusSnapshot["remoteCommandMode"]
): MinecraftStatusSnapshot => ({
  vmStatus,
  minecraftStatus: "booting",
  remoteCommandMode,
  playerCount: null,
  playerCheckExitCode: null,
  playerCheckTimedOut: true,
  stdout: "",
  stderr: "",
});

export const collectMinecraftStatus = async (): Promise<MinecraftStatusSnapshot> => {
  const remoteCommandMode = getRemoteCommandMode();
  const vmStatus = mapVmStatus(await getInstanceStatus());

  if (vmStatus === "TERMINATED") {
    return {
      vmStatus,
      minecraftStatus: "unavailable",
      remoteCommandMode,
      playerCount: null,
      playerCheckExitCode: null,
      playerCheckTimedOut: false,
      stdout: "",
      stderr: "",
    };
  }

  const remoteCommandClient = createRemoteCommandClientFromEnv();
  const result = await remoteCommandClient.run({ script: "players" }).catch((error) => {
    if (isSshNotReadyError(error)) {
      return null;
    }
    throw error;
  });

  if (!result) {
    return bootingSnapshot(vmStatus, remoteCommandMode);
  }

  if (result.timedOut) {
    return {
      vmStatus,
      minecraftStatus: "booting",
      remoteCommandMode,
      playerCount: null,
      playerCheckExitCode: result.exitCode,
      playerCheckTimedOut: true,
      stdout: truncate(result.stdout),
      stderr: truncate(result.stderr),
    };
  }

  if (result.exitCode !== 0) {
    return {
      vmStatus,
      minecraftStatus: vmStatus === "RUNNING" ? "booting" : "unavailable",
      remoteCommandMode,
      playerCount: null,
      playerCheckExitCode: result.exitCode,
      playerCheckTimedOut: false,
      stdout: truncate(result.stdout),
      stderr: truncate(result.stderr),
    };
  }

  return {
    vmStatus,
    minecraftStatus: "active",
    remoteCommandMode,
    playerCount: parsePlayerCount(result.stdout),
    playerCheckExitCode: result.exitCode,
    playerCheckTimedOut: false,
    stdout: truncate(result.stdout),
    stderr: truncate(result.stderr),
  };
};

export const formatStatusLines = (
  snapshot: MinecraftStatusSnapshot
): string[] => {
  const lines = [
    `VM status: ${snapshot.vmStatus}`,
    `Minecraft status: ${
      snapshot.minecraftStatus === "booting" && snapshot.playerCheckTimedOut
        ? "booting / SSH not ready yet"
        : snapshot.minecraftStatus
    }`,
    `Remote command mode: ${snapshot.remoteCommandMode}`,
    "GCE VM start integration: enabled",
    "GCE VM shutdown integration: enabled via /stop",
  ];

  if (snapshot.playerCount) {
    lines.push(
      `Online players: ${snapshot.playerCount.online} / ${snapshot.playerCount.max}`
    );
    return lines;
  }

  lines.push("Online players: unavailable");

  if (snapshot.vmStatus === "TERMINATED") {
    return lines;
  }

  if (snapshot.stdout) {
    lines.push(`stdout:\n\`\`\`\n${snapshot.stdout}\n\`\`\``);
  }
  if (snapshot.stderr) {
    lines.push(`stderr:\n\`\`\`\n${snapshot.stderr}\n\`\`\``);
  }

  return lines;
};

const formatTime = (date: Date): string =>
  new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

const toUserFacingVmStatus = (
  snapshot: MinecraftStatusSnapshot
): string => {
  if (snapshot.vmStatus === "RUNNING" && snapshot.minecraftStatus === "booting") {
    return "부팅 중";
  }
  if (snapshot.vmStatus === "RUNNING") return "온라인";
  if (snapshot.vmStatus === "TERMINATED") return "꺼짐";
  if (snapshot.vmStatus === "BOOTING") return "부팅 중";
  return "상태 확인 불가";
};

const toUserFacingMinecraftStatus = (
  snapshot: MinecraftStatusSnapshot
): string => {
  if (snapshot.minecraftStatus === "active") return "실행 중";
  if (snapshot.minecraftStatus === "booting") return "준비 중";
  return "사용 불가";
};

export const formatUserFacingStatusLines = (
  snapshot: MinecraftStatusSnapshot,
  date: Date
): string[] => [
  `서버 상태: ${toUserFacingVmStatus(snapshot)}`,
  `마인크래프트: ${toUserFacingMinecraftStatus(snapshot)}`,
  `접속자: ${
    snapshot.playerCount
      ? `${snapshot.playerCount.online} / ${snapshot.playerCount.max}`
      : "-"
  }`,
  `마지막 업데이트: ${formatTime(date)}`,
];

export const formatPresenceText = (
  snapshot: MinecraftStatusSnapshot
): string => {
  if (snapshot.playerCount) {
    return `서버 온라인 · ${snapshot.playerCount.online}/${snapshot.playerCount.max}`;
  }
  if (snapshot.vmStatus === "TERMINATED") return "서버 꺼짐";
  if (
    snapshot.vmStatus === "BOOTING" ||
    (snapshot.vmStatus === "RUNNING" && snapshot.minecraftStatus === "booting")
  ) {
    return "서버 부팅 중";
  }
  return "⚪ 상태 확인 불가";
};
