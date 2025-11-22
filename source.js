const { Client } = require("discord.js-selfbot-v13");
const prompt = require("prompt-sync")({ sigint: true });
const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const CONFIG = {
    TOKEN: "",
    CHANNEL_ID: "1353033560528785509",
    MESSAGE_ID: "1439295851741712455",
    EXP_BOT_ID: "1345567094959509525",
    CHEST_COST: 750,
};

const GITHUB_REPO = "Jxntt/EXP-Chest-Opener";
const BRANCH = "main";

const DATA_DIR = path.join(__dirname, "Data");
const TOKEN_FILE = path.join(DATA_DIR, "disc.txt");
const DATA_FILE = path.join(DATA_DIR, "data.json");
const HASH_FILE = path.join(DATA_DIR, "lastcommit.txt");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const COLORS = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    red: "\x1b[31m",
    gray: "\x1b[90m",
    bgCyan: "\x1b[46m",
};

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

const Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ClearConsole = () => {
    process.stdout.write("\x1Bc");
    console.clear();
};

const Ask = (query) => prompt(query);
const AskHidden = (query) => prompt(query, { echo: "*" });

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let spinnerIndex = 0;

const ShowSpinner = (text) => {
    return setInterval(() => {
        process.stdout.write(`\r${COLORS.cyan}${SPINNER_FRAMES[spinnerIndex]} ${COLORS.reset}${text}`);
        spinnerIndex = (spinnerIndex + 1) % SPINNER_FRAMES.length;
    }, 80);
};

const StopSpinner = (spinner, finalText = "") => {
    clearInterval(spinner);
    process.stdout.write("\r\x1b[K");
    if (finalText) console.log(finalText);
};

const FormatTime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours.toString().padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
};

const FormatNumber = (number) => {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const FormatShortNumber = (number) => {
    if (number >= 1e9) return `${(number / 1e9).toFixed(2)}b`;
    if (number >= 1e6) return `${(number / 1e6).toFixed(2)}m`;
    if (number >= 1e3) return `${(number / 1e3).toFixed(2)}k`;
    return number.toString();
};

const HttpGet = (url) => {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { "User-Agent": "EXP-Chest-Opener" } }, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                return HttpGet(response.headers.location).then(resolve).catch(reject);
            }
            let data = "";
            response.on("data", (chunk) => data += chunk);
            response.on("end", () => resolve({ status: response.statusCode, data }));
        }).on("error", reject);
    });
};

const DownloadFile = (url, destination) => {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { "User-Agent": "EXP-Chest-Opener" } }, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                return DownloadFile(response.headers.location, destination).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) {
                return reject(new Error(`HTTP ${response.statusCode}`));
            }
            const file = fs.createWriteStream(destination);
            response.pipe(file);
            file.on("finish", () => {
                file.close();
                resolve();
            });
        }).on("error", reject);
    });
};

