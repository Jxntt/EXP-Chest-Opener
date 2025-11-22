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

const C = {
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

const client = new Client({
    checkUpdate: false
});

const Sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ClearConsole = () => {
    process.stdout.write("\x1Bc");
    console.clear();
};
const Ask = (q) => prompt(q);
const AskHidden = (q) => prompt(q, {
    echo: "*"
});

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let spinIdx = 0;
const ShowSpinner = (text) => setInterval(() => {
    process.stdout.write(`\r${C.cyan}${SPINNER[spinIdx]} ${C.reset}${text}`);
    spinIdx = (spinIdx + 1) % SPINNER.length;
}, 80);
const StopSpinner = (s, txt = "") => {
    clearInterval(s);
    process.stdout.write("\r\x1b[K");
    if (txt) console.log(txt);
};

const FormatTime = (ms) => {
    const s = Math.floor(ms / 1000),
        m = Math.floor(s / 60),
        h = Math.floor(m / 60);
    return `${h.toString().padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
};
const FormatNumber = (n) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const FormatShort = (n) => n >= 1e9 ? `${(n/1e9).toFixed(2)}b` : n >= 1e6 ? `${(n/1e6).toFixed(2)}m` : n >= 1e3 ? `${(n/1e3).toFixed(2)}k` : n.toString();

const HttpGet = (url) => new Promise((resolve, reject) => {
    https.get(url, {
        headers: {
            "User-Agent": "EXP-Chest-Opener"
        }
    }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) return HttpGet(res.headers.location).then(resolve).catch(reject);
        let data = "";
        res.on("data", c => data += c);
        res.on("end", () => resolve({
            status: res.statusCode,
            data
        }));
    }).on("error", reject);
});

const DownloadFile = (url, dest) => new Promise((resolve, reject) => {
    https.get(url, {
        headers: {
            "User-Agent": "EXP-Chest-Opener"
        }
    }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) return DownloadFile(res.headers.location, dest).then(resolve).catch(reject);
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => {
            file.close();
            resolve();
        });
    }).on("error", reject);
});

const CheckForUpdates = async () => {
    try {
        const res = await HttpGet(`https://api.github.com/repos/${GITHUB_REPO}/commits/${BRANCH}`);
        if (res.status !== 200) return;

        const commit = JSON.parse(res.data);
        const latestHash = commit.sha.substring(0, 7);
        const commitMsg = commit.commit.message.split("\n")[0];

        let currentHash = "";
        try {
            currentHash = fs.readFileSync(HASH_FILE, "utf8").trim();
        } catch {}

        if (currentHash === latestHash) {
            console.log(`${C.green}✓${C.reset} Up to date ${C.dim}(${latestHash})${C.reset}\n`);
            return;
        }

        console.log(`\n${C.yellow}╔════════════════════════════════════════╗${C.reset}`);
        console.log(`${C.yellow}║${C.reset}         ${C.bright}UPDATE AVAILABLE!${C.reset}              ${C.yellow}║${C.reset}`);
        console.log(`${C.yellow}╚════════════════════════════════════════╝${C.reset}\n`);

        if (currentHash) console.log(`  ${C.dim}Current:${C.reset} ${currentHash}`);
        console.log(`  ${C.dim}Latest:${C.reset}  ${C.green}${latestHash}${C.reset}`);
        console.log(`  ${C.dim}Changes:${C.reset} ${commitMsg}\n`);

        const answer = Ask(`${C.yellow}Update now?${C.reset} (y/n): `);
        if (!["y", "yes"].includes(answer.toLowerCase().trim())) {
            console.log(`${C.dim}Skipped. Run again to update later.${C.reset}\n`);
            return;
        }

        const tempDir = path.join(__dirname, ".update_temp");
        const zipPath = path.join(tempDir, "update.zip");

        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, {
            recursive: true
        });

        console.log(`\n  ${C.cyan}Downloading latest code...${C.reset}`);
        await DownloadFile(`https://github.com/${GITHUB_REPO}/archive/refs/heads/${BRANCH}.zip`, zipPath);

        console.log(`  ${C.cyan}Extracting...${C.reset}`);
        const AdmZip = require("adm-zip");
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(tempDir, true);

        const folders = fs.readdirSync(tempDir, {
            withFileTypes: true
        }).filter(e => e.isDirectory());
        if (folders.length === 0) throw new Error("Extraction failed");

        const srcDir = path.join(tempDir, folders[0].name);

        const preserve = ["node_modules", "Data", ".git", ".update_temp"];

        console.log(`  ${C.cyan}Installing update...${C.reset}`);
        const copyRecursive = (src, dest) => {
            if (!fs.existsSync(dest)) fs.mkdirSync(dest, {
                recursive: true
            });
            for (const item of fs.readdirSync(src, {
                    withFileTypes: true
                })) {
                if (preserve.includes(item.name)) continue;
                const s = path.join(src, item.name),
                    d = path.join(dest, item.name);
                item.isDirectory() ? copyRecursive(s, d) : fs.copyFileSync(s, d);
            }
        };
        copyRecursive(srcDir, __dirname);

        fs.writeFileSync(HASH_FILE, latestHash, "utf8");

        fs.rmSync(tempDir, {
            recursive: true,
            force: true
        });

        console.log(`  ${C.cyan}Checking dependencies...${C.reset}`);
        try {
            execSync("npm install", {
                stdio: "pipe"
            });
        } catch {}

        console.log(`\n${C.green}✓ Updated to ${latestHash}!${C.reset}`);
        console.log(`${C.yellow}Restarting...${C.reset}\n`);

        const args = process.argv.slice(1);
        require("child_process").spawn(process.argv[0], args, {
            stdio: "inherit",
            detached: true
        });
        process.exit(0);

    } catch (e) {
        console.log(`${C.dim}Update check failed: ${e.message}${C.reset}\n`);
    }
};

