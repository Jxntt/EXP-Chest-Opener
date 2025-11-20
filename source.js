const { Client } = require("discord.js-selfbot-v13");
const prompt = require("prompt-sync")({ sigint: true });
const fs = require("fs");
const path = require("path");
const { CheckForUpdates } = require("./updater");

const CONFIG = {
  TOKEN: "",
  CHANNEL_ID: "1353033560528785509",
  MESSAGE_ID: "1439295851741712455",
  EXP_BOT_ID: "1345567094959509525",
  CHEST_COST: 750,
};

const DATA_DIR = path.join(__dirname, "Data");
const TOKEN_FILE = path.join(DATA_DIR, "disc.txt");
const DATA_FILE = path.join(DATA_DIR, "data.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const Stats = {
  TotalOpened: 0,
  Rewards: {},
  AllTimeRewards: {},
  StartTime: Date.now(),
  IsRunning: false,
  LastReward: null,
  FailedAttempts: 0,
  MaxFailedAttempts: 3,
  TotalGems: 0,
  AllTimeGems: 0,
  InitialEXP: 0,
  CurrentEXP: 0,
  EXPGained: 0,
  EXPSpent: 0,
  AllTimeEXPSpent: 0,
  AllTimeEXPGained: 0,
  AllTimeChestsOpened: 0,
  ChestsRemaining: 0,
};

const client = new Client({ checkUpdate: false });

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let SpinnerIndex = 0;

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
  bgCyan: "\x1b[46m",
  bgGreen: "\x1b[42m",
};

const Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ClearConsole = () => {
  process.stdout.write("\x1Bc");
  console.clear();
};

const Ask = (query) => prompt(query);
const AskHidden = (query) => prompt(query, { echo: "*" });

const ShowSpinner = (text) =>
  setInterval(() => {
    process.stdout.write(
      `\r${COLORS.cyan}${SPINNER_FRAMES[SpinnerIndex]} ${COLORS.reset}${text}`
    );
    SpinnerIndex = (SpinnerIndex + 1) % SPINNER_FRAMES.length;
  }, 80);

const StopSpinner = (spinner, finalText = "") => {
  clearInterval(spinner);
  process.stdout.write("\r\x1b[K");
  if (finalText) process.stdout.write(`${finalText}\n`);
};

const FormatTime = (ms) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return `${hours.toString().padStart(2, "0")}:${(minutes % 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
};

const FormatNumber = (num) =>
  num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const FormatShortNumber = (num) => {
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}b`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}m`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}k`;
  return num.toString();
};

let IsDisplaying = false;
let LastDisplayTime = 0;
const DISPLAY_THROTTLE = 200;

const PrintBanner = () => {
  console.log(
    `${COLORS.bright}${COLORS.cyan}╔═══════════════════════════════════════════════════════════════════╗${COLORS.reset}`
  );
  console.log(
    `${COLORS.bright}${COLORS.cyan}║${COLORS.reset}                        ${COLORS.bright}${COLORS.bgCyan}${COLORS.reset} EXP Chest Opener ${COLORS.bgCyan}${COLORS.reset}${COLORS.reset}                         ${COLORS.bright}${COLORS.cyan}║${COLORS.reset}`
  );
  console.log(
    `${COLORS.bright}${COLORS.cyan}║${COLORS.reset}                            ${COLORS.dim}by @Jxnt${COLORS.reset}                               ${COLORS.bright}${COLORS.cyan}║${COLORS.reset}`
  );
  console.log(
    `${COLORS.bright}${COLORS.cyan}╚═══════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`
  );
};

const GenerateEXPBar = (current, initial) => {
  const maxBarWidth = 40;
  const percentage = initial > 0 ? (current / initial) * 100 : 0;
  const filledWidth = Math.max(0, Math.min(maxBarWidth, Math.floor((current / initial) * maxBarWidth)));

  let barColor = COLORS.green;
  if (percentage < 25) barColor = COLORS.red;
  else if (percentage < 50) barColor = COLORS.yellow;

  const filled = "█".repeat(filledWidth);
  const empty = "░".repeat(maxBarWidth - filledWidth);

  return `${barColor}${filled}${COLORS.gray}${empty}${COLORS.reset} ${COLORS.bright}${percentage.toFixed(1)}%${COLORS.reset}`;
};

const GetRewardValue = (rewardText) => {
  const normalized = rewardText.toUpperCase();

  if (normalized.includes("HUGE REWARD")) return 25_000_000;
  if (normalized.includes("4 BILLION")) return 4_000_000_000;

  if (normalized.includes("EXP") || normalized.includes("GAME CARD") || normalized.includes("$")) {
    return 0;
  }

  const numMatch = rewardText.match(/([0-9,]+)/);
  if (numMatch) {
    const value = parseInt(numMatch[1].replace(/,/g, ""), 10);
    if (value >= 1000) return value;
  }

  return 0;
};