const CheckForUpdates = async () => {
    try {
        const response = await HttpGet(`https://api.github.com/repos/${GITHUB_REPO}/commits/${BRANCH}`);
        if (response.status !== 200) return;

        const commit = JSON.parse(response.data);
        const latestHash = commit.sha.substring(0, 7);
        const commitMessage = commit.commit.message.split("\n")[0];

        let currentHash = "";
        try {
            currentHash = fs.readFileSync(HASH_FILE, "utf8").trim();
        } catch {}

        if (currentHash === latestHash) {
            console.log(`${COLORS.green}✓${COLORS.reset} Up to date ${COLORS.dim}(${latestHash})${COLORS.reset}\n`);
            return;
        }

        console.log(`\n${COLORS.yellow}╔════════════════════════════════════════╗${COLORS.reset}`);
        console.log(`${COLORS.yellow}║${COLORS.reset}           ${COLORS.bright}UPDATE AVAILABLE!${COLORS.reset}            ${COLORS.yellow}║${COLORS.reset}`);
        console.log(`${COLORS.yellow}╚════════════════════════════════════════╝${COLORS.reset}\n`);

        if (currentHash) console.log(`  ${COLORS.dim}Current:${COLORS.reset} ${currentHash}`);
        console.log(`  ${COLORS.dim}Latest:${COLORS.reset}  ${COLORS.green}${latestHash}${COLORS.reset}`);
        console.log(`  ${COLORS.dim}Changes:${COLORS.reset} ${commitMessage}\n`);

        const answer = Ask(`${COLORS.yellow}Update now?${COLORS.reset} (y/n): `);
        if (!["y", "yes"].includes(answer.toLowerCase().trim())) {
            console.log(`${COLORS.dim}Skipped. Run again to update later.${COLORS.reset}\n`);
            return;
        }

        const tempDir = path.join(__dirname, ".update_temp");
        const zipPath = path.join(tempDir, "update.zip");

        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        console.log(`\n  ${COLORS.cyan}Downloading latest code...${COLORS.reset}`);
        await DownloadFile(`https://github.com/${GITHUB_REPO}/archive/refs/heads/${BRANCH}.zip`, zipPath);

        console.log(`  ${COLORS.cyan}Extracting...${COLORS.reset}`);
        const AdmZip = require("adm-zip");
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(tempDir, true);

        const folders = fs.readdirSync(tempDir, { withFileTypes: true }).filter(entry => entry.isDirectory());
        if (folders.length === 0) throw new Error("Extraction failed");

        const sourceDir = path.join(tempDir, folders[0].name);
        const preserveList = ["node_modules", "Data", ".git", ".update_temp"];

        console.log(`  ${COLORS.cyan}Installing update...${COLORS.reset}`);
        
        const copyRecursive = (source, dest) => {
            if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
            for (const item of fs.readdirSync(source, { withFileTypes: true })) {
                if (preserveList.includes(item.name)) continue;
                const sourcePath = path.join(source, item.name);
                const destPath = path.join(dest, item.name);
                if (item.isDirectory()) {
                    copyRecursive(sourcePath, destPath);
                } else {
                    fs.copyFileSync(sourcePath, destPath);
                }
            }
        };
        
        copyRecursive(sourceDir, __dirname);
        fs.writeFileSync(HASH_FILE, latestHash, "utf8");
        fs.rmSync(tempDir, { recursive: true, force: true });

        console.log(`  ${COLORS.cyan}Checking dependencies...${COLORS.reset}`);
        try {
            execSync("npm install", { stdio: "pipe" });
        } catch {}

        console.log(`\n${COLORS.green}Updated to ${latestHash}!${COLORS.reset}`);
        console.log(`${COLORS.yellow}Please restart the program to apply changes.${COLORS.reset}\n`);
        process.exit(0);

    } catch (error) {
        console.log(`${COLORS.dim}Update check failed: ${error.message}${COLORS.reset}\n`);
    }
};

const PrintBanner = () => {
    console.log(`${COLORS.bright}${COLORS.cyan}╔═══════════════════════════════════════════════════════════════════╗${COLORS.reset}`);
    console.log(`${COLORS.bright}${COLORS.cyan}║${COLORS.reset}                         ${COLORS.bright}EXP Chest Opener${COLORS.reset}                          ${COLORS.bright}${COLORS.cyan}║${COLORS.reset}`);
    console.log(`${COLORS.bright}${COLORS.cyan}║${COLORS.reset}                            ${COLORS.dim}by @Jxnt${COLORS.reset}                               ${COLORS.bright}${COLORS.cyan}║${COLORS.reset}`);
    console.log(`${COLORS.bright}${COLORS.cyan}╚═══════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`);
};

let isDisplaying = false;
let lastDisplayTime = 0;

const GenerateEXPBar = (current, initial) => {
    const percentage = initial > 0 ? (current / initial) * 100 : 0;
    const filledWidth = Math.max(0, Math.min(40, Math.floor((current / initial) * 40)));
    const color = percentage < 25 ? COLORS.red : percentage < 50 ? COLORS.yellow : COLORS.green;
    return `${color}${"█".repeat(filledWidth)}${COLORS.gray}${"░".repeat(40 - filledWidth)}${COLORS.reset} ${COLORS.bright}${percentage.toFixed(1)}%${COLORS.reset}`;
};

const GetRewardValue = (rewardText) => {
    const normalized = rewardText.toUpperCase();
    if (normalized.includes("HUGE REWARD")) return 25_000_000;
    if (normalized.includes("4 BILLION")) return 4_000_000_000;
    if (normalized.includes("EXP") || normalized.includes("GAME CARD") || normalized.includes("$")) return 0;
    const match = rewardText.match(/([0-9,]+)/);
    if (match) {
        const value = parseInt(match[1].replace(/,/g, ""), 10);
        if (value >= 1000) return value;
    }
    return 0;
};