const PrintBanner = () => {
    console.log(`${C.bright}${C.cyan}╔═══════════════════════════════════════════════════════════════════╗${C.reset}`);
    console.log(`${C.bright}${C.cyan}║${C.reset}                         EXP Chest Opener                          ${C.bright}${C.cyan}║${C.reset}`);
    console.log(`${C.bright}${C.cyan}║${C.reset}                            ${C.dim}by @Jxnt${C.reset}                               ${C.bright}${C.cyan}║${C.reset}`);
    console.log(`${C.bright}${C.cyan}╚═══════════════════════════════════════════════════════════════════╝${C.reset}\n`);
};

let isDisplaying = false,
    lastDisplay = 0;
const GenBar = (cur, init) => {
    const pct = init > 0 ? (cur / init) * 100 : 0;
    const filled = Math.max(0, Math.min(40, Math.floor((cur / init) * 40)));
    const color = pct < 25 ? C.red : pct < 50 ? C.yellow : C.green;
    return `${color}${"█".repeat(filled)}${C.gray}${"░".repeat(40 - filled)}${C.reset} ${C.bright}${pct.toFixed(1)}%${C.reset}`;
};

const GetRewardValue = (txt) => {
    const n = txt.toUpperCase();
    if (n.includes("HUGE REWARD")) return 25_000_000;
    if (n.includes("4 BILLION")) return 4_000_000_000;
    if (n.includes("EXP") || n.includes("GAME CARD") || n.includes("$")) return 0;
    const m = txt.match(/([0-9,]+)/);
    if (m) {
        const v = parseInt(m[1].replace(/,/g, ""), 10);
        if (v >= 1000) return v;
    }
    return 0;
};