const DisplayUI = () => {
  const now = Date.now();
  if (IsDisplaying || now - LastDisplayTime < DISPLAY_THROTTLE) return;

  IsDisplaying = true;
  LastDisplayTime = now;

  ClearConsole();

  const elapsed = Date.now() - Stats.StartTime;
  const ratePerHour = Stats.TotalOpened > 0 ? (Stats.TotalOpened / (elapsed / 3_600_000)).toFixed(0) : "0";
  const gemsPerHour = Stats.TotalGems > 0 && elapsed > 0 ? FormatShortNumber(Stats.TotalGems / (elapsed / 3_600_000)) : "0";

  PrintBanner();

  const statusColor = Stats.IsRunning ? COLORS.green : COLORS.red;
  const statusText = Stats.IsRunning ? "ACTIVE" : "STOPPED";
  const statusSymbol = "●";

  console.log(`  ${COLORS.gray}┌─ Status${COLORS.reset}         ${statusColor}${statusSymbol}${COLORS.reset} ${COLORS.bright}${statusText}${COLORS.reset}`);
  console.log(`  ${COLORS.gray}├─ Runtime${COLORS.reset}        ${COLORS.bright}${FormatTime(elapsed)}${COLORS.reset}`);
  console.log(`  ${COLORS.gray}├─ Chests Opened${COLORS.reset}  ${COLORS.bright}${COLORS.yellow}${FormatNumber(Stats.TotalOpened)}${COLORS.reset} ${COLORS.dim}(${ratePerHour}/hr) (Total: ${FormatNumber(Stats.AllTimeChestsOpened + Stats.TotalOpened)})${COLORS.reset}`);
  console.log(`  ${COLORS.gray}└─ Total Gems${COLORS.reset}     ${COLORS.bright}${COLORS.green}${FormatShortNumber(Stats.TotalGems)}${COLORS.reset} ${COLORS.dim}(${gemsPerHour}/hr)${COLORS.reset}\n`);

  const expBar = GenerateEXPBar(Stats.CurrentEXP, Stats.InitialEXP);

  console.log(`  ${COLORS.blue}${COLORS.bright}------ EXP TRACKER ------${COLORS.reset}\n`);
  console.log(`  ${expBar}`);
  console.log(`  ${COLORS.gray}Current:${COLORS.reset}  ${COLORS.bright}${FormatNumber(Stats.CurrentEXP)} EXP${COLORS.reset}  ${COLORS.dim}(${Stats.ChestsRemaining} chests left)${COLORS.reset}`);
  console.log(`  ${COLORS.gray}Gained:${COLORS.reset}   ${COLORS.bright}${COLORS.green}+${FormatNumber(Stats.EXPGained)} EXP${COLORS.reset} ${COLORS.dim}(Total: ${FormatShortNumber(Stats.AllTimeEXPGained + Stats.EXPGained)})${COLORS.reset}`);
  console.log(`  ${COLORS.gray}Spent:${COLORS.reset}    ${COLORS.bright}${COLORS.red}-${FormatShortNumber(Stats.EXPSpent)} EXP${COLORS.reset} ${COLORS.dim}(Total: ${FormatShortNumber(Stats.AllTimeEXPSpent + Stats.EXPSpent)})${COLORS.reset}\n`);

  console.log(`  ${COLORS.bright}${COLORS.blue}------ REWARDS COLLECTED ------${COLORS.reset}\n`);
  if (Stats.LastReward) {
    console.log(`  ${COLORS.gray}Last Reward:${COLORS.reset} ${COLORS.bright}${Stats.LastReward}${COLORS.reset}\n`);
  }

  if (Object.keys(Stats.Rewards).length === 0) {
    console.log(`  ${COLORS.dim}  No rewards collected yet...${COLORS.reset}\n`);
  } else {
    const sortedRewards = Object.entries(Stats.Rewards).sort((a, b) => {
      const aVal = GetRewardValue(a[0]);
      const bVal = GetRewardValue(b[0]);
      return bVal - aVal;
    });

    sortedRewards.forEach(([reward, count]) => {
      const barLength = Math.min(25, Math.floor((count / Stats.TotalOpened) * 25));
      const bar = "█".repeat(barLength) + "░".repeat(25 - barLength);
      const percentage = (count / Stats.TotalOpened) * 100;

      let percentageStr;
      if (percentage >= 10) {
        percentageStr = percentage.toFixed(1);
      } else if (percentage >= 1) {
        percentageStr = percentage.toFixed(2);
      } else if (percentage >= 0.1) {
        percentageStr = percentage.toFixed(3);
      } else if (percentage >= 0.01) {
        percentageStr = percentage.toFixed(4);
      } else {
        percentageStr = percentage.toFixed(6);
      }

      const totalCount = (Stats.AllTimeRewards[reward] || 0) + count;
      console.log(`  ${COLORS.cyan}${bar}${COLORS.reset} ${COLORS.bright}${count}x${COLORS.reset} ${COLORS.dim}(Total: ${totalCount}) (${percentageStr}%)${COLORS.reset}`);
      console.log(`  ${reward}\n`);
    });
  }

  IsDisplaying = false;
};