const DisplayUI = () => {
    const now = Date.now();
    if (isDisplaying || now - lastDisplayTime < 200) return;
    isDisplaying = true;
    lastDisplayTime = now;

    ClearConsole();

    const elapsed = now - Stats.StartTime;
    const chestRate = Stats.TotalOpened > 0 ? (Stats.TotalOpened / (elapsed / 3.6e6)).toFixed(0) : "0";
    const gemRate = Stats.TotalGems > 0 ? FormatShortNumber(Stats.TotalGems / (elapsed / 3.6e6)) : "0";

    PrintBanner();

    const status = Stats.IsRunning ? `${COLORS.green}● ACTIVE` : `${COLORS.red}● STOPPED`;
    console.log(`  ${COLORS.gray}┌─ Status${COLORS.reset}         ${status}${COLORS.reset}`);
    console.log(`  ${COLORS.gray}├─ Runtime${COLORS.reset}        ${COLORS.bright}${FormatTime(elapsed)}${COLORS.reset}`);
    console.log(`  ${COLORS.gray}├─ Chests${COLORS.reset}         ${COLORS.bright}${COLORS.yellow}${FormatNumber(Stats.TotalOpened)}${COLORS.reset} ${COLORS.dim}(${chestRate}/hr) (Total: ${FormatNumber(Stats.AllTimeChestsOpened + Stats.TotalOpened)})${COLORS.reset}`);
    console.log(`  ${COLORS.gray}└─ Gems${COLORS.reset}           ${COLORS.bright}${COLORS.green}${FormatShortNumber(Stats.TotalGems)}${COLORS.reset} ${COLORS.dim}(${gemRate}/hr)${COLORS.reset}\n`);

    console.log(`  ${COLORS.blue}${COLORS.bright}------ EXP TRACKER ------${COLORS.reset}\n`);
    console.log(`  ${GenerateEXPBar(Stats.CurrentEXP, Stats.InitialEXP)}`);
    console.log(`  ${COLORS.gray}Current:${COLORS.reset} ${COLORS.bright}${FormatNumber(Stats.CurrentEXP)} EXP${COLORS.reset} ${COLORS.dim}(${Stats.ChestsRemaining} chests)${COLORS.reset}`);
    console.log(`  ${COLORS.gray}Gained:${COLORS.reset}  ${COLORS.bright}${COLORS.green}+${FormatNumber(Stats.EXPGained)}${COLORS.reset} ${COLORS.dim}(Total: ${FormatShortNumber(Stats.AllTimeEXPGained + Stats.EXPGained)})${COLORS.reset}`);
    console.log(`  ${COLORS.gray}Spent:${COLORS.reset}   ${COLORS.bright}${COLORS.red}-${FormatShortNumber(Stats.EXPSpent)}${COLORS.reset} ${COLORS.dim}(Total: ${FormatShortNumber(Stats.AllTimeEXPSpent + Stats.EXPSpent)})${COLORS.reset}\n`);

    console.log(`  ${COLORS.bright}${COLORS.blue}------ REWARDS ------${COLORS.reset}\n`);

    if (Stats.LastReward) {
        console.log(`  ${COLORS.gray}Last:${COLORS.reset} ${Stats.LastReward}\n`);
    }

    if (Object.keys(Stats.Rewards).length === 0) {
        console.log(`  ${COLORS.dim}No rewards yet...${COLORS.reset}\n`);
    } else {
        const sortedRewards = Object.entries(Stats.Rewards).sort((a, b) => GetRewardValue(b[0]) - GetRewardValue(a[0]));
        sortedRewards.forEach(([reward, count]) => {
            const barLength = Math.min(25, Math.floor((count / Stats.TotalOpened) * 25));
            const bar = "█".repeat(barLength) + "░".repeat(25 - barLength);
            const percentage = (count / Stats.TotalOpened) * 100;

            let percentageString;
            if (percentage >= 10) {
                percentageString = percentage.toFixed(1);
            } else if (percentage >= 1) {
                percentageString = percentage.toFixed(2);
            } else if (percentage >= 0.1) {
                percentageString = percentage.toFixed(3);
            } else if (percentage >= 0.01) {
                percentageString = percentage.toFixed(4);
            } else {
                percentageString = percentage.toFixed(6);
            }

            const totalCount = (Stats.AllTimeRewards[reward] || 0) + count;
            console.log(`  ${COLORS.cyan}${bar}${COLORS.reset} ${COLORS.bright}${count}x${COLORS.reset} ${COLORS.dim}(Total: ${totalCount}) (${percentageString}%)${COLORS.reset}`);
            console.log(`  ${reward}\n`);
        });
    }

    isDisplaying = false;
};

const LoadToken = () => {
    try {
        return fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, "utf8").trim() : null;
    } catch {
        return null;
    }
};

const SaveToken = (token) => {
    try {
        fs.writeFileSync(TOKEN_FILE, token, "utf8");
        console.log(`${COLORS.green}✓${COLORS.reset} Token saved!`);
    } catch {}
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
        }
    } catch {}
};