const DisplayUI = () => {
    const now = Date.now();
    if (isDisplaying || now - lastDisplay < 200) return;
    isDisplaying = true;
    lastDisplay = now;
    ClearConsole();
    const elapsed = now - Stats.StartTime;
    const rate = Stats.TotalOpened > 0 ? (Stats.TotalOpened / (elapsed / 3.6e6)).toFixed(0) : "0";
    const gemRate = Stats.TotalGems > 0 ? FormatShort(Stats.TotalGems / (elapsed / 3.6e6)) : "0";
    PrintBanner();
    const status = Stats.IsRunning ? `${C.green}● ACTIVE` : `${C.red}● STOPPED`;
    console.log(`  ${C.gray}┌─ Status${C.reset}         ${status}${C.reset}`);
    console.log(`  ${C.gray}├─ Runtime${C.reset}        ${C.bright}${FormatTime(elapsed)}${C.reset}`);
    console.log(`  ${C.gray}├─ Chests${C.reset}         ${C.bright}${C.yellow}${FormatNumber(Stats.TotalOpened)}${C.reset} ${C.dim}(${rate}/hr)${C.reset}`);
    console.log(`  ${C.gray}└─ Gems${C.reset}           ${C.bright}${C.green}${FormatShort(Stats.TotalGems)}${C.reset} ${C.dim}(${gemRate}/hr)${C.reset}\n`);
    console.log(`  ${C.blue}${C.bright}------ EXP TRACKER ------${C.reset}\n`);
    console.log(`  ${GenBar(Stats.CurrentEXP, Stats.InitialEXP)}`);
    console.log(`  ${C.gray}Current:${C.reset} ${C.bright}${FormatNumber(Stats.CurrentEXP)} EXP${C.reset} ${C.dim}(${Stats.ChestsRemaining} chests)${C.reset}`);
    console.log(`  ${C.gray}Gained:${C.reset}  ${C.green}+${FormatNumber(Stats.EXPGained)}${C.reset}  ${C.gray}Spent:${C.reset} ${C.red}-${FormatShort(Stats.EXPSpent)}${C.reset}\n`);
    console.log(`  ${C.bright}${C.blue}------ REWARDS ------${C.reset}\n`);
    if (Stats.LastReward) console.log(`  ${C.gray}Last:${C.reset} ${Stats.LastReward}\n`);
    if (Object.keys(Stats.Rewards).length === 0) {
        console.log(`  ${C.dim}No rewards yet...${C.reset}\n`);
    } else {
        Object.entries(Stats.Rewards).sort((a, b) => GetRewardValue(b[0]) - GetRewardValue(a[0]))
            .forEach(([r, c]) => console.log(`  ${C.cyan}${c}x${C.reset} (${((c / Stats.TotalOpened) * 100).toFixed(2)}%) ${r}`));
        console.log();
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
const SaveToken = (t) => {
    try {
        fs.writeFileSync(TOKEN_FILE, t, "utf8");
        console.log(`${C.green}✓${C.reset} Token saved!`);
    } catch {}
};
const LoadRewards = () => {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const d = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
            Stats.AllTimeRewards = d.Rewards || {};
            Stats.AllTimeGems = d.TotalGems || 0;
            Stats.AllTimeEXPSpent = d.TotalEXPSpent || 0;
            Stats.AllTimeEXPGained = d.TotalEXPGained || 0;
            Stats.AllTimeChestsOpened = d.TotalChestsOpened || 0;
        }
    } catch {}
};
const SaveRewards = () => {
    try {
        const merged = {
            ...Stats.AllTimeRewards
        };
        for (const [r, c] of Object.entries(Stats.Rewards)) merged[r] = (merged[r] || 0) + c;
        fs.writeFileSync(DATA_FILE, JSON.stringify({
            Rewards: merged,
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
    const saved = LoadToken();
    if (saved) {
        const use = Ask(`${C.gray}Use saved token?${C.reset} (y/n): `);
        if (["y", "yes"].includes(use.toLowerCase())) return saved;
        console.log();
    }
    console.log(`${C.yellow}!${C.reset} ${C.bright}Enter your Discord Token.${C.reset}\n`);
    const token = AskHidden(`${C.gray}Token:${C.reset} `);
    if (!token?.trim()) {
        console.log(`\n${C.red}✗${C.reset} Invalid token`);
        process.exit(1);
    }
    const save = Ask(`${C.gray}Save token?${C.reset} (y/n): `);
    if (["y", "yes"].includes(save.toLowerCase())) SaveToken(token);
    return token.trim();
};

let pendingResolve = null,
    pendingTimeout = null;
const Strip = (t) => t.replace(/<a?:[^:>]+:\d+>/g, "");
const Norm = (t) => Strip(t).replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim();
const ParseReward = (d) => {
    if (d.embeds?.[0]?.description) {
        const t = Norm(d.embeds[0].description);
        if (t) return t;
    }
    if (d.embeds?.[0]?.title) {
        const t = Norm(d.embeds[0].title);
        if (t) return t;
    }
    if (d.content) {
        const t = Norm(d.content.split("\n")[0]);
        if (t) return t;
    }
    return "Unknown reward";
};
const ParseEXP = (d) => {
    const m = (d.content || "").match(/([0-9,]+)\s*EXP/i) || `${d.embeds?.[0]?.title || ""} ${d.embeds?.[0]?.description || ""}`.match(/([0-9,]+)\s*EXP/i);
    return m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
};
const WaitForReward = () => new Promise((resolve) => {
    if (pendingTimeout) clearTimeout(pendingTimeout);
    pendingResolve = resolve;
    pendingTimeout = setTimeout(() => {
        if (pendingResolve === resolve) pendingResolve = null;
        pendingTimeout = null;
        resolve(null);
    }, 7000);
});

client.on("raw", (pkt) => {
    if (pkt.t !== "MESSAGE_CREATE" || !pendingResolve) return;
    const d = pkt.d;
    if (d.channel_id !== CONFIG.CHANNEL_ID || d.author?.id !== CONFIG.EXP_BOT_ID) return;
    if ((d.flags & 64) === 0 || d.interaction_metadata?.user?.id !== client.user?.id) return;
    const refId = d.message_reference?.message_id,
        intId = d.interaction_metadata?.interacted_message_id;
    if (refId !== CONFIG.MESSAGE_ID && intId !== CONFIG.MESSAGE_ID) return;
    const txt = ParseReward(d),
        exp = txt.toLowerCase().includes("exp") ? ParseEXP(d) : 0;
    const full = `${Norm(d.content || "")} ${Norm(d.embeds?.[0]?.description || "")}`.toLowerCase();
    const resolve = pendingResolve;
    pendingResolve = null;
    if (pendingTimeout) {
        clearTimeout(pendingTimeout);
        pendingTimeout = null;
    }
    resolve({
        rewardText: txt,
        expGained: exp,
        isCooldown: full.includes("cooldown"),
        isNoEXP: full.includes("don't have enough")
    });
});

const GetInitialEXP = async () => {
    try {
        const ch = await client.channels.fetch(CONFIG.CHANNEL_ID);
        const msg = await ch.messages.fetch(CONFIG.MESSAGE_ID);
        const btn = msg.components?.[0]?.components?.[0];
        if (!btn) return 0;
        const promise = WaitForReward();
        await msg.clickButton(btn.customId);
        await Sleep(3000);
        const res = await promise;
        if (res?.rewardText) {
            const m = res.rewardText.match(/Balance:\s*([0-9,]+)/i) || res.rewardText.match(/([0-9,]+)/);
            if (m) return parseInt(m[1].replace(/,/g, ""), 10);
        }
        return 0;
    } catch {
        return 0;
    }
};

const OpenChest = async () => {
    try {
        const ch = await client.channels.fetch(CONFIG.CHANNEL_ID);
        const msg = await ch.messages.fetch(CONFIG.MESSAGE_ID);
        const btns = msg.components?.[0]?.components;
        const btn = btns?.find((c) => c.label === "Open Chest") || btns?.[1];
        if (!btn) return false;
        const promise = WaitForReward();
        await msg.clickButton(btn.customId);
        const res = await promise;
        if (!res) {
            if (++Stats.FailedAttempts >= Stats.MaxFailedAttempts) {
                Stats.IsRunning = false;
                SaveRewards();
                process.exit(0);
            }
            return false;
        }
        if (res.isCooldown) return false;
        if (res.isNoEXP) {
            Stats.IsRunning = false;
            SaveRewards();
            process.exit(0);
        }
        if (res.rewardText.toLowerCase().includes("recent winners")) return false;
        Stats.FailedAttempts = 0;
        Stats.Rewards[res.rewardText] = (Stats.Rewards[res.rewardText] || 0) + 1;
        Stats.LastReward = res.rewardText;
        Stats.TotalOpened++;
        Stats.TotalGems += GetRewardValue(res.rewardText);
        Stats.CurrentEXP -= CONFIG.CHEST_COST;
        Stats.EXPSpent += CONFIG.CHEST_COST;
        Stats.EXPGained += res.expGained;
        Stats.CurrentEXP += res.expGained;
        Stats.ChestsRemaining = Math.floor(Stats.CurrentEXP / CONFIG.CHEST_COST);
        SaveRewards();
        return true;
    } catch {
        if (++Stats.FailedAttempts >= Stats.MaxFailedAttempts) {
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
    console.log(`${C.green}✓${C.reset} Logged in as ${C.bright}${client.user.tag}${C.reset}`);
    LoadRewards();
    let spin = ShowSpinner("Getting EXP...");
    const exp = await GetInitialEXP();
    StopSpinner(spin);
    if (exp > 0) {
        Stats.InitialEXP = Stats.CurrentEXP = exp;
        Stats.ChestsRemaining = Math.floor(exp / CONFIG.CHEST_COST);
        console.log(`${C.green}✓${C.reset} EXP: ${C.bright}${FormatNumber(exp)}${C.reset} (${Stats.ChestsRemaining} chests)`);
    }
    spin = ShowSpinner("Starting...");
    await Sleep(2000);
    StopSpinner(spin);
    MainLoop();
});

(async () => {
    try {
        ClearConsole();
        PrintBanner();
        console.log(`${C.dim}Checking for updates...${C.reset}\n`);
        await CheckForUpdates();
        CONFIG.TOKEN = await GetToken();
        console.log();
        const spin = ShowSpinner("Logging in...");
        client.login(CONFIG.TOKEN).then(() => StopSpinner(spin)).catch((e) => {
            StopSpinner(spin, `${C.red}✗${C.reset} Login failed`);
            console.log(`${C.red}Error:${C.reset} ${e.message}\n`);
            process.exit(1);
        });
    } catch (e) {
        console.error(`\n${C.red}✗${C.reset} Error:`, e.message);
        process.exit(1);
    }
})();