const LoadToken = () => {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      return fs.readFileSync(TOKEN_FILE, "utf8").trim();
    }
  } catch {
    console.error(`${COLORS.red}Error loading saved token ;(${COLORS.reset}`);
  }
  return null;
};

const SaveToken = (token) => {
  try {
    fs.writeFileSync(TOKEN_FILE, token, "utf8");
    console.log(`${COLORS.green}✓${COLORS.reset} Token was saved successfully!`);
  } catch {
    console.error(`${COLORS.red}X${COLORS.reset} Error saving token ;(`);
  }
};

const LoadRewards = () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      Stats.AllTimeRewards = data.Rewards || {};
      Stats.AllTimeGems = data.TotalGems || 0;
      Stats.AllTimeEXPSpent = data.TotalEXPSpent || 0;
      Stats.AllTimeEXPGained = data.TotalEXPGained || 0;
      Stats.AllTimeChestsOpened = data.TotalChestsOpened || 0;
      console.log(`${COLORS.green}✓${COLORS.reset} Loaded saved data`);
    }
  } catch {
    console.error(`${COLORS.red}Error loading saved data ;(${COLORS.reset}`);
  }
};

const SaveRewards = () => {
  try {
    const mergedRewards = {...Stats.AllTimeRewards};

    for (const [reward, count] of Object.entries(Stats.Rewards)) {
      mergedRewards[reward] = (mergedRewards[reward] || 0) + count;
    }

    const data = {
      Rewards: mergedRewards,
      TotalGems: Stats.AllTimeGems + Stats.TotalGems,
      TotalEXPSpent: Stats.AllTimeEXPSpent + Stats.EXPSpent,
      TotalEXPGained: Stats.AllTimeEXPGained + Stats.EXPGained,
      TotalChestsOpened: Stats.AllTimeChestsOpened + Stats.TotalOpened,
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch {
    console.error(`${COLORS.red}Error saving data${COLORS.reset}`);
  }
};

const GetToken = async () => {
  ClearConsole();
  PrintBanner();

  const savedToken = LoadToken();

  if (savedToken) {
    const useSaved = await Ask(
      `${COLORS.gray}Use saved token?${COLORS.reset} (y/n): `
    );
    if (["y", "yes"].includes(useSaved.toLowerCase())) {
      return savedToken;
    }
    console.log();
  }

  console.log(`${COLORS.yellow}!${COLORS.reset} ${COLORS.bright}Enter your Discord Token.${COLORS.reset}`);
  console.log(`${COLORS.dim}  Never share your token with anyone. Everything is open sourced.${COLORS.reset}`);
  console.log(`${COLORS.dim}  Token is required to login and automatically click Open Chest.${COLORS.reset}\n`);

  const token = await AskHidden(`${COLORS.gray}Token:${COLORS.reset} `);
  if (!token || token.trim() === "") {
    console.log(`\n${COLORS.red}X${COLORS.reset} Invalid token provided`);
    process.exit(1);
  }

  const save = await Ask(`${COLORS.gray}Save token for future use?${COLORS.reset} (y/n): `);
  if (["y", "yes"].includes(save.toLowerCase())) {
    SaveToken(token);
  }

  return token.trim();
};

let PendingRewardResolve = null;
let PendingRewardTimeout = null;

// thx chat gpt :cry:
const StripDiscordEmojis = (text) => text.replace(/<a?:[^:>]+:\d+>/g, "");

const NormalizeText = (text) =>
  StripDiscordEmojis(text).replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim();

const ParseRewardRaw = (d) => {
  if (d.embeds && d.embeds.length > 0) {
    const embed = d.embeds[0];
    if (embed.description) {
      const t = NormalizeText(embed.description);
      if (t) return t;
    }
    if (embed.title) {
      const t = NormalizeText(embed.title);
      if (t) return t;
    }
  }

  if (d.content) {
    const firstLine = d.content.split("\n")[0];
    const t = NormalizeText(firstLine);
    if (t) return t;
  }

  return "Unknown reward";
};

const ParseEXPFromMessage = (d) => {
  if (d.content) {
    const contentMatch = d.content.match(/([0-9,]+)\s*EXP/i);
    if (contentMatch) {
      return parseInt(contentMatch[1].replace(/,/g, ""), 10);
    }
  }

  if (d.embeds && d.embeds.length > 0) {
    const embed = d.embeds[0];
    const embedText = `${embed.title || ""} ${embed.description || ""}`;
    const embedMatch = embedText.match(/([0-9,]+)\s*EXP/i);
    if (embedMatch) {
      return parseInt(embedMatch[1].replace(/,/g, ""), 10);
    }
  }

  return 0;
};

const WaitForReward = () =>
  new Promise((resolve) => {
    if (PendingRewardTimeout) clearTimeout(PendingRewardTimeout);
    PendingRewardResolve = resolve;

    PendingRewardTimeout = setTimeout(() => {
      if (PendingRewardResolve === resolve) {
        PendingRewardResolve = null;
      }
      PendingRewardTimeout = null;
      resolve(null);
    }, 7000);
  });

client.on("raw", (packet) => {
  if (packet.t !== "MESSAGE_CREATE") return;
  if (!PendingRewardResolve) return;

  const d = packet.d;

  if (d.channel_id !== CONFIG.CHANNEL_ID) return;
  if (!d.author || d.author.id !== CONFIG.EXP_BOT_ID) return;
  if ((d.flags & 64) === 0) return;

  const me = client.user;
  const userId = d.interaction_metadata?.user?.id;
  if (!me || userId !== me.id) return;

  const refId = d.message_reference?.message_id;
  const interactedId = d.interaction_metadata?.interacted_message_id;
  if (refId !== CONFIG.MESSAGE_ID && interactedId !== CONFIG.MESSAGE_ID) return;

  const rewardText = ParseRewardRaw(d);

  let expGained = 0;
  const rewardLower = rewardText.toLowerCase();
  if (rewardLower.includes("exp")) {
    expGained = ParseEXPFromMessage(d);
  }

  const content = NormalizeText(d.content || "").toLowerCase();
  const embedDesc = NormalizeText(d.embeds?.[0]?.description || "").toLowerCase();
  const embedTitle = NormalizeText(d.embeds?.[0]?.title || "").toLowerCase();
  const fullText = `${content} ${embedDesc} ${embedTitle}`;

  const isCooldown = fullText.includes("cooldown");
  const isNoEXP = fullText.includes("don't have enough");

  const resolve = PendingRewardResolve;
  PendingRewardResolve = null;

  if (PendingRewardTimeout) {
    clearTimeout(PendingRewardTimeout);
    PendingRewardTimeout = null;
  }

  resolve({ rewardText, isCooldown, isNoEXP, expGained });
});

const GetInitialEXP = async () => {
  try {
    const channel = await client.channels.fetch(CONFIG.CHANNEL_ID);
    const message = await channel.messages.fetch(CONFIG.MESSAGE_ID);

    if (!message.components || !message.components[0]) return 0;

    const buttons = message.components[0].components;
    const balanceButton = buttons[0];

    if (!balanceButton) {
      console.log(`${COLORS.yellow}X${COLORS.reset} Could not find balance button`);
      return 0;
    }

    const rewardPromise = WaitForReward();
    await message.clickButton(balanceButton.customId);
    await Sleep(3000);

    const result = await rewardPromise;
    if (result && result.rewardText) {
      const balanceMatch = result.rewardText.match(/Balance:\s*([0-9,]+)/i);
      if (balanceMatch) {
        const exp = parseInt(balanceMatch[1].replace(/,/g, ""), 10);
        return exp;
      }

      const numMatch = result.rewardText.match(/([0-9,]+)/);
      if (numMatch) {
        const exp = parseInt(numMatch[1].replace(/,/g, ""), 10);
        return exp;
      }
    }

    return 0;
  } catch (error) {
    console.log(`${COLORS.yellow}X${COLORS.reset} Could not get initial EXP: ${error.message}`);
    return 0;
  }
};

const OpenChest = async () => {
  try {
    const channel = await client.channels.fetch(CONFIG.CHANNEL_ID);
    const message = await channel.messages.fetch(CONFIG.MESSAGE_ID);

    if (!message.components || !message.components[0]) return false;

    const buttons = message.components[0].components;
    let button = buttons.find((c) => c.label === "Open Chest");
    if (!button && buttons.length > 1) button = buttons[1];
    if (!button) return false;

    const rewardPromise = WaitForReward();
    await message.clickButton(button.customId);
    const result = await rewardPromise;

    if (!result) {
      Stats.FailedAttempts++;
      if (Stats.FailedAttempts >= Stats.MaxFailedAttempts) {
        console.log(
          `\n  ${COLORS.red}X${COLORS.reset} No reward message after ${Stats.MaxFailedAttempts} attempts - stopping`
        );
        Stats.IsRunning = false;
        SaveRewards();
        process.exit(0);
      }
      return false;
    }

    const { rewardText, isCooldown, isNoEXP, expGained } = result;

    if (isCooldown) return false;

    if (isNoEXP) {
      console.log(`\n  ${COLORS.yellow}X${COLORS.reset} Out of EXP`);
      Stats.IsRunning = false;
      SaveRewards();
      process.exit(0);
    }

    if (rewardText.toLowerCase().includes("recent winners")) return false;

    Stats.FailedAttempts = 0;
    Stats.Rewards[rewardText] = (Stats.Rewards[rewardText] || 0) + 1;
    Stats.LastReward = rewardText;
    Stats.TotalOpened++;

    const gemValue = GetRewardValue(rewardText);
    Stats.TotalGems += gemValue;

    Stats.CurrentEXP -= CONFIG.CHEST_COST;
    Stats.EXPSpent += CONFIG.CHEST_COST;
    Stats.EXPGained += expGained;
    Stats.CurrentEXP += expGained;
    Stats.ChestsRemaining = Math.floor(Stats.CurrentEXP / CONFIG.CHEST_COST);

    SaveRewards();

    return true;
  } catch (error) {
    const msg = error?.message || "";

    console.log(`\n  ${COLORS.red}X${COLORS.reset} Error: ${msg}`);
    Stats.FailedAttempts++;

    if (Stats.FailedAttempts >= Stats.MaxFailedAttempts) {
      console.log(`\n  ${COLORS.red}X${COLORS.reset} Too many errors - stopping`);
      Stats.IsRunning = false;
      SaveRewards();
      process.exit(0);
    }

    return false;
  } finally {
    await Sleep(150);
    DisplayUI();
  }
};

const MainLoop = async () => {
  Stats.IsRunning = true;
  Stats.StartTime = Date.now();
  DisplayUI();

  while (Stats.IsRunning) {
    await OpenChest();
    await Sleep(700);
  }
};

process.on("SIGINT", () => {
  Stats.IsRunning = false;
  SaveRewards();
  process.exit(0);
});

client.on("ready", async () => {
  ClearConsole();
  PrintBanner();

  console.log(`${COLORS.green}✓${COLORS.reset} Logged in as ${COLORS.bright}${client.user.tag}${COLORS.reset}`);

  LoadRewards();

  let spinner = ShowSpinner("Getting EXP Balance...");
  const initialEXP = await GetInitialEXP();
  StopSpinner(spinner);

  if (initialEXP > 0) {
    Stats.InitialEXP = initialEXP;
    Stats.CurrentEXP = initialEXP;
    Stats.ChestsRemaining = Math.floor(initialEXP / CONFIG.CHEST_COST);
    console.log(`${COLORS.green}✓${COLORS.reset} Initial EXP: ${COLORS.bright}${FormatNumber(initialEXP)}${COLORS.reset} (${Stats.ChestsRemaining} chests available)`);
  } else {
    console.log(`${COLORS.yellow}⚠${COLORS.reset} Could not get initial EXP.`);
  }

  spinner = ShowSpinner("Starting");
  await Sleep(2000);
  StopSpinner(spinner);

  MainLoop();
});

(async () => {
  try {
    await CheckForUpdates(prompt, false);
    CONFIG.TOKEN = await GetToken();
    console.log();

    const spinner = ShowSpinner("Logging in");
    client
      .login(CONFIG.TOKEN)
      .then(() => {
        StopSpinner(spinner);
      })
      .catch((error) => {
        StopSpinner(spinner, `${COLORS.red}X${COLORS.reset} Login failed`);
        console.log(`${COLORS.red}Error:${COLORS.reset} ${error.message}`);
        console.log(
          `${COLORS.dim}Please check your token and try again${COLORS.reset}\n`
        );
        process.exit(1);
      });
  } catch (error) {
    console.error(
      `\n${COLORS.red}X${COLORS.reset} Unexpected error:`,
      error.message
    );
    process.exit(1);
  }
})();