const SaveRewards = () => {
    try {
        const mergedRewards = { ...Stats.AllTimeRewards };
        for (const [reward, count] of Object.entries(Stats.Rewards)) {
            mergedRewards[reward] = (mergedRewards[reward] || 0) + count;
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify({
            Rewards: mergedRewards,
            TotalGems: Stats.AllTimeGems + Stats.TotalGems,
            TotalEXPSpent: Stats.AllTimeEXPSpent + Stats.EXPSpent,
            TotalEXPGained: Stats.AllTimeEXPGained + Stats.EXPGained,
            TotalChestsOpened: Stats.AllTimeChestsOpened + Stats.TotalOpened
        }, null, 2), "utf8");
    } catch {}
};

const GetToken = async () => {
    ClearConsole();
    PrintBanner();

    const savedToken = LoadToken();
    if (savedToken) {
        const useSaved = Ask(`${COLORS.gray}Use saved token?${COLORS.reset} (y/n): `);
        if (["y", "yes"].includes(useSaved.toLowerCase())) {
            return savedToken;
        }
        console.log();
    }

    console.log(`${COLORS.yellow}!${COLORS.reset} ${COLORS.bright}Enter your Discord Token.${COLORS.reset}\n`);
    const token = AskHidden(`${COLORS.gray}Token:${COLORS.reset} `);

    if (!token?.trim()) {
        console.log(`\n${COLORS.red}✗${COLORS.reset} Invalid token`);
        process.exit(1);
    }

    const saveToken = Ask(`${COLORS.gray}Save token?${COLORS.reset} (y/n): `);
    if (["y", "yes"].includes(saveToken.toLowerCase())) {
        SaveToken(token);
    }

    return token.trim();
};

let pendingRewardResolve = null;
let pendingRewardTimeout = null;

const StripDiscordEmojis = (text) => {
    return text.replace(/<a?:[^:>]+:\d+>/g, "");
};

const NormalizeText = (text) => {
    return StripDiscordEmojis(text).replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim();
};

const ParseReward = (messageData) => {
    if (messageData.embeds?.[0]?.description) {
        const text = NormalizeText(messageData.embeds[0].description);
        if (text) return text;
    }
    if (messageData.embeds?.[0]?.title) {
        const text = NormalizeText(messageData.embeds[0].title);
        if (text) return text;
    }
    if (messageData.content) {
        const text = NormalizeText(messageData.content.split("\n")[0]);
        if (text) return text;
    }
    return "Unknown reward";
};

const ParseEXP = (messageData) => {
    const contentMatch = (messageData.content || "").match(/([0-9,]+)\s*EXP/i);
    if (contentMatch) {
        return parseInt(contentMatch[1].replace(/,/g, ""), 10);
    }

    const embedText = `${messageData.embeds?.[0]?.title || ""} ${messageData.embeds?.[0]?.description || ""}`;
    const embedMatch = embedText.match(/([0-9,]+)\s*EXP/i);
    if (embedMatch) {
        return parseInt(embedMatch[1].replace(/,/g, ""), 10);
    }

    return 0;
};

const WaitForReward = () => {
    return new Promise((resolve) => {
        if (pendingRewardTimeout) clearTimeout(pendingRewardTimeout);
        pendingRewardResolve = resolve;
        pendingRewardTimeout = setTimeout(() => {
            if (pendingRewardResolve === resolve) pendingRewardResolve = null;
            pendingRewardTimeout = null;
            resolve(null);
        }, 7000);
    });
};

client.on("raw", (packet) => {
    if (packet.t !== "MESSAGE_CREATE" || !pendingRewardResolve) return;

    const messageData = packet.d;

    if (messageData.channel_id !== CONFIG.CHANNEL_ID) return;
    if (messageData.author?.id !== CONFIG.EXP_BOT_ID) return;
    if ((messageData.flags & 64) === 0) return;
    if (messageData.interaction_metadata?.user?.id !== client.user?.id) return;

    const referenceId = messageData.message_reference?.message_id;
    const interactedId = messageData.interaction_metadata?.interacted_message_id;
    if (referenceId !== CONFIG.MESSAGE_ID && interactedId !== CONFIG.MESSAGE_ID) return;

    const rewardText = ParseReward(messageData);
    const expGained = rewardText.toLowerCase().includes("exp") ? ParseEXP(messageData) : 0;
    const fullText = `${NormalizeText(messageData.content || "")} ${NormalizeText(messageData.embeds?.[0]?.description || "")}`.toLowerCase();

    const resolve = pendingRewardResolve;
    pendingRewardResolve = null;

    if (pendingRewardTimeout) {
        clearTimeout(pendingRewardTimeout);
        pendingRewardTimeout = null;
    }

    resolve({
        rewardText: rewardText,
        expGained: expGained,
        isCooldown: fullText.includes("cooldown"),
        isNoEXP: fullText.includes("don't have enough")
    });
});

const GetInitialEXP = async () => {
    try {
        const channel = await client.channels.fetch(CONFIG.CHANNEL_ID);
        const message = await channel.messages.fetch(CONFIG.MESSAGE_ID);
        const button = message.components?.[0]?.components?.[0];

        if (!button) return 0;

        const rewardPromise = WaitForReward();
        await message.clickButton(button.customId);
        await Sleep(3000);

        const result = await rewardPromise;
        if (result?.rewardText) {
            const match = result.rewardText.match(/Balance:\s*([0-9,]+)/i) || result.rewardText.match(/([0-9,]+)/);
            if (match) {
                return parseInt(match[1].replace(/,/g, ""), 10);
            }
        }
        return 0;
    } catch {
        return 0;
    }
};

const OpenChest = async () => {
    try {
        const channel = await client.channels.fetch(CONFIG.CHANNEL_ID);
        const message = await channel.messages.fetch(CONFIG.MESSAGE_ID);
        const buttons = message.components?.[0]?.components;
        const openButton = buttons?.find((button) => button.label === "Open Chest") || buttons?.[1];

        if (!openButton) return false;

        const rewardPromise = WaitForReward();
        await message.clickButton(openButton.customId);
        const result = await rewardPromise;

        if (!result) {
            Stats.FailedAttempts++;
            if (Stats.FailedAttempts >= Stats.MaxFailedAttempts) {
                Stats.IsRunning = false;
                SaveRewards();
                process.exit(0);
            }
            return false;
        }

        if (result.isCooldown) return false;

        if (result.isNoEXP) {
            Stats.IsRunning = false;
            SaveRewards();
            process.exit(0);
        }

        if (result.rewardText.toLowerCase().includes("recent winners")) return false;

        Stats.FailedAttempts = 0;
        Stats.Rewards[result.rewardText] = (Stats.Rewards[result.rewardText] || 0) + 1;
        Stats.LastReward = result.rewardText;
        Stats.TotalOpened++;
        Stats.TotalGems += GetRewardValue(result.rewardText);
        Stats.CurrentEXP -= CONFIG.CHEST_COST;
        Stats.EXPSpent += CONFIG.CHEST_COST;
        Stats.EXPGained += result.expGained;
        Stats.CurrentEXP += result.expGained;
        Stats.ChestsRemaining = Math.floor(Stats.CurrentEXP / CONFIG.CHEST_COST);

        SaveRewards();
        return true;

    } catch {
        Stats.FailedAttempts++;
        if (Stats.FailedAttempts >= Stats.MaxFailedAttempts) {
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

    let spinner = ShowSpinner("Getting EXP...");
    const initialEXP = await GetInitialEXP();
    StopSpinner(spinner);

    if (initialEXP > 0) {
        Stats.InitialEXP = initialEXP;
        Stats.CurrentEXP = initialEXP;
        Stats.ChestsRemaining = Math.floor(initialEXP / CONFIG.CHEST_COST);
        console.log(`${COLORS.green}✓${COLORS.reset} EXP: ${COLORS.bright}${FormatNumber(initialEXP)}${COLORS.reset} (${Stats.ChestsRemaining} chests)`);
    }

    spinner = ShowSpinner("Starting...");
    await Sleep(2000);
    StopSpinner(spinner);

    MainLoop();
});

(async () => {
    try {
        ClearConsole();
        PrintBanner();

        console.log(`${COLORS.dim}Checking for updates...${COLORS.reset}\n`);
        await CheckForUpdates();

        CONFIG.TOKEN = await GetToken();
        console.log();

        const spinner = ShowSpinner("Logging in...");

        client.login(CONFIG.TOKEN).then(() => {
            StopSpinner(spinner);
        }).catch((error) => {
            StopSpinner(spinner, `${COLORS.red}✗${COLORS.reset} Login failed`);
            console.log(`${COLORS.red}Error:${COLORS.reset} ${error.message}\n`);
            process.exit(1);
        });

    } catch (error) {
        console.error(`\n${COLORS.red}✗${COLORS.reset} Error:`, error.message);
        process.exit(1);
    }
})();